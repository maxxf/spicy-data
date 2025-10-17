import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

function parseCSV(buffer: Buffer): any[] {
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = (s1: string, s2: string): number => {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  const distance = editDistance(shorter, longer);
  return (longer.length - distance) / longer.length;
}

async function findOrCreateLocation(
  clientId: string,
  locationName: string,
  platform: "ubereats" | "doordash" | "grubhub"
): Promise<string> {
  const existingLocation = await storage.findLocationByName(clientId, locationName, platform);
  
  if (existingLocation) {
    return existingLocation.id;
  }

  const allLocations = await storage.getLocationsByClient(clientId);
  
  let bestMatch: { location: any; score: number } | null = null;
  for (const loc of allLocations) {
    const canonicalSimilarity = calculateStringSimilarity(locationName, loc.canonicalName);
    
    let platformSimilarity = 0;
    if (platform === "ubereats" && loc.uberEatsName) {
      platformSimilarity = calculateStringSimilarity(locationName, loc.uberEatsName);
    } else if (platform === "doordash" && loc.doordashName) {
      platformSimilarity = calculateStringSimilarity(locationName, loc.doordashName);
    } else if (platform === "grubhub" && loc.grubhubName) {
      platformSimilarity = calculateStringSimilarity(locationName, loc.grubhubName);
    }

    const score = Math.max(canonicalSimilarity, platformSimilarity);
    
    if (score >= 0.8 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { location: loc, score };
    }
  }

  if (bestMatch) {
    const updates: any = {};
    if (platform === "ubereats") updates.uberEatsName = locationName;
    if (platform === "doordash") updates.doordashName = locationName;
    if (platform === "grubhub") updates.grubhubName = locationName;
    
    await storage.updateLocation(bestMatch.location.id, updates);
    return bestMatch.location.id;
  }

  const newLocation = await storage.createLocation({
    clientId,
    canonicalName: locationName,
    uberEatsName: platform === "ubereats" ? locationName : null,
    doordashName: platform === "doordash" ? locationName : null,
    grubhubName: platform === "grubhub" ? locationName : null,
    isVerified: false,
  });

  return newLocation.id;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/clients", async (req, res) => {
    try {
      const clients = await storage.getAllClients();
      res.json(clients);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Name is required" });
      }

      const client = await storage.createClient({ name });
      res.json(client);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { platform, clientId } = req.body;
      
      if (!platform || !clientId) {
        return res.status(400).json({ error: "Platform and clientId are required" });
      }

      const rows = parseCSV(req.file.buffer);

      if (platform === "ubereats") {
        for (const row of rows) {
          const locationId = await findOrCreateLocation(clientId, row.Location, "ubereats");

          await storage.createUberEatsTransaction({
            clientId,
            locationId,
            orderId: row.Order_ID,
            date: row.Date,
            time: row.Time,
            location: row.Location,
            subtotal: parseFloat(row.Subtotal) || 0,
            tax: parseFloat(row.Tax) || 0,
            deliveryFee: parseFloat(row.Delivery_Fee) || 0,
            serviceFee: parseFloat(row.Service_Fee) || 0,
            marketingPromo: row.Marketing_Promo || null,
            marketingAmount: parseFloat(row.Marketing_Amount) || 0,
            platformFee: parseFloat(row.Platform_Fee) || 0,
            netPayout: parseFloat(row.Net_Payout) || 0,
            customerRating: row.Customer_Rating ? parseInt(row.Customer_Rating) : null,
          });
        }
      } else if (platform === "doordash") {
        for (const row of rows) {
          const locationId = await findOrCreateLocation(clientId, row.Store_Location, "doordash");

          await storage.createDoordashTransaction({
            clientId,
            locationId,
            orderNumber: row.Order_Number,
            transactionDate: row.Transaction_Date,
            storeLocation: row.Store_Location,
            orderSubtotal: parseFloat(row.Order_Subtotal) || 0,
            taxes: parseFloat(row.Taxes) || 0,
            deliveryFees: parseFloat(row.Delivery_Fees) || 0,
            commission: parseFloat(row.Commission) || 0,
            marketingSpend: parseFloat(row.Marketing_Spend) || 0,
            errorCharges: parseFloat(row.Error_Charges) || 0,
            netPayment: parseFloat(row.Net_Payment) || 0,
            orderSource: row.Order_Source || "Unknown",
          });
        }
      } else if (platform === "grubhub") {
        for (const row of rows) {
          const locationId = await findOrCreateLocation(clientId, row.Restaurant, "grubhub");

          await storage.createGrubhubTransaction({
            clientId,
            locationId,
            orderId: row.Order_Id,
            orderDate: row.Order_Date,
            restaurant: row.Restaurant,
            saleAmount: parseFloat(row.Sale_Amount) || 0,
            taxAmount: parseFloat(row.Tax_Amount) || 0,
            deliveryCharge: parseFloat(row.Delivery_Charge) || 0,
            processingFee: parseFloat(row.Processing_Fee) || 0,
            promotionCost: parseFloat(row.Promotion_Cost) || 0,
            netSales: parseFloat(row.Net_Sales) || 0,
            customerType: row.Customer_Type || "Unknown",
          });
        }
      }

      res.json({ success: true, rowsProcessed: rows.length });
    } catch (error: any) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/locations", async (req, res) => {
    try {
      const { clientId } = req.query;
      const locations = clientId
        ? await storage.getLocationsByClient(clientId as string)
        : await storage.getAllLocations();
      res.json(locations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/locations/suggestions", async (req, res) => {
    try {
      const { clientId } = req.query;
      const suggestions = await storage.getLocationMatchSuggestions(clientId as string);
      res.json(suggestions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/locations/match", async (req, res) => {
    try {
      const { locationName, platform, matchedLocationId } = req.body;

      if (!locationName || !platform || !matchedLocationId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const updates: any = {};
      if (platform === "ubereats") updates.uberEatsName = locationName;
      if (platform === "doordash") updates.doordashName = locationName;
      if (platform === "grubhub") updates.grubhubName = locationName;

      const updated = await storage.updateLocation(matchedLocationId, updates);
      
      if (!updated) {
        return res.status(404).json({ error: "Location not found" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const { clientId } = req.query;
      const overview = await storage.getDashboardOverview(clientId as string);
      res.json(overview);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/client-performance", async (req, res) => {
    try {
      const performance = await storage.getClientPerformance();
      res.json(performance);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/locations", async (req, res) => {
    try {
      const { clientId } = req.query;
      const metrics = await storage.getLocationMetrics(clientId as string);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
