import { db } from "../server/db";
import { clients, locations, uberEatsTransactions, doordashTransactions, grubhubTransactions } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

async function importWeek9_22() {
  console.log("Starting import for week 9/22 (Sept 22-28, 2025)...\n");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Client 'Capriotti's' not found!");
    process.exit(1);
  }
  console.log(`Client: ${client.name} (${client.id})`);

  // Delete existing transactions for this week
  console.log("\nClearing existing transactions for week 9/22...");
  
  // UberEats uses M/D/YY format
  await db.delete(uberEatsTransactions).where(
    and(
      eq(uberEatsTransactions.clientId, client.id),
      sql`date >= '9/22/25' AND date <= '9/28/25'`
    )
  );
  
  // DoorDash uses YYYY-MM-DD format
  await db.delete(doordashTransactions).where(
    and(
      eq(doordashTransactions.clientId, client.id),
      sql`transaction_date >= '2025-09-22'`,
      sql`transaction_date <= '2025-09-28'`
    )
  );
  
  // Grubhub uses YYYY-MM-DD format
  await db.delete(grubhubTransactions).where(
    and(
      eq(grubhubTransactions.clientId, client.id),
      sql`order_date >= '2025-09-22'`,
      sql`order_date <= '2025-09-28'`
    )
  );
  
  console.log("Old transactions cleared.");

  // Get all locations for matching
  const allLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));
  console.log(`Found ${allLocations.length} locations for matching`);

  // Cache for location lookups
  const locationCache = new Map<string, string>();

  // Get or find unmapped location bucket
  const unmappedLocation = allLocations.find(l => l.canonicalName === "Unmapped Locations");
  if (!unmappedLocation) {
    console.error("⚠️  'Unmapped Locations' bucket not found!");
    process.exit(1);
  }
  console.log(`Using 'Unmapped Locations' bucket: ${unmappedLocation.id}`);

  // Helper: Extract code from parentheses (e.g., "Capriotti's (IA069)" → "IA069")
  function extractCodeFromParentheses(text: string): string | null {
    const match = text.match(/\(([A-Za-z0-9|-]+)\)/);
    return match ? match[1].trim() : null;
  }

  // Helper: Find location (returns unmapped bucket if no match)
  async function findLocation(storeName: string, platform: "ubereats" | "doordash" | "grubhub") {
    const cacheKey = `${platform}:${storeName}`;
    if (locationCache.has(cacheKey)) {
      return locationCache.get(cacheKey)!;
    }

    // UberEats: Extract code from store name and match to uberEatsStoreLabel
    if (platform === "ubereats") {
      const extractedCode = extractCodeFromParentheses(storeName);
      if (extractedCode) {
        const location = allLocations.find(l => l.uberEatsStoreLabel === extractedCode);
        if (location) {
          locationCache.set(cacheKey, location.id);
          return location.id;
        }
      }
      locationCache.set(cacheKey, unmappedLocation.id);
      return unmappedLocation.id;
    }

    // DoorDash and Grubhub: Use platform-specific name fields
    const platformField = platform === "doordash" ? "doordashName" : "grubhubName";
    let location = allLocations.find(
      (l) =>
        l[platformField] === storeName ||
        l.canonicalName.toLowerCase() === storeName.toLowerCase()
    );

    if (location) {
      locationCache.set(cacheKey, location.id);
      return location.id;
    }

    // Fuzzy match for DoorDash and Grubhub
    let bestMatch: { location: any; score: number } | null = null;
    for (const loc of allLocations) {
      const canonicalSimilarity = calculateSimilarity(storeName, loc.canonicalName);
      const platformSimilarity = loc[platformField]
        ? calculateSimilarity(storeName, loc[platformField])
        : 0;
      const score = Math.max(canonicalSimilarity, platformSimilarity);

      if (score >= 0.8 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { location: loc, score };
      }
    }

    if (bestMatch) {
      locationCache.set(cacheKey, bestMatch.location.id);
      return bestMatch.location.id;
    }

    // Route to unmapped bucket
    locationCache.set(cacheKey, unmappedLocation.id);
    return unmappedLocation.id;
  }

  // Levenshtein distance for fuzzy matching
  function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const matrix: number[][] = [];

    for (let i = 0; i <= s2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= s1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= s2.length; i++) {
      for (let j = 1; j <= s1.length; j++) {
        if (s2.charAt(i - 1) === s1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[s2.length][s1.length];
  }

  // Import UberEats data
  console.log("\nImporting UberEats transactions...");
  const ubereatsCsv = readFileSync(
    "attached_assets/645fb228-803b-45e3-b6de-3e7792ef1a97-united_states (1)_1760994428325.csv",
    "utf-8"
  );
  const ubereatsRows = parse(ubereatsCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    from_line: 2,  // Skip first header row (descriptions), use second row (actual column names)
    relax_quotes: true,
    bom: true,  // Handle BOM in UTF-8 files
  });

  console.log(`Parsed ${ubereatsRows.length} UberEats rows`);

  // Aggregate by Order ID
  const orderMap = new Map<string, any>();
  
  for (const row of ubereatsRows) {
    const date = row["Order Date"] || "";
    const orderId = row["Order ID"] || "";
    const storeName = row["Store Name"] || "";
    
    // Only import transactions within our date range
    if (!date.startsWith("9/22/") && !date.startsWith("9/23/") && 
        !date.startsWith("9/24/") && !date.startsWith("9/25/") && 
        !date.startsWith("9/26/") && !date.startsWith("9/27/") && 
        !date.startsWith("9/28/")) {
      continue;
    }

    const uniqueKey = `${orderId}:${date}`;
    
    const salesExclTax = parseFloat(row["Sales (excl. tax)"] || "0") || 0;
    const taxOnSales = parseFloat(row["Tax on Sales"] || "0") || 0;
    const salesInclTax = parseFloat(row["Sales (incl. tax)"] || "0") || 0;
    
    const marketingAdjustment = parseFloat(row["Marketing Adjustment"] || "0") || 0;
    const marketplaceFee = parseFloat(row["Marketplace Fee"] || "0") || 0;
    const taxOnMarketplaceFee = parseFloat(row["Tax on Marketplace Fee"] || "0") || 0;
    const deliveryNetworkFee = parseFloat(row["Delivery Network Fee"] || "0") || 0;
    const taxOnDeliveryNetworkFee = parseFloat(row["Tax on Delivery Network Fee"] || "0") || 0;
    const orderProcessingFee = parseFloat(row["Order Processing Fee"] || "0") || 0;
    const tips = parseFloat(row["Tips"] || "0") || 0;
    const otherPayments = parseFloat(row["Other payments"] || "0") || 0;
    const totalSalesAfterAdj = parseFloat(row["Total Sales after Adjustments (incl tax)"] || "0") || 0;
    const offersOnItems = parseFloat(row["Offers on items (incl. tax)"] || "0") || 0;
    const deliveryOfferRedemptions = parseFloat(row["Delivery Offer Redemptions (incl. tax)"] || "0") || 0;

    if (!orderMap.has(uniqueKey)) {
      orderMap.set(uniqueKey, {
        orderId: orderId,
        date: date,
        storeName: storeName,
        time: row["Order Accept Time"] || "",
        orderStatus: row["Order Status"] || null,
        
        salesInclTax: 0,
        taxOnSales: 0,
        
        marketingAdjustment: marketingAdjustment,
        marketplaceFee: marketplaceFee,
        taxOnMarketplaceFee: taxOnMarketplaceFee,
        deliveryNetworkFee: deliveryNetworkFee,
        taxOnDeliveryNetworkFee: taxOnDeliveryNetworkFee,
        orderProcessingFee: orderProcessingFee,
        tips: tips,
        otherPayments: otherPayments,
        totalSalesAfterAdj: totalSalesAfterAdj,
        offersOnItems: offersOnItems,
        deliveryOfferRedemptions: deliveryOfferRedemptions,
      });
    }
    
    const order = orderMap.get(uniqueKey)!;
    order.salesInclTax += salesInclTax;
    order.taxOnSales += taxOnSales;
  }

  console.log(`Aggregated into ${orderMap.size} unique orders`);

  const ubereatsMap = new Map<string, any>();
  for (const [uniqueKey, order] of orderMap) {
    const locationId = await findLocation(order.storeName, "ubereats");
    const clientKey = `${client.id}:${order.orderId}:${order.date}`;

    const netPayout = order.totalSalesAfterAdj 
      - order.marketplaceFee 
      - order.taxOnMarketplaceFee
      - order.deliveryNetworkFee
      - order.taxOnDeliveryNetworkFee
      - order.orderProcessingFee
      - order.marketingAdjustment
      + order.tips
      + order.otherPayments;

    ubereatsMap.set(clientKey, {
      clientId: client.id,
      locationId: locationId,
      orderId: order.orderId,
      date: order.date,
      time: order.time,
      location: order.storeName,
      storeName: order.storeName,
      subtotal: order.salesInclTax - order.taxOnSales,
      salesExclTax: order.salesInclTax - order.taxOnSales,
      tax: order.taxOnSales,
      deliveryFee: 0,
      serviceFee: 0,
      offersOnItems: order.offersOnItems,
      deliveryOfferRedemptions: order.deliveryOfferRedemptions,
      marketingPromo: order.marketingAdjustment < 0 ? "Marketing Adjustment" : null,
      marketingAmount: Math.abs(order.marketingAdjustment),
      platformFee: order.marketplaceFee,
      otherPayments: order.otherPayments,
      netPayout: netPayout,
      customerRating: null,
      orderStatus: order.orderStatus,
    });
  }

  console.log(`Upserting ${ubereatsMap.size} UberEats transactions...`);
  let uberCount = 0;
  for (const [, txn] of ubereatsMap) {
    await db
      .insert(uberEatsTransactions)
      .values(txn)
      .onConflictDoUpdate({
        target: [
          uberEatsTransactions.clientId,
          uberEatsTransactions.orderId,
          uberEatsTransactions.date,
        ],
        set: {
          locationId: sql`EXCLUDED.location_id`,
          time: sql`EXCLUDED.time`,
          location: sql`EXCLUDED.location`,
          storeName: sql`EXCLUDED.store_name`,
          subtotal: sql`EXCLUDED.subtotal`,
          salesExclTax: sql`EXCLUDED.sales_excl_tax`,
          tax: sql`EXCLUDED.tax`,
          offersOnItems: sql`EXCLUDED.offers_on_items`,
          deliveryOfferRedemptions: sql`EXCLUDED.delivery_offer_redemptions`,
          marketingPromo: sql`EXCLUDED.marketing_promo`,
          marketingAmount: sql`EXCLUDED.marketing_amount`,
          platformFee: sql`EXCLUDED.platform_fee`,
          otherPayments: sql`EXCLUDED.other_payments`,
          netPayout: sql`EXCLUDED.net_payout`,
          orderStatus: sql`EXCLUDED.order_status`,
        },
      });
    uberCount++;
    if (uberCount % 100 === 0) console.log(`Upserted ${uberCount}/${ubereatsMap.size}`);
  }

  // Import DoorDash data
  console.log("\nImporting DoorDash transactions...");
  const doordashCsv = readFileSync(
    "attached_assets/financials_detailed_transactions_summarized_us_2025-09-22_2025-09-28_W0rt2_2025-10-20T05-27-06Z_1760994428326.csv",
    "utf-8"
  );
  const doordashRows = parse(doordashCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${doordashRows.length} DoorDash rows`);

  const doordashMap = new Map<string, any>();
  for (const row of doordashRows) {
    const storeId = row["Merchant Store ID"] || "";
    const storeName = row["Store Name"] || "";
    const startDate = row["Transactions Start Local Date"] || "";
    const endDate = row["Transactions End Local Date"] || "";

    const locationId = await findLocation(storeName, "doordash");
    const clientKey = `${client.id}:${storeId}:${startDate}:${endDate}`;

    // Parse all financial fields
    const subtotal = parseFloat(row["Subtotal"] || "0") || 0;
    const subtotalTax = parseFloat(row["Subtotal Tax Passed by DoorDash to Merchant"] || "0") || 0;
    const commission = parseFloat(row["Commission"] || "0") || 0;
    const marketingFees = parseFloat(row["Marketing Fees (for historical reference only) | (All discounts and fees)"] || "0") || 0;
    const tips = parseFloat(row["Total Tips"] || "0") || 0;
    const adjustments = parseFloat(row["Adjustments | (for historical reference only)"] || "0") || 0;
    const totalPayout = parseFloat(row["Net Payout"] || "0") || 0;

    // Customer discounts  
    const customerDiscountsMerchant = Math.abs(parseFloat(row["Customer-Facing Discounts (Merchant-Funded)"] || "0") || 0);
    const customerDiscountsDoorDash = Math.abs(parseFloat(row["Customer-Facing Discounts (DoorDash-Funded)"] || "0") || 0);
    const customerDiscountsThirdParty = Math.abs(parseFloat(row["Customer-Facing Discounts (Third-Party-Funded)"] || "0") || 0);
    const otherPaymentsDesc = row["Other Payments Description"] || "";
    const otherPayments = parseFloat(row["Other Payments"] || "0") || 0;

    doordashMap.set(clientKey, {
      clientId: client.id,
      locationId: locationId,
      merchantStoreId: storeId,
      storeName: storeName,
      transactionDate: startDate,
      transactionEndDate: endDate,
      salesExclTax: subtotal,
      orderSubtotal: subtotal,
      subtotalTax: subtotalTax,
      commission: commission,
      marketingFees: marketingFees,
      tips: tips,
      adjustments: adjustments,
      totalPayout: totalPayout,
      netPayment: totalPayout,
      offersOnItems: customerDiscountsMerchant,
      deliveryOfferRedemptions: customerDiscountsDoorDash,
      thirdPartyContribution: customerDiscountsThirdParty,
      otherPaymentsDescription: otherPaymentsDesc,
      otherPayments: otherPaymentsDesc ? Math.abs(otherPayments) : 0,
      channel: "Marketplace",
      orderStatus: "Delivered",
    });
  }

  console.log(`Upserting ${doordashMap.size} DoorDash transactions...`);
  let doorCount = 0;
  for (const [, txn] of doordashMap) {
    await db
      .insert(doordashTransactions)
      .values(txn)
      .onConflictDoUpdate({
        target: [
          doordashTransactions.clientId,
          doordashTransactions.merchantStoreId,
          doordashTransactions.transactionDate,
          doordashTransactions.transactionEndDate,
        ],
        set: {
          locationId: sql`EXCLUDED.location_id`,
          storeName: sql`EXCLUDED.store_name`,
          salesExclTax: sql`EXCLUDED.sales_excl_tax`,
          orderSubtotal: sql`EXCLUDED.order_subtotal`,
          subtotalTax: sql`EXCLUDED.subtotal_tax`,
          commission: sql`EXCLUDED.commission`,
          marketingFees: sql`EXCLUDED.marketing_fees`,
          tips: sql`EXCLUDED.tips`,
          adjustments: sql`EXCLUDED.adjustments`,
          totalPayout: sql`EXCLUDED.total_payout`,
          netPayment: sql`EXCLUDED.net_payment`,
          offersOnItems: sql`EXCLUDED.offers_on_items`,
          deliveryOfferRedemptions: sql`EXCLUDED.delivery_offer_redemptions`,
          thirdPartyContribution: sql`EXCLUDED.third_party_contribution`,
          otherPaymentsDescription: sql`EXCLUDED.other_payments_description`,
          otherPayments: sql`EXCLUDED.other_payments`,
        },
      });
    doorCount++;
    if (doorCount % 100 === 0) console.log(`Upserted ${doorCount}/${doordashMap.size}`);
  }

  // Import Grubhub data
  console.log("\nImporting Grubhub transactions...");
  const grubhubCsv = readFileSync(
    "attached_assets/caps_-_9_22_1760994428325.csv",
    "utf-8"
  );
  const grubhubRows = parse(grubhubCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${grubhubRows.length} Grubhub rows`);

  const grubhubMap = new Map<string, any>();
  for (const row of grubhubRows) {
    const orderNumber = row["order_number"] || "";
    const orderDate = row["transaction_date"] || "";
    const storeName = row["store_name"] || "";
    const address = row["street_address"] || "";

    const locationId = await findLocation(storeName, "grubhub");
    const clientKey = `${client.id}:${orderNumber}:${orderDate}`;

    const saleAmount = parseFloat(row["subtotal"] || "0") || 0;
    const tax = parseFloat(row["subtotal_sales_tax"] || "0") || 0;
    const netPayment = parseFloat(row["net_payment"] || "0") || 0;
    const transactionType = row["transaction_type"] || "";
    const merchantFundedPromotion = parseFloat(row["merchant_funded_promotion"] || "0") || 0;
    const fulfillmentType = row["fulfillment_type"] || "";

    grubhubMap.set(clientKey, {
      clientId: client.id,
      locationId: locationId,
      orderNumber: orderNumber,
      orderDate: orderDate,
      storeName: storeName,
      address: address,
      saleAmount: saleAmount,
      tax: tax,
      netPayment: netPayment,
      transactionType: transactionType,
      merchantFundedPromotion: merchantFundedPromotion,
      fulfillmentType: fulfillmentType,
    });
  }

  console.log(`Upserting ${grubhubMap.size} Grubhub transactions in batches...`);
  let grubCount = 0;
  for (const [, txn] of grubhubMap) {
    await db
      .insert(grubhubTransactions)
      .values(txn)
      .onConflictDoUpdate({
        target: [
          grubhubTransactions.clientId,
          grubhubTransactions.orderNumber,
          grubhubTransactions.orderDate,
        ],
        set: {
          locationId: sql`EXCLUDED.location_id`,
          storeName: sql`EXCLUDED.store_name`,
          address: sql`EXCLUDED.address`,
          saleAmount: sql`EXCLUDED.sale_amount`,
          tax: sql`EXCLUDED.tax`,
          netPayment: sql`EXCLUDED.net_payment`,
          transactionType: sql`EXCLUDED.transaction_type`,
          merchantFundedPromotion: sql`EXCLUDED.merchant_funded_promotion`,
          fulfillmentType: sql`EXCLUDED.fulfillment_type`,
        },
      });
    grubCount++;
    if (grubCount % 100 === 0) console.log(`Upserted ${grubCount}/${grubhubMap.size}`);
  }

  console.log("\n✅ Import complete for week 9/22!");
}

importWeek9_22().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
