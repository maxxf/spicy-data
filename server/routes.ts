import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertPromotionSchema, insertPaidAdCampaignSchema, insertLocationSchema, insertLocationWeeklyFinancialSchema, type AnalyticsFilters } from "@shared/schema";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { z } from "zod";

const upload = multer({ storage: multer.memoryStorage() });

function parseCSV(buffer: Buffer, platform?: string): any[] {
  // Auto-detect Uber Eats header row (some exports have 2 header rows, newer ones have 1)
  if (platform === "ubereats") {
    const firstLineParse = parse(buffer, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      to_line: 2, // Read first 2 lines to check
    });
    
    // If first row has alphabetic column names (not numeric/description), use line 1
    // Otherwise use line 2 (old format with description row)
    const firstRow = firstLineParse[0];
    const hasAlphabeticHeaders = firstRow && firstRow.length > 0 && 
      /^[A-Za-z\s\-\_]+$/.test(String(firstRow[0]));
    
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      from_line: hasAlphabeticHeaders ? 1 : 2,
    });
  }
  
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
}

// Helper to normalize column names for flexible CSV parsing
function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s\-\_\|]/g, '').replace(/[()]/g, '');
}

function getColumnValue(row: any, ...possibleNames: string[]): string {
  // First try exact matches
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return row[name];
    }
  }
  
  // Then try normalized matches
  const normalizedRow: Record<string, any> = {};
  for (const key in row) {
    normalizedRow[normalizeColumnName(key)] = row[key];
  }
  
  for (const name of possibleNames) {
    const normalized = normalizeColumnName(name);
    if (normalizedRow[normalized] !== undefined && normalizedRow[normalized] !== null) {
      return normalizedRow[normalized];
    }
  }
  
  return '';
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
        // Step 1: Collect unique locations and create them upfront
        const locationMap = new Map<string, string>();
        const uniqueLocations = new Map<string, string | undefined>(); // name -> storeId
        
        for (const row of rows) {
          const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
          const storeId = getColumnValue(row, "Store ID", "Store_ID", "store_id") || undefined;
          if (locationName && locationName.trim() !== "") {
            uniqueLocations.set(locationName, storeId);
          }
        }
        
        // Batch create/find all locations
        for (const [locationName, storeId] of uniqueLocations) {
          const locationId = await findOrCreateLocation(clientId, locationName, "ubereats", storeId);
          locationMap.set(locationName, locationId);
        }
        
        // Step 2: Build transactions array using cached location IDs
        const transactions: InsertUberEatsTransaction[] = [];
        
        for (const row of rows) {
          // Skip rows without order ID
          const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id");
          if (!orderId || orderId.trim() === "") {
            continue;
          }

          const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
          const locationId = locationMap.get(locationName) || null;

          transactions.push({
            clientId,
            locationId,
            orderId,
            date: getColumnValue(row, "Order Date", "Date", "Order_Date", "order_date"),
            time: getColumnValue(row, "Order Accept Time", "Time", "Order_Accept_Time", "order_accept_time"),
            location: locationName,
            subtotal: parseFloat(getColumnValue(row, "Sales (excl. tax)", "Subtotal", "Sales_excl_tax", "sales_excl_tax")) || 0,
            tax: parseFloat(getColumnValue(row, "Tax on Sales", "Tax", "Tax_on_Sales", "tax_on_sales")) || 0,
            deliveryFee: parseFloat(getColumnValue(row, "Delivery Fee", "Delivery_Fee", "delivery_fee")) || 0,
            serviceFee: parseFloat(getColumnValue(row, "Service Fee", "Service_Fee", "service_fee")) || 0,
            marketingPromo: getColumnValue(row, "Marketing Promotion", "Marketing_Promo", "marketing_promotion") || null,
            marketingAmount: parseFloat(getColumnValue(row, "Marketing Adjustment", "Marketing_Amount", "marketing_adjustment")) || 0,
            platformFee: parseFloat(getColumnValue(row, "Marketplace Fee", "Platform_Fee", "Platform Fee", "marketplace_fee")) || 0,
            netPayout: parseFloat(getColumnValue(row, "Total payout ", "Total payout", "Net_Payout", "net_payout")) || 0,
            customerRating: null,
          });
        }
        
        // Step 3: Deduplicate transactions by unique key (clientId, orderId, date) 
        // since Uber Eats CSV can have multiple rows per order
        const uniqueTransactions = new Map<string, InsertUberEatsTransaction>();
        for (const txn of transactions) {
          const key = `${txn.clientId}-${txn.orderId}-${txn.date}`;
          // Keep the last occurrence (most complete data row)
          uniqueTransactions.set(key, txn);
        }
        
        const deduplicatedTransactions = Array.from(uniqueTransactions.values());
        console.log(`Uber Eats: Reduced ${transactions.length} rows to ${deduplicatedTransactions.length} unique transactions`);
        
        // Step 4: Insert deduplicated transactions in batch
        await storage.createUberEatsTransactionsBatch(deduplicatedTransactions);
        res.json({ success: true, rowsProcessed: deduplicatedTransactions.length });
        return;
      } else if (platform === "doordash") {
        // Helper to safely parse negative values (discounts/offers are negative in CSV)
        const parseNegativeFloat = (val: any) => {
          if (!val) return 0;
          const parsed = parseFloat(val);
          return isNaN(parsed) ? 0 : parsed;
        };

        // Step 1: Collect unique locations and create them upfront
        const locationMap = new Map<string, string>();
        const uniqueLocations = new Map<string, string | undefined>(); // name -> storeId
        
        for (const row of rows) {
          const locationName = getColumnValue(row, "Store name", "Store Name", "Store_Name", "store_name");
          const storeId = getColumnValue(row, "Store ID", "Store_ID", "store_id") || undefined;
          if (locationName && locationName.trim() !== "") {
            uniqueLocations.set(locationName, storeId);
          }
        }
        
        // Batch create/find all locations
        for (const [locationName, storeId] of uniqueLocations) {
          const locationId = await findOrCreateLocation(clientId, locationName, "doordash", storeId);
          locationMap.set(locationName, locationId);
        }
        
        // Step 2: Build transactions array using cached location IDs
        const transactions: InsertDoordashTransaction[] = [];
        
        for (const row of rows) {
          // Skip rows without transaction ID (unique identifier)
          const transactionId = getColumnValue(row, "DoorDash transaction ID", "Transaction ID", "Transaction_ID", "transaction_id");
          if (!transactionId || transactionId.trim() === "") {
            continue;
          }

          const orderNumber = getColumnValue(row, "DoorDash order ID", "Order Number", "Order_Number", "order_number");
          if (!orderNumber || orderNumber.trim() === "") {
            continue;
          }

          const locationName = getColumnValue(row, "Store name", "Store Name", "Store_Name", "store_name");
          const locationId = locationMap.get(locationName) || null;

          transactions.push({
            clientId,
            locationId,
            
            // Order identification
            transactionId: transactionId,
            orderNumber: orderNumber,
            transactionDate: getColumnValue(row, "Timestamp local date", "Transaction Date", "Transaction_Date", "transaction_date"),
            storeLocation: locationName,
            
            // Status and channel filtering fields
            channel: getColumnValue(row, "Channel", "channel") || null,
            orderStatus: getColumnValue(row, "Final order status", "Order Status", "Order_Status", "order_status") || null,
            
            // Sales metrics
            salesExclTax: parseNegativeFloat(getColumnValue(row, "Subtotal", "Sales (excl. tax)", "sales_excl_tax", "salesExclTax")),
            orderSubtotal: parseNegativeFloat(getColumnValue(row, "Subtotal", "Order Subtotal", "Order_Subtotal", "order_subtotal")),
            taxes: parseNegativeFloat(getColumnValue(row, "Subtotal tax passed to merchant", "Taxes", "taxes")),
            
            // Fees and charges
            deliveryFees: parseNegativeFloat(getColumnValue(row, "Delivery Fees", "Delivery_Fees", "delivery_fees")),
            commission: parseNegativeFloat(getColumnValue(row, "Commission", "commission")),
            errorCharges: parseNegativeFloat(getColumnValue(row, "Error charges", "Error Charges", "Error_Charges", "error_charges")),
            
            // Marketing/promotional fields (typically negative for discounts)
            offersOnItems: parseNegativeFloat(getColumnValue(
              row,
              "Customer discounts from marketing | (funded by you)",
              "Offers on items (incl. tax)",
              "offers_on_items"
            )),
            deliveryOfferRedemptions: parseNegativeFloat(getColumnValue(
              row,
              "Customer discounts from marketing | (funded by DoorDash)",
              "Delivery Offer Redemptions (incl. tax)",
              "delivery_offer_redemptions"
            )),
            marketingCredits: parseNegativeFloat(getColumnValue(
              row,
              "DoorDash marketing credit",
              "Marketing Credits",
              "marketing_credits"
            )),
            thirdPartyContribution: parseNegativeFloat(getColumnValue(
              row,
              "Customer discounts from marketing | (funded by a third-party)",
              "Third-party Contribution",
              "third_party_contribution"
            )),
            
            // Other payments (ad spend, credits, etc.)
            otherPayments: Math.abs(parseNegativeFloat(getColumnValue(
              row,
              "Marketing fees | (including any applicable taxes)",
              "Other payments",
              "other_payments"
            ))),
            otherPaymentsDescription: getColumnValue(row, "Description", "Other payments description", "other_payments_description") || null,
            
            // Legacy marketing field
            marketingSpend: parseNegativeFloat(getColumnValue(row, "Marketing Spend", "Marketing_Spend", "marketing_spend")),
            
            // Payout (includes all statuses)
            totalPayout: parseNegativeFloat(getColumnValue(row, "Net total", "Total payout", "total_payout", "Total_Payout")),
            netPayment: parseNegativeFloat(getColumnValue(row, "Net total", "Net Payment", "Net_Payment", "net_payment")),
            
            // Source
            orderSource: getColumnValue(row, "Order Source", "Order_Source", "order_source") || null,
          });
        }
        
        // Step 3: Insert all transactions in batch
        await storage.createDoordashTransactionsBatch(transactions);
        res.json({ success: true, rowsProcessed: transactions.length });
        return;
      } else if (platform === "grubhub") {
        // Step 1: Collect unique locations and create them upfront
        const locationMap = new Map<string, string>(); // key: locationName, value: locationId
        const uniqueLocations = new Set<string>();
        
        for (const row of rows) {
          const locationName = getColumnValue(row, "store_name", "Restaurant", "Store_Name", "store name");
          if (locationName && locationName.trim() !== "") {
            uniqueLocations.add(locationName);
          }
        }
        
        // Batch create/find all locations
        for (const locationName of uniqueLocations) {
          const storeId = undefined; // Grubhub doesn't have consistent store IDs in the data
          const locationId = await findOrCreateLocation(clientId, locationName, "grubhub", storeId);
          locationMap.set(locationName, locationId);
        }
        
        // Step 2: Build transactions array using cached location IDs
        const transactions: InsertGrubhubTransaction[] = [];
        
        for (const row of rows) {
          const locationName = getColumnValue(row, "store_name", "Restaurant", "Store_Name", "store name");
          
          // Skip rows without order number OR transaction ID
          const orderNumber = getColumnValue(row, "order_number", "Order_Id", "order number", "order_id");
          const transactionId = getColumnValue(row, "transaction_id", "Transaction_Id", "transaction id");
          if (!orderNumber || orderNumber.trim() === "" || !transactionId || transactionId.trim() === "") {
            continue;
          }

          const locationId = locationMap.get(locationName) || null;

          transactions.push({
            clientId,
            locationId,
            orderId: orderNumber,
            orderDate: getColumnValue(row, "transaction_date", "Order_Date", "transaction date", "order_date"),
            transactionType: getColumnValue(row, "transaction_type", "Transaction_Type", "transaction type"),
            transactionId: transactionId,
            restaurant: locationName,
            orderChannel: getColumnValue(row, "order_channel", "Order_Channel", "order channel") || null,
            fulfillmentType: getColumnValue(row, "fulfillment_type", "Fulfillment_Type", "fulfillment type") || null,
            subtotal: parseFloat(getColumnValue(row, "subtotal", "Subtotal", "Sale_Amount", "sale amount")) || 0,
            subtotalSalesTax: parseFloat(getColumnValue(row, "subtotal_sales_tax", "Subtotal_Sales_Tax", "tax amount", "Tax Amount")) || 0,
            commission: parseFloat(getColumnValue(row, "commission", "Commission")) || 0,
            deliveryCommission: parseFloat(getColumnValue(row, "delivery_commission", "Delivery_Commission", "delivery commission")) || 0,
            processingFee: parseFloat(getColumnValue(row, "processing_fee", "merchant_service_fee", "Processing_Fee", "processing fee")) || 0,
            merchantFundedPromotion: parseFloat(getColumnValue(row, "merchant_funded_promotion", "Merchant_Funded_Promotion", "merchant funded promotion")) || 0,
            merchantNetTotal: parseFloat(getColumnValue(row, "merchant_net_total", "Merchant_Net_Total", "Net_Sales", "net sales")) || 0,
            transactionNote: getColumnValue(row, "transaction_note", "Transaction_Note", "transaction note") || null,
            customerType: getColumnValue(row, "gh_plus_customer", "Customer_Type", "customer type", "Customer Type") || "Unknown",
          });
        }
        
        // Step 3: Insert all transactions in batch
        await storage.createGrubhubTransactionsBatch(transactions);
        res.json({ success: true, rowsProcessed: transactions.length });
        return;
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

  app.get("/api/locations/duplicates", async (req, res) => {
    try {
      const { clientId } = req.query;
      const duplicates = await storage.getDuplicateLocations(clientId as string | undefined);
      res.json(duplicates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/locations/merge", async (req, res) => {
    try {
      const { targetLocationId, sourceLocationIds } = req.body;

      if (!targetLocationId || !sourceLocationIds || !Array.isArray(sourceLocationIds)) {
        return res.status(400).json({ error: "Missing or invalid required fields" });
      }

      const mergedLocation = await storage.mergeLocations(targetLocationId, sourceLocationIds);
      res.json(mergedLocation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/locations/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteLocation(id);
      
      if (!deleted) {
        return res.status(404).json({ error: "Location not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Import master location list from Google Sheets
  app.post("/api/locations/import-master-list", async (req, res) => {
    try {
      const { spreadsheetUrl, clientId } = req.body;

      if (!spreadsheetUrl || !clientId) {
        return res.status(400).json({ error: "Missing spreadsheetUrl or clientId" });
      }

      // Extract spreadsheet ID from URL
      const spreadsheetIdMatch = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!spreadsheetIdMatch) {
        return res.status(400).json({ error: "Invalid Google Sheets URL" });
      }
      const spreadsheetId = spreadsheetIdMatch[1];

      // Import fetchSheetData function
      const { fetchSheetData } = await import("./google-sheets");

      // Fetch the data from the sheet
      // Assuming the data is in the first sheet with headers in row 1
      const sheetData = await fetchSheetData(spreadsheetId, "Sheet1!A:Z");

      if (!sheetData || sheetData.length === 0) {
        return res.status(400).json({ error: "No data found in spreadsheet" });
      }

      // First row should be headers
      const headers = sheetData[0];
      const rows = sheetData.slice(1);

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const row of rows) {
        // Skip empty rows
        if (!row || row.length === 0 || !row[2]) {
          skipped++;
          continue;
        }

        // Column C (index 2) is the Store ID
        const storeId = row[2]?.toString().trim();
        if (!storeId) {
          skipped++;
          continue;
        }

        // Try to find a canonical name from the row
        // Assuming Column A or B might have the location name
        const canonicalName = row[0]?.toString().trim() || row[1]?.toString().trim() || storeId;

        // Check if location with this Store ID already exists
        const allLocations = await storage.getLocationsByClient(clientId);
        const existingLocation = allLocations.find(loc => loc.storeId === storeId);

        if (existingLocation) {
          // Update existing location if needed
          const updates: any = {};
          if (canonicalName && canonicalName !== existingLocation.canonicalName) {
            updates.canonicalName = canonicalName;
          }
          
          if (Object.keys(updates).length > 0) {
            await storage.updateLocation(existingLocation.id, updates);
            updated++;
          } else {
            skipped++;
          }
        } else {
          // Create new location with Store ID
          await storage.createLocation({
            clientId,
            storeId,
            canonicalName,
            uberEatsName: null,
            doordashName: null,
            grubhubName: null,
            isVerified: true,
            locationTag: null,
          });
          created++;
        }
      }

      res.json({
        success: true,
        created,
        updated,
        skipped,
        total: rows.length,
      });
    } catch (error: any) {
      console.error("Master list import error:", error);
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

  // Comprehensive diagnostic report endpoint
  app.get("/api/analytics/diagnostic", async (req, res) => {
    try {
      const { weekStart, weekEnd, clientId } = req.query;
      
      // Get all data for the specified week (or all data if no week specified)
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        weekStart: weekStart as string | undefined,
        weekEnd: weekEnd as string | undefined,
      };

      const overview = await storage.getDashboardOverview(filters);
      const locations = await storage.getLocationMetrics(filters);
      const allLocations = await storage.getAllLocations();
      
      // Get promotions and paid ads
      const promotions = await storage.getPromotionMetrics(filters);
      const paidAds = await storage.getPaidAdCampaignMetrics(filters);
      
      // Calculate transaction counts (only if clientId provided, otherwise skip platform breakdown)
      let platformBreakdown: Array<{ platform: string; transactionCount: number }> = [];
      
      if (clientId) {
        const allUberTransactions = await storage.getUberEatsTransactionsByClient(clientId as string);
        const allDoorTransactions = await storage.getDoordashTransactionsByClient(clientId as string);
        const allGrubTransactions = await storage.getGrubhubTransactionsByClient(clientId as string);
        
        platformBreakdown = [
          {
            platform: "Uber Eats",
            transactionCount: allUberTransactions.length,
          },
          {
            platform: "DoorDash",
            transactionCount: allDoorTransactions.length,
          },
          {
            platform: "Grubhub",
            transactionCount: allGrubTransactions.length,
          },
        ];
      }
      const duplicateLocations = await storage.getDuplicateLocations(clientId as string | undefined);
      
      // Calculate marketing metrics from promotions and ads
      const totalMarketingInvestment = 
        promotions.reduce((sum, p) => sum + (p.totalCost || 0), 0) +
        paidAds.reduce((sum, a) => sum + (a.totalSpend || 0), 0);
      
      const marketingDrivenSales = 
        promotions.reduce((sum, p) => sum + (p.totalRevenue || 0), 0) +
        paidAds.reduce((sum, a) => sum + (a.totalRevenue || 0), 0);
      
      const marketingOrders = 
        promotions.reduce((sum, p) => sum + (p.totalOrders || 0), 0) +
        paidAds.reduce((sum, a) => sum + (a.totalOrders || 0), 0);
      
      const report = {
        dateRange: weekStart && weekEnd 
          ? { weekStart, weekEnd }
          : { all: true },
        timestamp: new Date().toISOString(),
        clientId: clientId || "all",
        
        overallMetrics: {
          totalSales: overview.totalSales,
          totalOrders: overview.totalOrders,
          avgOrderValue: overview.avgOrderValue,
          totalNetPayout: overview.totalNetPayout,
          netPayoutPercentage: overview.netPayoutPercentage,
        },
        
        platformBreakdown,
        
        marketingPerformance: {
          totalMarketingInvestment,
          marketingDrivenSales,
          marketingOrders,
          overallROAS: totalMarketingInvestment > 0 ? marketingDrivenSales / totalMarketingInvestment : 0,
          trueCPO: marketingOrders > 0 ? totalMarketingInvestment / marketingOrders : 0,
          promotionsCount: promotions.length,
          paidAdsCount: paidAds.length,
        },
        
        dataQuality: {
          totalLocations: allLocations.length,
          locationsWithTransactions: locations.length,
          duplicateLocationGroups: duplicateLocations.length,
          totalDuplicateLocations: duplicateLocations.reduce((sum, d) => sum + d.count, 0),
        },
        
        topPerformingLocations: locations
          .sort((a, b) => b.totalSales - a.totalSales)
          .slice(0, 10)
          .map(loc => ({
            locationName: loc.locationName,
            sales: loc.totalSales,
            orders: loc.totalOrders,
          })),
      };
      
      res.json(report);
    } catch (error: any) {
      console.error("Diagnostic report error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const { clientId, locationId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        locationId: locationId as string | undefined,
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
      const { clientId, locationId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        locationId: locationId as string | undefined,
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
      const { clientId, locationId, platform, weekStart, weekEnd, locationTag } = req.query;
      const filters: AnalyticsFilters = {
        clientId: clientId as string | undefined,
        locationId: locationId as string | undefined,
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
