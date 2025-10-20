import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { db } from "../server/db";
import {
  uberEatsTransactions,
  clients,
  locations,
  platformAdSpend,
} from "../shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

async function main() {
  console.log("Starting import for week 10/6-10/12/2025 (order-level UberEats format)...");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }
  console.log(`Found client: ${client.name} (${client.id})`);

  // Get all locations for matching
  const allLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));
  console.log(`Found ${allLocations.length} locations for matching`);

  // Get unmapped location bucket
  const unmappedLocation = allLocations.find(l => l.canonicalName === "Unmapped Locations");
  if (!unmappedLocation) {
    console.error("⚠️  'Unmapped Locations' bucket not found!");
    process.exit(1);
  }
  console.log(`Using 'Unmapped Locations' bucket: ${unmappedLocation.id}`);

  // Cache for location lookups
  const locationCache = new Map<string, string>();

  // Helper: Extract code from parentheses (e.g., "Capriotti's (IA069)" → "IA069")
  function extractCodeFromParentheses(text: string): string | null {
    const match = text.match(/\(([A-Za-z0-9|-]+)\)/);
    return match ? match[1].trim() : null;
  }

  // Helper: Find location (returns unmapped bucket if no match)
  async function findLocation(storeName: string) {
    const cacheKey = `ubereats:${storeName}`;
    if (locationCache.has(cacheKey)) {
      return locationCache.get(cacheKey)!;
    }

    const extractedCode = extractCodeFromParentheses(storeName);
    if (extractedCode) {
      const location = allLocations.find(l => l.uberEatsStoreLabel === extractedCode);
      if (location) {
        locationCache.set(cacheKey, location.id);
        return location.id;
      }
    }
    
    // Route to unmapped bucket
    console.log(`⚠️  No match for "${storeName}" (code: ${extractedCode || 'none'}) → Unmapped`);
    locationCache.set(cacheKey, unmappedLocation.id);
    return unmappedLocation.id;
  }

  // Import UberEats data (order-level format)
  console.log("\nImporting UberEats transactions (order-level format)...");
  const ubereatsCsv = readFileSync(
    "attached_assets/abd32c28-5d15-462f-ac47-1e80348c0bd8-united_states (1)_1760977498224.csv",
    "utf-8"
  );
  
  const ubereatsRows = parse(ubereatsCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    from_line: 2, // Line 1 is descriptions, line 2 is actual headers
    relax_quotes: true,
  });

  console.log(`Parsed ${ubereatsRows.length} UberEats rows`);

  const ubereatsMap = new Map<string, any>();
  const adSpendByLocation = new Map<string, number>();
  let adSpendRows = 0;
  let completedOrders = 0;
  
  for (const row of ubereatsRows) {
    const rowData = row as Record<string, string>;
    const orderId = rowData["Order ID"] || "";
    const storeName = rowData["Store Name"] || "";
    const date = rowData["Order Date"] || "";
    const orderStatus = rowData["Order Status"] || "";
    const otherPaymentsDesc = rowData["Other payments description"] || "";
    
    // Capture ad spend rows (no Order ID, just tracking costs)
    if (!orderId && otherPaymentsDesc === "Ad Spend") {
      const validDates = ["10/6/25", "10/7/25", "10/8/25", "10/9/25", "10/10/25", "10/11/25", "10/12/25"];
      if (validDates.includes(date)) {
        const locationId = await findLocation(storeName);
        const adSpend = Math.abs(parseFloat(rowData["Other payments"] || "0") || 0);
        const key = `${locationId}:${date}`;
        adSpendByLocation.set(key, (adSpendByLocation.get(key) || 0) + adSpend);
        adSpendRows++;
      }
      continue;
    }
    
    // Skip rows without order IDs or store names
    if (!orderId || !storeName || !date) {
      continue;
    }
    
    // Only import transactions within our date range (10/6/25 through 10/12/25)
    const validDates = ["10/6/25", "10/7/25", "10/8/25", "10/9/25", "10/10/25", "10/11/25", "10/12/25"];
    if (!validDates.includes(date)) {
      continue;
    }
    
    // Import ALL order statuses (per new methodology - needed for net payout calculation)
    // But track completed orders separately for metrics
    if (orderStatus === "Completed") {
      completedOrders++;
    }
    
    const locationId = await findLocation(storeName);
    const uniqueKey = `${client.id}:${orderId}:${date}`;

    // Parse financial fields (updated methodology)
    const salesExclTax = parseFloat(rowData["Sales (excl. tax)"] || "0") || 0; // Primary sales metric
    const salesInclTax = parseFloat(rowData["Sales (incl. tax)"] || "0") || 0; // For backward compatibility
    const taxOnSales = parseFloat(rowData["Tax on Sales"] || "0") || 0;
    
    // Marketing/Promotional fields (negative values indicate discounts)
    const offersOnItems = parseFloat(rowData["Offers on items (incl. tax)"] || "0") || 0;
    const deliveryOfferRedemptions = parseFloat(rowData["Delivery Offer Redemptions (incl. tax)"] || "0") || 0;
    const marketingAdjustment = parseFloat(rowData["Marketing Adjustment"] || "0") || 0;
    
    // Other payments (Ad Spend, Credits, Fees, etc.)
    const otherPayments = parseFloat(rowData["Other payments"] || "0") || 0;
    const otherPaymentsDescription = rowData["Other payments description"] || null;
    
    // Fees
    const marketplaceFee = parseFloat(rowData["Marketplace Fee"] || "0") || 0;
    const totalPayout = parseFloat(rowData["Total payout "] || rowData["Total payout"] || "0") || 0; // Note: may have trailing space
    
    ubereatsMap.set(uniqueKey, {
      clientId: client.id,
      locationId: locationId,
      orderId: orderId,
      date: date,
      time: rowData["Order Accept Time"] || "",
      location: storeName,
      orderStatus: orderStatus,
      
      // Sales fields
      salesExclTax: salesExclTax,
      subtotal: salesInclTax,
      tax: taxOnSales,
      
      // Fee fields
      deliveryFee: 0,
      serviceFee: 0,
      platformFee: Math.abs(marketplaceFee), // Store as positive
      
      // Marketing/Promotional fields
      offersOnItems: offersOnItems,
      deliveryOfferRedemptions: deliveryOfferRedemptions,
      marketingPromo: marketingAdjustment !== 0 ? "Marketing Adjustment" : null,
      marketingAmount: Math.abs(marketingAdjustment),
      
      // Other payments
      otherPayments: otherPayments,
      otherPaymentsDescription: otherPaymentsDescription,
      
      // Payout
      netPayout: totalPayout,
      
      // Other
      customerRating: null,
    });
  }

  const ubereatsTransactionsToInsert = Array.from(ubereatsMap.values());

  console.log(`\nFound ${adSpendRows} ad spend rows (skipped - no order association)`);
  console.log(`Found ${completedOrders} completed orders in date range`);
  console.log(`Upserting ${ubereatsTransactionsToInsert.length} unique UberEats transactions...`);
  
  for (let i = 0; i < ubereatsTransactionsToInsert.length; i += 100) {
    const batch = ubereatsTransactionsToInsert.slice(i, i + 100);
    await db.insert(uberEatsTransactions)
      .values(batch)
      .onConflictDoUpdate({
        target: [uberEatsTransactions.clientId, uberEatsTransactions.orderId, uberEatsTransactions.date],
        set: {
          locationId: sql`EXCLUDED.location_id`,
          time: sql`EXCLUDED.time`,
          location: sql`EXCLUDED.location`,
          orderStatus: sql`EXCLUDED.order_status`,
          salesExclTax: sql`EXCLUDED.sales_excl_tax`,
          subtotal: sql`EXCLUDED.subtotal`,
          tax: sql`EXCLUDED.tax`,
          deliveryFee: sql`EXCLUDED.delivery_fee`,
          serviceFee: sql`EXCLUDED.service_fee`,
          platformFee: sql`EXCLUDED.platform_fee`,
          offersOnItems: sql`EXCLUDED.offers_on_items`,
          deliveryOfferRedemptions: sql`EXCLUDED.delivery_offer_redemptions`,
          marketingPromo: sql`EXCLUDED.marketing_promo`,
          marketingAmount: sql`EXCLUDED.marketing_amount`,
          otherPayments: sql`EXCLUDED.other_payments`,
          otherPaymentsDescription: sql`EXCLUDED.other_payments_description`,
          netPayout: sql`EXCLUDED.net_payout`,
          customerRating: sql`EXCLUDED.customer_rating`,
        },
      });
    console.log(`  Processed ${Math.min((i + 100), ubereatsTransactionsToInsert.length)} / ${ubereatsTransactionsToInsert.length}`);
  }

  console.log(`✅ UberEats import complete!`);

  // Insert ad spend data
  console.log(`\nInserting ${adSpendByLocation.size} location-level ad spend records...`);
  const adSpendRecords = Array.from(adSpendByLocation.entries()).map(([key, adSpend]) => {
    const [locationId, date] = key.split(':');
    return {
      clientId: client.id,
      locationId,
      platform: 'ubereats',
      date,
      adSpend,
    };
  });

  for (const record of adSpendRecords) {
    await db.insert(platformAdSpend)
      .values(record)
      .onConflictDoUpdate({
        target: [platformAdSpend.clientId, platformAdSpend.locationId, platformAdSpend.platform, platformAdSpend.date],
        set: {
          adSpend: sql`EXCLUDED.ad_spend`,
        },
      });
  }

  const totalAdSpend = Array.from(adSpendByLocation.values()).reduce((sum, v) => sum + v, 0);
  console.log(`✅ Inserted $${totalAdSpend.toFixed(2)} in location-level ad spend`);

  // Summary
  const summary = await db.select().from(uberEatsTransactions)
    .where(eq(uberEatsTransactions.clientId, client.id));
  
  const week10_6 = summary.filter(t => 
    t.date.startsWith("10/6/") || t.date.startsWith("10/7/") || 
    t.date.startsWith("10/8/") || t.date.startsWith("10/9/") || 
    t.date.startsWith("10/10/") || t.date.startsWith("10/11/") || 
    t.date.startsWith("10/12/")
  );
  
  const totalSales = week10_6.reduce((sum, t) => sum + t.subtotal, 0);
  const totalPayout = week10_6.reduce((sum, t) => sum + t.netPayout, 0);
  const totalMarketing = week10_6.reduce((sum, t) => sum + t.marketingAmount, 0);
  
  console.log(`\n📊 Week 10/6-10/12 Summary:`);
  console.log(`  Orders: ${week10_6.length}`);
  console.log(`  Sales: $${totalSales.toFixed(2)}`);
  console.log(`  Marketing: $${totalMarketing.toFixed(2)}`);
  console.log(`  Payout: $${totalPayout.toFixed(2)}`);
  console.log(`  Payout %: ${((totalPayout / totalSales) * 100).toFixed(2)}%`);
  
  process.exit(0);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
