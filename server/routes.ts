import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPromotionSchema, insertPaidAdCampaignSchema, insertLocationSchema, insertLocationWeeklyFinancialSchema, type AnalyticsFilters } from "@shared/schema";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

function parseCSV(buffer: Buffer, platform?: string): any[] {
  // Uber Eats CSVs have 2 header rows - skip the first (description) row
  if (platform === "ubereats") {
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      from_line: 2, // Skip first row (descriptions), use second row (actual column names)
    });
  }
  
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
  platform: "ubereats" | "doordash" | "grubhub",
  storeId?: string
): Promise<string> {
  // Priority 1: Match by Store ID if provided (cross-platform unique identifier)
  if (storeId) {
    const allLocations = await storage.getLocationsByClient(clientId);
    const locationByStoreId = allLocations.find(l => l.storeId === storeId);
    if (locationByStoreId) {
      // Update platform-specific name if not already set
      const updates: any = {};
      if (platform === "ubereats" && !locationByStoreId.uberEatsName) {
        updates.uberEatsName = locationName;
      } else if (platform === "doordash" && !locationByStoreId.doordashName) {
        updates.doordashName = locationName;
      } else if (platform === "grubhub" && !locationByStoreId.grubhubName) {
        updates.grubhubName = locationName;
      }
      if (Object.keys(updates).length > 0) {
        await storage.updateLocation(locationByStoreId.id, updates);
      }
      return locationByStoreId.id;
    }
  }

  // Priority 2: Check existing location by platform-specific name
  const existingLocation = await storage.findLocationByName(clientId, locationName, platform);
  
  if (existingLocation) {
    // Update with Store ID if not already set
    if (storeId && !existingLocation.storeId) {
      await storage.updateLocation(existingLocation.id, { 
        storeId,
        canonicalName: storeId // Use Store ID as canonical name
      });
    }
    return existingLocation.id;
  }

  // Priority 3: Fuzzy matching
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
    if (storeId && !bestMatch.location.storeId) {
      updates.storeId = storeId;
      updates.canonicalName = storeId;
    }
    
    await storage.updateLocation(bestMatch.location.id, updates);
    return bestMatch.location.id;
  }

  // Create new location with Store ID
  const newLocation = await storage.createLocation({
    clientId,
    storeId: storeId || null,
    canonicalName: storeId || locationName, // Use Store ID as canonical if available
    uberEatsName: platform === "ubereats" ? locationName : null,
    doordashName: platform === "doordash" ? locationName : null,
    grubhubName: platform === "grubhub" ? locationName : null,
    isVerified: storeId ? true : false, // Auto-verify if we have Store ID
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

      const rows = parseCSV(req.file.buffer, platform);

      if (platform === "ubereats") {
        for (const row of rows) {
          // Use row 2 column names (Store ID, Store Name, Order ID, etc.)
          const storeId = row["Store ID"] || row.Store_ID || row.store_id || null;
          const locationName = row["Store Name"] || row.Location || "";
          const locationId = await findOrCreateLocation(clientId, locationName, "ubereats", storeId);

          // Skip rows without order ID
          const orderId = row["Order ID"] || row.Order_ID;
          if (!orderId || orderId.trim() === "") {
            continue;
          }

          await storage.createUberEatsTransaction({
            clientId,
            locationId,
            orderId,
            date: row["Order Date"] || row.Date || "",
            time: row["Order Accept Time"] || row.Time || "",
            location: locationName,
            subtotal: parseFloat(row["Sales (excl. tax)"] || row.Subtotal) || 0,
            tax: parseFloat(row["Tax on Sales"] || row.Tax) || 0,
            deliveryFee: parseFloat(row["Delivery Fee"] || row.Delivery_Fee) || 0,
            serviceFee: parseFloat(row["Service Fee"] || row.Service_Fee) || 0,
            marketingPromo: row["Marketing Promotion"] || row.Marketing_Promo || null,
            marketingAmount: parseFloat(row["Marketing Adjustment"] || row.Marketing_Amount) || 0,
            platformFee: parseFloat(row["Marketplace Fee"] || row.Platform_Fee) || 0,
            netPayout: parseFloat(row["Total payout "] || row["Total payout"] || row.Net_Payout) || 0,
            customerRating: null,
          });
        }
      } else if (platform === "doordash") {
        // Per new attribution methodology: Only process Marketplace + Completed orders for metrics
        // But we import ALL orders to calculate net payout correctly
        let processedCount = 0;
        
        for (const row of rows) {
          const storeId = row["Store ID"] || row.Store_ID || row.store_id || null;
          const locationName = row["Store name"] || row["Store Name"] || row.Store_Location || row["Store Location"] || row.store_location || "";
          const locationId = await findOrCreateLocation(
            clientId, 
            locationName, 
            "doordash",
            storeId
          );

          // Helper to safely parse negative values (discounts/offers are negative in CSV)
          const parseNegativeFloat = (val: any) => {
            if (!val) return 0;
            const parsed = parseFloat(val);
            return isNaN(parsed) ? 0 : parsed;
          };

          await storage.createDoordashTransaction({
            clientId,
            locationId,
            
            // Order identification
            orderNumber: row.Order_Number || row["Order Number"] || row.order_number || "",
            transactionDate: row.Transaction_Date || row["Transaction Date"] || row.transaction_date || "",
            storeLocation: row.Store_Location || row["Store Location"] || row.store_location || "",
            
            // Status and channel filtering fields
            channel: row.Channel || row.channel || null,
            orderStatus: row.Order_Status || row["Order Status"] || row.order_status || null,
            
            // Sales metrics (new methodology uses "Sales (excl. tax)")
            salesExclTax: parseNegativeFloat(row["Sales (excl. tax)"] || row.sales_excl_tax || row.salesExclTax),
            orderSubtotal: parseNegativeFloat(row.Order_Subtotal || row["Order Subtotal"] || row.order_subtotal),
            taxes: parseNegativeFloat(row.Taxes || row.taxes),
            
            // Fees and charges
            deliveryFees: parseNegativeFloat(row.Delivery_Fees || row["Delivery Fees"] || row.delivery_fees),
            commission: parseNegativeFloat(row.Commission || row.commission),
            errorCharges: parseNegativeFloat(row.Error_Charges || row["Error Charges"] || row.error_charges),
            
            // Marketing/promotional fields (typically negative for discounts)
            offersOnItems: parseNegativeFloat(row["Offers on items (incl. tax)"] || row.offers_on_items),
            deliveryOfferRedemptions: parseNegativeFloat(row["Delivery Offer Redemptions (incl. tax)"] || row.delivery_offer_redemptions),
            marketingCredits: parseNegativeFloat(row["Marketing Credits"] || row.marketing_credits),
            thirdPartyContribution: parseNegativeFloat(row["Third-party Contribution"] || row.third_party_contribution),
            
            // Other payments (ad spend, credits, etc.)
            otherPayments: Math.abs(parseNegativeFloat(row["Other payments"] || row.other_payments)),
            otherPaymentsDescription: row["Other payments description"] || row.other_payments_description || null,
            
            // Legacy marketing field
            marketingSpend: parseNegativeFloat(row.Marketing_Spend || row["Marketing Spend"] || row.marketing_spend),
            
            // Payout (includes all statuses)
            totalPayout: parseNegativeFloat(row["Total payout"] || row.total_payout || row.Total_Payout),
            netPayment: parseNegativeFloat(row.Net_Payment || row["Net Payment"] || row.net_payment),
            
            // Source
            orderSource: row.Order_Source || row["Order Source"] || row.order_source || null,
          });
          
          processedCount++;
        }
        
        res.json({ success: true, rowsProcessed: processedCount });
        return;
      } else if (platform === "grubhub") {
        for (const row of rows) {
          const storeId = row.store_number || row.Store_Number || row["Store Number"] || null;
          const locationName = row.store_name || row.Restaurant || "";
          const locationId = await findOrCreateLocation(clientId, locationName, "grubhub", storeId);

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
          
          const storeId = row["Store ID"] || row.Store_ID || row.store_id || null;
          const locationName = row["Store Name"] || row["Store name"] || "";
          const locationId = await findOrCreateLocation(clientId, locationName, "doordash", storeId);
          
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

  app.get("/api/analytics/weeks", async (req, res) => {
    try {
      const weeks = await storage.getAvailableWeeks();
      res.json(weeks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const { clientId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        platform: platform as "ubereats" | "doordash" | "grubhub" | undefined,
        weekStart: weekStart as string | undefined,
        weekEnd: weekEnd as string | undefined,
        locationTag: locationTag as string | undefined,
      };
      const overview = await storage.getDashboardOverview(filters);
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
      const { clientId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        platform: platform as "ubereats" | "doordash" | "grubhub" | undefined,
        weekStart: weekStart as string | undefined,
        weekEnd: weekEnd as string | undefined,
        locationTag: locationTag as string | undefined,
      };
      const metrics = await storage.getLocationMetrics(filters);
      res.json(metrics);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/locations/consolidated", async (req, res) => {
    try {
      const { clientId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        platform: platform as "ubereats" | "doordash" | "grubhub" | undefined,
        weekStart: weekStart as string | undefined,
        weekEnd: weekEnd as string | undefined,
        locationTag: locationTag as string | undefined,
      };
      const metrics = await storage.getConsolidatedLocationMetrics(filters);
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

  app.post("/api/location-weekly-financials", async (req, res) => {
    try {
      const validatedData = insertLocationWeeklyFinancialSchema.parse(req.body);
      const financial = await storage.createLocationWeeklyFinancial(validatedData);
      res.json(financial);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/export/weekly-financials", async (req, res) => {
    try {
      const { clientId, aggregation = "by-location" } = req.query;
      
      if (!clientId) {
        return res.status(400).json({ error: "clientId is required" });
      }

      const financials = await storage.getLocationWeeklyFinancialsByClient(clientId as string);
      const locations = await storage.getLocationsByClient(clientId as string);
      
      const locationMap = new Map(locations.map(loc => [loc.id, loc.canonicalName]));
      
      // Group financials by week to get all unique weeks
      const weekSet = new Set<string>();
      financials.forEach(f => weekSet.add(f.weekStartDate));
      const weeks = Array.from(weekSet).sort();
      
      // Create CSV content
      const csvRows: string[] = [];
      
      // Header row
      csvRows.push(['Location', 'Metric', ...weeks].join(','));
      
      if (aggregation === "overview") {
        // Aggregate all locations into overview
        const weeklyTotals = new Map<string, {
          sales: number;
          marketingSales: number;
          marketingSpend: number;
          payout: number;
          payoutWithCogs: number;
          count: number;
        }>();
        
        financials.forEach(f => {
          const existing = weeklyTotals.get(f.weekStartDate) || {
            sales: 0,
            marketingSales: 0,
            marketingSpend: 0,
            payout: 0,
            payoutWithCogs: 0,
            count: 0
          };
          
          weeklyTotals.set(f.weekStartDate, {
            sales: existing.sales + f.sales,
            marketingSales: existing.marketingSales + f.marketingSales,
            marketingSpend: existing.marketingSpend + f.marketingSpend,
            payout: existing.payout + f.payout,
            payoutWithCogs: existing.payoutWithCogs + f.payoutWithCogs,
            count: existing.count + 1
          });
        });
        
        // Calculate derived metrics
        const metrics = [
          'Total Net Sales',
          'Marketing Driven Sales',
          'Organic Sales',
          'Marketing Spend / Sales %',
          'Marketing ROAS',
          'Net Payout $',
          'Net Payout %',
          'Payout with COGS (46%)'
        ];
        
        metrics.forEach(metric => {
          const values = weeks.map(week => {
            const totals = weeklyTotals.get(week);
            if (!totals) return '';
            
            switch (metric) {
              case 'Total Net Sales':
                return `$${totals.sales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              case 'Marketing Driven Sales':
                return `$${totals.marketingSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              case 'Organic Sales':
                return `$${(totals.sales - totals.marketingSales).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              case 'Marketing Spend / Sales %':
                return totals.sales > 0 ? `${((totals.marketingSpend / totals.sales) * 100).toFixed(0)}%` : '0%';
              case 'Marketing ROAS':
                return totals.marketingSpend > 0 ? (totals.marketingSales / totals.marketingSpend).toFixed(1) : '0';
              case 'Net Payout $':
                return `$${totals.payout.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              case 'Net Payout %':
                return totals.sales > 0 ? `${((totals.payout / totals.sales) * 100).toFixed(0)}%` : '0%';
              case 'Payout with COGS (46%)':
                return `$${totals.payoutWithCogs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
              default:
                return '';
            }
          });
          
          csvRows.push(['OVERVIEW', metric, ...values].join(','));
        });
      } else {
        // By location
        const locationGroups = new Map<string, any[]>();
        financials.forEach(f => {
          const name = locationMap.get(f.locationId) || f.locationId;
          if (!locationGroups.has(name)) {
            locationGroups.set(name, []);
          }
          locationGroups.get(name)!.push(f);
        });
        
        locationGroups.forEach((locFinancials, locationName) => {
          const weeklyData = new Map(locFinancials.map(f => [f.weekStartDate, f]));
          
          const metrics = [
            'Total Net Sales',
            'Marketing Driven Sales', 
            'Organic Sales',
            'Marketing Spend / Sales %',
            'Marketing ROAS',
            'Net Payout $',
            'Net Payout %',
            'Payout with COGS (46%)'
          ];
          
          metrics.forEach(metric => {
            const values = weeks.map(week => {
              const data = weeklyData.get(week);
              if (!data) return '';
              
              switch (metric) {
                case 'Total Net Sales':
                  return `$${data.sales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'Marketing Driven Sales':
                  return `$${data.marketingSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'Organic Sales':
                  return `$${(data.sales - data.marketingSales).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'Marketing Spend / Sales %':
                  return `${data.marketingPercent.toFixed(0)}%`;
                case 'Marketing ROAS':
                  return data.roas.toFixed(1);
                case 'Net Payout $':
                  return `$${data.payout.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                case 'Net Payout %':
                  return `${data.payoutPercent.toFixed(0)}%`;
                case 'Payout with COGS (46%)':
                  return `$${data.payoutWithCogs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
                default:
                  return '';
              }
            });
            
            csvRows.push([locationName, metric, ...values].join(','));
          });
        });
      }
      
      const csvContent = csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="weekly-financials-${aggregation}-${new Date().toISOString().split('T')[0]}.csv"`);
      res.send(csvContent);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
