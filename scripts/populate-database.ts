import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { storage } from "../server/storage";
import type { InsertLocationWeeklyFinancial } from "@shared/schema";

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
  const longerLength = longer.length;
  if (longerLength === 0) return 1.0;

  const distance = editDistance(longer, shorter);
  return (longerLength - distance) / longerLength;
}

function editDistance(s1: string, s2: string): number {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1))
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

async function findOrCreateLocation(
  clientId: string,
  locationName: string,
  platform: "ubereats" | "doordash" | "grubhub"
): Promise<string> {
  // Skip if location name is empty
  if (!locationName || locationName.trim() === "") {
    throw new Error("Empty location name");
  }
  
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

async function upsertCampaignLocationMetric(metric: any) {
  const existing = await storage.getCampaignLocationMetricByKey(
    metric.campaignId,
    metric.locationId ?? null,
    metric.dateStart ?? null
  );
  
  if (existing) {
    return existing;
  }
  
  return await storage.createCampaignLocationMetric(metric);
}

async function main() {
  console.log("Starting database population...\n");

  // Get Capriotti's client ID
  const clients = await storage.getAllClients();
  const capriottis = clients.find(c => c.name === "Capriotti's");
  if (!capriottis) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }
  const clientId = capriottis.id;
  console.log(`✓ Found client: ${capriottis.name} (${clientId})\n`);

  // 1. Process Uber Eats transactions
  console.log("1. Processing Uber Eats transactions...");
  try {
    const uberFile = "./attached_assets/2ec4128c-c9bd-48f8-9f54-82ee0a670d39-united_states_1760742358828.csv";
    const buffer = readFileSync(uberFile);
    // Uber CSV has 2 header rows - skip the first one (descriptions)
    const rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      from_line: 2,
    });
    
    let count = 0;
    for (const row of rows) {
      try {
        const storeName = row["Store Name"];
        const salesExclTax = parseFloat(row["Sales (excl. tax)"]) || 0;
        const taxOnSales = parseFloat(row["Tax on Sales"]) || 0;
        const marketingAdj = parseFloat(row["Marketing Adjustment"]) || 0;
        const totalPayout = parseFloat(row["Total payout"]) || 0;
        const orderDate = row["Order Date"];
        const orderId = row["Order ID"];
        
        if (!storeName || !orderDate || !orderId) continue;
        
        const locationId = await findOrCreateLocation(clientId, storeName, "ubereats");
        await storage.createUberEatsTransaction({
          clientId,
          locationId,
          orderId: orderId,
          date: orderDate,
          time: row["Order Accept Time"] || "00:00",
          location: storeName,
          subtotal: salesExclTax,
          tax: taxOnSales,
          deliveryFee: parseFloat(row["Delivery Fee"]) || 0,
          serviceFee: parseFloat(row["Order Processing Fee"]) || 0,
          marketingPromo: marketingAdj !== 0 ? "Yes" : null,
          marketingAmount: Math.abs(marketingAdj),
          platformFee: parseFloat(row["Marketplace Fee"]) || 0,
          netPayout: totalPayout,
          customerRating: null,
        });
        count++;
      } catch (err: any) {
        // Skip rows with missing location data
        if (!err.message.includes("Empty location")) {
          console.log(`     Skipped row: ${err.message}`);
        }
      }
    }
    console.log(`   ✓ Imported ${count} Uber Eats transactions\n`);
  } catch (error: any) {
    console.log(`   ⚠ Skipped Uber Eats: ${error.message}\n`);
  }

  // 2. Process DoorDash transactions
  console.log("2. Processing DoorDash transactions...");
  try {
    const doorFile = "./attached_assets/FINANCIAL_DETAILED_TRANSACTIONS_2025-10-06_2025-10-12_fMQyL_2025-10-13T17-38-47Z 2_1760742358827.csv";
    const buffer = readFileSync(doorFile);
    const rows = parseCSV(buffer);
    
    let count = 0;
    for (const row of rows) {
      try {
        const storeName = row["Store name"];
        const subtotal = parseFloat(row["Subtotal"]) || 0;
        const netTotal = parseFloat(row["Net total"]) || 0;
        const marketingFees = parseFloat(row["Marketing fees | (including any applicable taxes)"]) || 0;
        const commission = parseFloat(row["Commission"]) || 0;
        const orderDate = row["Timestamp local date"];
        const orderNumber = row["DoorDash order ID"];
        
        if (!storeName || !orderDate || !orderNumber) continue;
        
        const locationId = await findOrCreateLocation(clientId, storeName, "doordash");
        await storage.createDoordashTransaction({
          clientId,
          locationId,
          orderNumber: orderNumber,
          transactionDate: orderDate,
          storeLocation: storeName,
          orderSubtotal: subtotal,
          taxes: parseFloat(row["Subtotal tax passed to merchant"]) || 0,
          deliveryFees: 0,
          commission: commission,
          marketingSpend: marketingFees,
          errorCharges: parseFloat(row["Error charges"]) || 0,
          netPayment: netTotal,
          orderSource: row["Channel"] || "Unknown",
        });
        count++;
      } catch (err: any) {
        if (!err.message.includes("Empty location")) {
          console.log(`     Skipped row: ${err.message}`);
        }
      }
    }
    console.log(`   ✓ Imported ${count} DoorDash transactions\n`);
  } catch (error: any) {
    console.log(`   ⚠ Skipped DoorDash: ${error.message}\n`);
  }

  // 3. Process Grubhub transactions
  console.log("3. Processing Grubhub transactions...");
  try {
    const grubFile = "./attached_assets/Grubhub_Payments_-_Last_week__1760742358827.csv";
    const buffer = readFileSync(grubFile);
    const rows = parseCSV(buffer);
    
    let count = 0;
    for (const row of rows) {
      try {
        const storeName = row["store_name"];
        const subtotal = parseFloat(row["subtotal"]) || 0;
        const netTotal = parseFloat(row["merchant_net_total"]) || 0;
        const promotion = parseFloat(row["merchant_funded_promotion"]) || 0;
        const commission = parseFloat(row["commission"]) || 0;
        const orderDate = row["transaction_date"];
        const orderNumber = row["order_number"];
        
        if (!storeName || !orderDate || !orderNumber) continue;
        
        const locationId = await findOrCreateLocation(clientId, storeName, "grubhub");
        await storage.createGrubhubTransaction({
          clientId,
          locationId,
          orderId: orderNumber,
          orderDate: orderDate,
          restaurant: storeName,
          saleAmount: subtotal,
          taxAmount: parseFloat(row["subtotal_sales_tax"]) || 0,
          deliveryCharge: parseFloat(row["self_delivery_charge"]) || 0,
          processingFee: parseFloat(row["processing_fee"]) || 0,
          promotionCost: Math.abs(promotion),
          netSales: netTotal,
          customerType: row["gh_plus_customer"] || "Regular",
        });
        count++;
      } catch (err: any) {
        if (!err.message.includes("Empty location")) {
          console.log(`     Skipped row: ${err.message}`);
        }
      }
    }
    console.log(`   ✓ Imported ${count} Grubhub transactions\n`);
  } catch (error: any) {
    console.log(`   ⚠ Skipped Grubhub: ${error.message}\n`);
  }

  // Skip marketing data for now to avoid timeout
  console.log("4. Skipping marketing data import (can be done separately)...\n");
  
  /* 
  // 4. Process DoorDash promotions
  console.log("4. Processing DoorDash promotions...");
  try {
    const promoFile = "./attached_assets/Promotion_Store_4329951a-ad34-43cd-bc23-a66b2fdc6d31_1760747951560.csv";
    const buffer = readFileSync(promoFile);
    const rows = parseCSV(buffer);
    
    const campaignsProcessed = new Map<string, any>();
    let metricCount = 0;
    
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
      metricCount++;
    }
    
    for (const [campaignId, data] of campaignsProcessed) {
      const existing = await storage.getPromotionByCampaignId(campaignId);
      if (!existing) {
        await storage.createPromotion({
          campaignId,
          clientId,
          name: data.name,
          platforms: ["doordash"],
          type: data.type,
          status: "active",
          startDate: data.startDate,
          endDate: data.endDate,
          discountPercent: null,
          discountAmount: null,
        });
      }
    }
    
    console.log(`   ✓ Imported ${campaignsProcessed.size} promotions with ${metricCount} location metrics\n`);
  } catch (error: any) {
    console.log(`   ⚠ Skipped DoorDash promotions: ${error.message}\n`);
  }

  // 5. Process DoorDash paid ads
  console.log("5. Processing DoorDash paid ads...");
  try {
    const adsFile = "./attached_assets/Ads_Store_4329951a-ad34-43cd-bc23-a66b2fdc6d31_1760747951560.csv";
    const buffer = readFileSync(adsFile);
    const rows = parseCSV(buffer);
    
    const campaignsProcessed = new Map<string, any>();
    let metricCount = 0;
    
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
      
      if (!campaignsProcessed.has(campaignId)) {
        campaignsProcessed.set(campaignId, {
          name: campaignName,
          type: "paid_ad",
          startDate,
          endDate,
          totals: { clicks: 0, orders: 0, revenue: 0, spend: 0 }
        });
      }
      const campaign = campaignsProcessed.get(campaignId)!;
      campaign.totals.clicks += clicks;
      campaign.totals.orders += orders;
      campaign.totals.revenue += revenue;
      campaign.totals.spend += spend;
      
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
      });
      metricCount++;
    }
    
    for (const [campaignId, data] of campaignsProcessed) {
      const existing = await storage.getPaidAdCampaignByCampaignId(campaignId);
      if (!existing) {
        const totals = data.totals;
        await storage.createPaidAdCampaign({
          campaignId,
          clientId,
          name: data.name,
          platform: "doordash",
          type: data.type,
          status: "active",
          startDate: data.startDate,
          endDate: data.endDate,
          budget: null,
          impressions: 0,
          clicks: totals.clicks,
          ctr: 0,
          cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
          orders: totals.orders,
          conversionRate: totals.clicks > 0 ? (totals.orders / totals.clicks) * 100 : 0,
          spend: totals.spend,
          revenue: totals.revenue,
          roas: totals.spend > 0 ? totals.revenue / totals.spend : 0,
          cpa: totals.orders > 0 ? totals.spend / totals.orders : 0,
        });
      }
    }
    
    console.log(`   ✓ Imported ${campaignsProcessed.size} paid ad campaigns with ${metricCount} location metrics\n`);
  } catch (error: any) {
    console.log(`   ⚠ Skipped DoorDash paid ads: ${error.message}\n`);
  }
  */

  // Summary
  console.log("\n=== Summary ===");
  const locations = await storage.getLocationsByClient(clientId);
  const promotions = await storage.getAllPromotions(clientId);
  const paidAds = await storage.getAllPaidAdCampaigns(clientId);
  const campaignMetrics = await storage.getCampaignLocationMetrics(clientId);
  
  console.log(`Locations created: ${locations.length}`);
  console.log(`Promotions: ${promotions.length}`);
  console.log(`Paid Ad Campaigns: ${paidAds.length}`);
  console.log(`Campaign Location Metrics: ${campaignMetrics.length}`);
  
  console.log("\n✓ Database population complete!");
  process.exit(0);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
