import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPromotionSchema, insertPaidAdCampaignSchema, insertLocationSchema } from "@shared/schema";
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

  // Helper function to upsert campaign location metrics (prevent duplicates on re-upload)
  async function upsertCampaignLocationMetric(metric: InsertCampaignLocationMetric) {
    const existing = await storage.getCampaignLocationMetricByKey(
      metric.campaignId,
      metric.locationId ?? null,
      metric.dateStart ?? null
    );
    
    if (existing) {
      // Metric already exists for this campaign/location/date, skip it
      return existing;
    }
    
    return await storage.createCampaignLocationMetric(metric);
  }

  // Marketing data upload endpoint
  app.post("/api/upload/marketing", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { platform, clientId, dataType } = req.body;
      
      if (!platform || !clientId || !dataType) {
        return res.status(400).json({ error: "Platform, clientId, and dataType are required" });
      }

      const rows = parseCSV(req.file.buffer);
      let processedCount = 0;
      const campaignsProcessed = new Map<string, { name: string; type: string; startDate: string; endDate: string | null; totals: { orders: number; revenue: number; spend: number; discount: number; newCustomers: number } }>();

      if (platform === "doordash" && dataType === "promotions") {
        // DoorDash Promotions CSV
        for (const row of rows) {
          const campaignId = row["Campaign Id"];
          const campaignName = row["Campaign Name"] || `Campaign ${campaignId}`;
          const startDate = row["Campaign Start Date"];
          const endDate = row["Campaign End Date"] === "None" ? null : row["Campaign End Date"];
          
          const locationId = await findOrCreateLocation(clientId, row["Store Name"], "doordash");
          
          const revenue = parseFloat(row["Sales"]) || 0;
          const spend = parseFloat(row["Marketing Fees | (Including any applicable taxes)"]) || 0;
          const discount = parseFloat(row["Customer Discounts from Marketing | (Funded by you)"]) || 0;
          const orders = parseInt(row["Orders"]) || 0;
          const roas = parseFloat(row["ROAS"]) || 0;
          const newCustomers = parseInt(row["New Cx Acquired"]) || 0;
          
          // Aggregate campaign-level totals
          if (!campaignsProcessed.has(campaignId)) {
            campaignsProcessed.set(campaignId, {
              name: campaignName,
              type: "promotion",
              startDate,
              endDate,
              totals: { orders: 0, revenue: 0, spend: 0, discount: 0, newCustomers: 0 }
            });
          }
          const campaign = campaignsProcessed.get(campaignId)!;
          campaign.totals.orders += orders;
          campaign.totals.revenue += revenue;
          campaign.totals.spend += spend;
          campaign.totals.discount += discount;
          campaign.totals.newCustomers += newCustomers;
          
          // Store location-level metrics (upsert to prevent duplicates)
          await upsertCampaignLocationMetric({
            campaignId,
            campaignType: "promotion",
            clientId,
            locationId,
            locationName: row["Store Name"],
            platform: "doordash",
            dateStart: startDate,
            dateEnd: endDate,
            orders,
            revenue,
            spend,
            discount,
            roas,
            newCustomers,
          });
          
          processedCount++;
        }
        
        // Create promotion records
        for (const [campaignId, data] of campaignsProcessed) {
          const existing = await storage.getPromotionByCampaignId(campaignId);
          if (!existing) {
            await storage.createPromotion({
              campaignId,
              name: data.name,
              clientId,
              platforms: ["doordash"],
              type: data.type,
              status: "active",
              startDate: data.startDate,
              endDate: data.endDate,
              discountPercent: null,
              discountAmount: data.totals.discount > 0 ? data.totals.discount : null,
            });
          }
        }
      } else if (platform === "doordash" && dataType === "ads") {
        // DoorDash Ads CSV - Paid Ad Campaigns
        const adCampaignsData = new Map<string, { name: string; startDate: string; endDate: string | null; totals: { impressions: number; clicks: number; orders: number; revenue: number; spend: number; cpa: number } }>();
        
        for (const row of rows) {
          const campaignId = row["Campaign Id"];
          const campaignName = row["Campaign Name"] || `Ad Campaign ${campaignId}`;
          const startDate = row["Campaign Start Date"];
          const endDate = row["Campaign End Date"] === "None" ? null : row["Campaign End Date"];
          
          const locationId = await findOrCreateLocation(clientId, row["Store Name"], "doordash");
          
          const clicks = parseInt(row["Clicks"]) || 0;
          const orders = parseInt(row["Orders"]) || 0;
          const revenue = parseFloat(row["Sales"]) || 0;
          const spend = parseFloat(row["Marketing Fees | (Including any applicable taxes)"]) || 0;
          const roas = parseFloat(row["ROAS"]) || 0;
          const cpa = parseFloat(row["Average CPA"]) || 0;
          const newCustomers = parseInt(row["New Cx Acquired"]) || 0;
          
          // Aggregate campaign-level totals
          if (!adCampaignsData.has(campaignId)) {
            adCampaignsData.set(campaignId, {
              name: campaignName,
              startDate,
              endDate,
              totals: { impressions: 0, clicks: 0, orders: 0, revenue: 0, spend: 0, cpa: 0 }
            });
          }
          const campaign = adCampaignsData.get(campaignId)!;
          campaign.totals.clicks += clicks;
          campaign.totals.orders += orders;
          campaign.totals.revenue += revenue;
          campaign.totals.spend += spend;
          if (cpa > 0) campaign.totals.cpa = cpa; // Use last seen CPA value
          
          await upsertCampaignLocationMetric({
            campaignId,
            campaignType: "paid_ad",
            clientId,
            locationId,
            locationName: row["Store Name"],
            platform: "doordash",
            dateStart: startDate,
            dateEnd: endDate,
            clicks,
            orders,
            revenue,
            spend,
            roas,
            cpa,
            newCustomers,
          });
          
          processedCount++;
        }
        
        // Create paid ad campaign records
        for (const [campaignId, data] of adCampaignsData) {
          const existing = await storage.getPaidAdCampaignByCampaignId(campaignId);
          if (!existing) {
            await storage.createPaidAdCampaign({
              campaignId,
              name: data.name,
              clientId,
              platform: "doordash",
              type: "paid_ad",
              status: "active",
              startDate: data.startDate,
              endDate: data.endDate,
              budget: null,
              impressions: data.totals.impressions,
              clicks: data.totals.clicks,
              ctr: data.totals.clicks / (data.totals.impressions || 1),
              cpc: data.totals.spend / (data.totals.clicks || 1),
              orders: data.totals.orders,
              conversionRate: (data.totals.orders / (data.totals.clicks || 1)) * 100,
              spend: data.totals.spend,
              revenue: data.totals.revenue,
              roas: data.totals.revenue / (data.totals.spend || 1),
              cpa: data.totals.cpa,
            });
          }
        }
      } else if (platform === "uber" && dataType === "campaigns") {
        // Uber Campaign Location CSV - Paid Ad Campaigns
        const uberCampaignsData = new Map<string, { name: string; startDate: string; endDate: string | null; totals: { impressions: number; clicks: number; orders: number; revenue: number; spend: number; ctr: number; cpc: number; cpa: number; conversionRate: number } }>();
        
        for (const row of rows) {
          // Use Campaign UUID as the primary identifier (not Location UUID)
          const campaignId = row["Campaign UUID"];
          if (!campaignId) {
            console.warn("Skipping row without Campaign UUID");
            continue;
          }
          
          const campaignName = row["Campaign name"] || `Uber Campaign ${campaignId.substring(0, 8)}`;
          const locationName = row["Location name"];
          const startDate = row["Start date"];
          const endDate = row["End date"];
          
          const locationId = await findOrCreateLocation(clientId, locationName, "ubereats");
          
          const impressions = parseInt(row["Impressions"]) || 0;
          const clicks = parseInt(row["Clicks"]) || 0;
          const orders = parseInt(row["Orders"]) || 0;
          const revenue = parseFloat(row["Sales"]?.replace(/,/g, "")) || 0;
          const spend = parseFloat(row["Ad spend"]) || 0;
          const roas = parseFloat(row["Return on Ad Spend"]) || 0;
          const ctr = parseFloat(row["Click through rate"]) || 0;
          const conversionRate = parseFloat(row["Conversion rate"]) || 0;
          const cpc = parseFloat(row["Cost per click"]) || 0;
          const cpa = parseFloat(row["Cost per order"]) || 0;
          
          // Aggregate campaign-level totals
          if (!uberCampaignsData.has(campaignId)) {
            uberCampaignsData.set(campaignId, {
              name: campaignName,
              startDate,
              endDate,
              totals: { impressions: 0, clicks: 0, orders: 0, revenue: 0, spend: 0, ctr: 0, cpc: 0, cpa: 0, conversionRate: 0 }
            });
          }
          const campaign = uberCampaignsData.get(campaignId)!;
          campaign.totals.impressions += impressions;
          campaign.totals.clicks += clicks;
          campaign.totals.orders += orders;
          campaign.totals.revenue += revenue;
          campaign.totals.spend += spend;
          
          await upsertCampaignLocationMetric({
            campaignId,
            campaignType: "paid_ad",
            clientId,
            locationId,
            locationName,
            platform: "ubereats",
            dateStart: startDate,
            dateEnd: endDate,
            impressions,
            clicks,
            orders,
            revenue,
            spend,
            roas,
            ctr,
            conversionRate,
            cpc,
            cpa,
          });
          
          processedCount++;
        }
        
        // Create paid ad campaign records
        for (const [campaignId, data] of uberCampaignsData) {
          const existing = await storage.getPaidAdCampaignByCampaignId(campaignId);
          if (!existing) {
            await storage.createPaidAdCampaign({
              campaignId,
              name: data.name,
              clientId,
              platform: "ubereats",
              type: "paid_ad",
              status: "active",
              startDate: data.startDate,
              endDate: data.endDate,
              budget: null,
              impressions: data.totals.impressions,
              clicks: data.totals.clicks,
              ctr: data.totals.clicks / (data.totals.impressions || 1),
              cpc: data.totals.spend / (data.totals.clicks || 1),
              orders: data.totals.orders,
              conversionRate: (data.totals.orders / (data.totals.clicks || 1)) * 100,
              spend: data.totals.spend,
              revenue: data.totals.revenue,
              roas: data.totals.revenue / (data.totals.spend || 1),
              cpa: data.totals.spend / (data.totals.orders || 1),
            });
          }
        }
      } else if (platform === "uber" && dataType === "offers") {
        // Uber Offers/Campaigns CSV - Promotions
        const uberOffersData = new Map<string, { name: string; startDate: string; endDate: string | null; totals: { orders: number; revenue: number; newCustomers: number } }>();
        
        for (const row of rows) {
          const campaignId = row["Campaign UUID"];
          const campaignName = row["Campaign name"] || `Uber Offer ${campaignId.substring(0, 8)}`;
          const startDate = row["Start date"];
          const endDate = row["End date"];
          
          const revenue = parseFloat(row["Sales (USD)"]?.replace(/[$,]/g, "")) || 0;
          const orders = parseInt(row["Orders"]) || 0;
          const newCustomers = parseInt(row["New customers"]) || 0;
          
          // Aggregate campaign-level totals
          if (!uberOffersData.has(campaignId)) {
            uberOffersData.set(campaignId, {
              name: campaignName,
              startDate,
              endDate,
              totals: { orders: 0, revenue: 0, newCustomers: 0 }
            });
          }
          const campaign = uberOffersData.get(campaignId)!;
          campaign.totals.orders += orders;
          campaign.totals.revenue += revenue;
          campaign.totals.newCustomers += newCustomers;
          
          // Note: This CSV doesn't have location-level data, so we'll create a single aggregate record
          await upsertCampaignLocationMetric({
            campaignId,
            campaignType: "promotion",
            clientId,
            locationId: null,
            locationName: "All Stores",
            platform: "ubereats",
            dateStart: startDate,
            dateEnd: endDate,
            orders,
            revenue,
            spend: 0,
            newCustomers,
          });
          
          processedCount++;
        }
        
        // Create promotion records
        for (const [campaignId, data] of uberOffersData) {
          const existing = await storage.getPromotionByCampaignId(campaignId);
          if (!existing) {
            await storage.createPromotion({
              campaignId,
              name: data.name,
              clientId,
              platforms: ["ubereats"],
              type: "promotion",
              status: "active",
              startDate: data.startDate,
              endDate: data.endDate,
              discountPercent: null,
              discountAmount: null,
            });
          }
        }
      } else {
        return res.status(400).json({ error: `Unsupported platform/dataType combination: ${platform}/${dataType}` });
      }

      res.json({
        success: true,
        rowsProcessed: processedCount,
      });
    } catch (error: any) {
      console.error("Marketing upload error:", error);
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

  app.post("/api/locations", async (req, res) => {
    try {
      const validatedData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(validatedData);
      res.status(201).json(location);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Invalid location data", details: error.errors });
      }
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

  app.get("/api/promotions", async (req, res) => {
    try {
      const { clientId } = req.query;
      const promotions = await storage.getAllPromotions(clientId as string);
      res.json(promotions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/promotions", async (req, res) => {
    try {
      const validatedData = insertPromotionSchema.parse(req.body);
      const promotion = await storage.createPromotion(validatedData);
      res.json(promotion);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/promotions/:id", async (req, res) => {
    try {
      const promotion = await storage.getPromotion(req.params.id);
      if (!promotion) {
        return res.status(404).json({ error: "Promotion not found" });
      }
      res.json(promotion);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/promotions/:id", async (req, res) => {
    try {
      const validatedData = insertPromotionSchema.partial().parse(req.body);
      const updated = await storage.updatePromotion(req.params.id, validatedData);
      if (!updated) {
        return res.status(404).json({ error: "Promotion not found" });
      }
      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/promotions/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePromotion(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Promotion not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/promotions", async (req, res) => {
    try {
      const { clientId } = req.query;
      const metrics = await storage.getPromotionMetrics(clientId as string);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paid-ads", async (req, res) => {
    try {
      const { clientId } = req.query;
      const campaigns = await storage.getAllPaidAdCampaigns(clientId as string);
      res.json(campaigns);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/paid-ads", async (req, res) => {
    try {
      const validatedData = insertPaidAdCampaignSchema.parse(req.body);
      const campaign = await storage.createPaidAdCampaign(validatedData);
      res.json(campaign);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/paid-ads/:id", async (req, res) => {
    try {
      const campaign = await storage.getPaidAdCampaign(req.params.id);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/paid-ads/:id", async (req, res) => {
    try {
      const validatedData = insertPaidAdCampaignSchema.partial().parse(req.body);
      const updated = await storage.updatePaidAdCampaign(req.params.id, validatedData);
      if (!updated) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(updated);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/paid-ads/:id", async (req, res) => {
    try {
      const deleted = await storage.deletePaidAdCampaign(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/paid-ads", async (req, res) => {
    try {
      const { clientId } = req.query;
      const metrics = await storage.getPaidAdCampaignMetrics(clientId as string);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/location-weekly-financials", async (req, res) => {
    try {
      const { clientId, locationId } = req.query;
      
      if (locationId) {
        const financials = await storage.getLocationWeeklyFinancials(locationId as string);
        res.json(financials);
      } else if (clientId) {
        const financials = await storage.getLocationWeeklyFinancialsByClient(clientId as string);
        res.json(financials);
      } else {
        res.status(400).json({ error: "Either clientId or locationId is required" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
