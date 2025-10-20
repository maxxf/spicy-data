import { db } from "../server/db";
import { clients, locations, uberEatsTransactions, doordashTransactions, grubhubTransactions } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

async function importWeek10_6() {
  console.log("Starting import for week 10/6 (Oct 6-12, 2025)...\n");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Client 'Capriotti's' not found!");
    process.exit(1);
  }
  console.log(`Client: ${client.name} (${client.id})`);

  // Delete existing transactions for this week
  console.log("\nClearing existing transactions for week 10/6...");
  
  // UberEats uses M/D/YY format
  await db.delete(uberEatsTransactions).where(
    and(
      eq(uberEatsTransactions.clientId, client.id),
      sql`date >= '10/6/25' AND date <= '10/12/25'`
    )
  );
  
  // DoorDash uses YYYY-MM-DD format
  await db.delete(doordashTransactions).where(
    and(
      eq(doordashTransactions.clientId, client.id),
      sql`transaction_date >= '2025-10-06'`,
      sql`transaction_date <= '2025-10-12'`
    )
  );
  
  // Grubhub uses YYYY-MM-DD format
  await db.delete(grubhubTransactions).where(
    and(
      eq(grubhubTransactions.clientId, client.id),
      sql`order_date >= '2025-10-06'`,
      sql`order_date <= '2025-10-12'`
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
      // Route to unmapped bucket instead of returning null
      console.log(`⚠️  No match found for "${storeName}" (code: ${extractedCode || 'none'}) → routing to Unmapped Locations`);
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

    // Route to unmapped bucket instead of returning null
    console.log(`⚠️  No match found for "${storeName}" → routing to Unmapped Locations`);
    locationCache.set(cacheKey, unmappedLocation.id);
    return unmappedLocation.id;
  }

  function calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    if (longer.length === 0) return 1.0;
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
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
    return matrix[str2.length][str1.length];
  }

  // Import UberEats data
  console.log("\nImporting UberEats transactions...");
  const ubereatsCsv = readFileSync(
    "attached_assets/6784c24a-0b8f-4c69-8a61-77e74bb89811-united_states_1760928022792.csv",
    "utf-8"
  );
  const ubereatsRows = parse(ubereatsCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    from_line: 1,
    relax_quotes: true,
  });

  console.log(`Parsed ${ubereatsRows.length} UberEats rows`);

  // Use Map to deduplicate by unique constraint (clientId, orderId, date)
  const ubereatsMap = new Map<string, any>();
  for (const row of ubereatsRows) {
    const date = row["Order Date"] || "";
    const orderId = row["Order ID"] || "";
    const storeName = row["Store Name"] || "";
    
    // Only import transactions within our date range
    if (!date.startsWith("10/6/") && !date.startsWith("10/7/") && 
        !date.startsWith("10/8/") && !date.startsWith("10/9/") && 
        !date.startsWith("10/10/") && !date.startsWith("10/11/") && 
        !date.startsWith("10/12/")) {
      continue;
    }

    const locationId = await findLocation(storeName, "ubereats");
    const uniqueKey = `${client.id}:${orderId}:${date}`;

    // New CSV format has different column names
    const salesExclTax = parseFloat(row["Sales (excl. tax)"] || "0") || 0;
    const taxOnSales = parseFloat(row["Tax on Sales"] || "0") || 0;
    const salesInclTax = parseFloat(row["Sales (incl. tax)"] || "0") || 0;
    const marketingAdjustment = parseFloat(row["Marketing Adjustment"] || "0") || 0;
    const marketplaceFee = parseFloat(row["Marketplace Fee"] || "0") || 0;
    const deliveryFee = parseFloat(row["Delivery Fee"] || "0") || 0;
    const tips = parseFloat(row["Tips"] || "0") || 0;
    const otherPayments = parseFloat(row["Other payments"] || "0") || 0;
    
    // Calculate net payout (approximate - this is a simplified version)
    const totalSalesAfterAdj = parseFloat(row["Total Sales after Adjustments (incl tax)"] || "0") || 0;
    const netPayout = totalSalesAfterAdj - marketplaceFee - Math.abs(marketingAdjustment) + tips + otherPayments;

    // Keep the last occurrence (most recent data)
    ubereatsMap.set(uniqueKey, {
      clientId: client.id,
      locationId: locationId,
      orderId: orderId,
      date: date,
      time: row["Order Accept Time"] || "",
      location: storeName,
      subtotal: salesInclTax, // Using sales incl tax as subtotal
      tax: taxOnSales,
      deliveryFee: deliveryFee,
      serviceFee: 0, // Not in this format
      marketingPromo: row["Other payments description"] || null,
      marketingAmount: Math.abs(marketingAdjustment),
      platformFee: marketplaceFee,
      netPayout: netPayout,
      customerRating: null, // Not in this format
      orderStatus: row["Order Status"] || null,
    });
  }

  const ubereatsTransactionsToInsert = Array.from(ubereatsMap.values());

  console.log(`Upserting ${ubereatsTransactionsToInsert.length} UberEats transactions...`);
  for (let i = 0; i < ubereatsTransactionsToInsert.length; i += 100) {
    const batch = ubereatsTransactionsToInsert.slice(i, i + 100);
    await db
      .insert(uberEatsTransactions)
      .values(batch)
      .onConflictDoUpdate({
        target: [uberEatsTransactions.clientId, uberEatsTransactions.orderId, uberEatsTransactions.date],
        set: {
          locationId: sql`excluded.location_id`,
          time: sql`excluded.time`,
          location: sql`excluded.location`,
          subtotal: sql`excluded.subtotal`,
          tax: sql`excluded.tax`,
          deliveryFee: sql`excluded.delivery_fee`,
          serviceFee: sql`excluded.service_fee`,
          marketingPromo: sql`excluded.marketing_promo`,
          marketingAmount: sql`excluded.marketing_amount`,
          platformFee: sql`excluded.platform_fee`,
          netPayout: sql`excluded.net_payout`,
          customerRating: sql`excluded.customer_rating`,
          orderStatus: sql`excluded.order_status`,
        },
      });
    console.log(`Upserted ${Math.min(i + 100, ubereatsTransactionsToInsert.length)}/${ubereatsTransactionsToInsert.length}`);
  }

  // Import DoorDash data
  console.log("\nImporting DoorDash transactions...");
  const doordashCsv = readFileSync(
    "attached_assets/FINANCIAL_DETAILED_TRANSACTIONS_2025-10-06_2025-10-12_fMQyL_2025-10-13T17-38-47Z 2_1760922116017.csv",
    "utf-8"
  );
  const doordashRows = parse(doordashCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${doordashRows.length} DoorDash rows`);

  // Use Map to deduplicate by unique constraint (clientId, transactionId)
  const doordashMap = new Map<string, any>();
  for (const row of doordashRows) {
    const storeName = row["Store name"] || "";
    const transactionId = row["DoorDash transaction ID"] || "";
    const transactionDate = row["Timestamp local date"] || "";
    const locationId = await findLocation(storeName, "doordash");
    const uniqueKey = `${client.id}:${transactionId}`;

    const subtotal = parseFloat(row["Subtotal"] || "0") || 0;
    const taxes = parseFloat(row["Subtotal tax passed to merchant"] || "0") || 0;
    const marketingFees = Math.abs(parseFloat(row["Marketing fees | (including any applicable taxes)"] || "0") || 0);

    // Keep the last occurrence (most recent data)
    doordashMap.set(uniqueKey, {
      clientId: client.id,
      locationId: locationId,
      transactionId: transactionId,
      orderNumber: row["DoorDash order ID"] || "",
      transactionDate: transactionDate,
      storeLocation: storeName,
      channel: row["Channel"] || "",
      orderStatus: row["Final order status"] || "",
      orderSubtotal: subtotal,
      salesExclTax: subtotal,
      taxes: taxes,
      deliveryFees: 0, // Not in this format
      commission: parseFloat(row["Commission"] || "0") || 0,
      marketingSpend: marketingFees,
      otherPayments: marketingFees,
      otherPaymentsDescription: marketingFees > 0 ? "Marketing fees" : null,
      errorCharges: parseFloat(row["Error charges"] || "0") || 0,
      netPayment: parseFloat(row["Net total"] || "0") || 0,
      totalPayout: parseFloat(row["Net total"] || "0") || 0,
      orderSource: row["Channel"] || "",
      offersOnItems: 0,
      deliveryOfferRedemptions: 0,
      marketingCredits: parseFloat(row["DoorDash marketing credit"] || "0") || 0,
      thirdPartyContribution: parseFloat(row["Third-party contribution"] || "0") || 0,
    });
  }

  const doordashTransactionsToInsert = Array.from(doordashMap.values());

  console.log(`Upserting ${doordashTransactionsToInsert.length} DoorDash transactions...`);
  for (let i = 0; i < doordashTransactionsToInsert.length; i += 100) {
    const batch = doordashTransactionsToInsert.slice(i, i + 100);
    await db
      .insert(doordashTransactions)
      .values(batch)
      .onConflictDoUpdate({
        target: [doordashTransactions.clientId, doordashTransactions.transactionId],
        set: {
          locationId: sql`excluded.location_id`,
          orderNumber: sql`excluded.order_number`,
          transactionDate: sql`excluded.transaction_date`,
          storeLocation: sql`excluded.store_location`,
          channel: sql`excluded.channel`,
          orderStatus: sql`excluded.order_status`,
          orderSubtotal: sql`excluded.order_subtotal`,
          salesExclTax: sql`excluded.sales_excl_tax`,
          taxes: sql`excluded.taxes`,
          deliveryFees: sql`excluded.delivery_fees`,
          commission: sql`excluded.commission`,
          marketingSpend: sql`excluded.marketing_spend`,
          otherPayments: sql`excluded.other_payments`,
          otherPaymentsDescription: sql`excluded.other_payments_description`,
          netPayment: sql`excluded.net_payment`,
          totalPayout: sql`excluded.total_payout`,
        },
      });
    console.log(`Upserted ${Math.min(i + 100, doordashTransactionsToInsert.length)}/${doordashTransactionsToInsert.length}`);
  }

  // Import Grubhub data
  console.log("\nImporting Grubhub transactions...");
  const grubhubCsv = readFileSync(
    "attached_assets/Grubhub_Payments_-_Last_week__1760922116017.csv",
    "utf-8"
  );
  const grubhubRows = parse(grubhubCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${grubhubRows.length} Grubhub rows`);

  // Use Map to deduplicate by unique constraint (clientId, transactionId)
  const grubhubMap = new Map<string, any>();
  for (const row of grubhubRows) {
    const storeName = row["store_name"] || "";
    const orderDate = row["transaction_date"] || "";
    const transactionId = row["transaction_id"] || "";
    
    // Only import transactions within our date range
    if (orderDate < "2025-10-06" || orderDate > "2025-10-12") {
      continue;
    }

    const locationId = await findLocation(storeName, "grubhub");
    const uniqueKey = `${client.id}:${transactionId}`;

    const subtotal = parseFloat(row["subtotal"] || "0") || 0;
    const subtotalSalesTax = parseFloat(row["subtotal_sales_tax"] || "0") || 0;

    // Keep the last occurrence (most recent data)
    grubhubMap.set(uniqueKey, {
      clientId: client.id,
      locationId: locationId,
      transactionId: transactionId,
      orderId: row["order_number"] || "",
      orderDate: orderDate,
      restaurant: storeName,
      transactionType: row["transaction_type"] || "",
      orderChannel: row["order_channel"] || "",
      fulfillmentType: row["fulfillment_type"] || "",
      subtotal: subtotal,
      subtotalSalesTax: subtotalSalesTax,
      saleAmount: subtotal + subtotalSalesTax,
      commission: parseFloat(row["commission"] || "0") || 0,
      deliveryCommission: parseFloat(row["delivery_commission"] || "0") || 0,
      processingFee: parseFloat(row["processing_fee"] || "0") || 0,
      merchantFundedPromotion: parseFloat(row["merchant_funded_promotion"] || "0") || 0,
      merchantNetTotal: parseFloat(row["merchant_net_total"] || "0") || 0,
      customerType: row["gh_plus_customer"] === "GH+" ? "GH+" : "non GH+",
    });
  }

  const grubhubTransactionsToInsert = Array.from(grubhubMap.values());

  console.log(`Upserting ${grubhubTransactionsToInsert.length} Grubhub transactions in batches...`);
  for (let i = 0; i < grubhubTransactionsToInsert.length; i += 100) {
    const batch = grubhubTransactionsToInsert.slice(i, i + 100);
    await db
      .insert(grubhubTransactions)
      .values(batch)
      .onConflictDoUpdate({
        target: [grubhubTransactions.clientId, grubhubTransactions.transactionId],
        set: {
          locationId: sql`excluded.location_id`,
          orderId: sql`excluded.order_id`,
          orderDate: sql`excluded.order_date`,
          restaurant: sql`excluded.restaurant`,
          transactionType: sql`excluded.transaction_type`,
          orderChannel: sql`excluded.order_channel`,
          fulfillmentType: sql`excluded.fulfillment_type`,
          subtotal: sql`excluded.subtotal`,
          subtotalSalesTax: sql`excluded.subtotal_sales_tax`,
          saleAmount: sql`excluded.sale_amount`,
          commission: sql`excluded.commission`,
          deliveryCommission: sql`excluded.delivery_commission`,
          processingFee: sql`excluded.processing_fee`,
          merchantFundedPromotion: sql`excluded.merchant_funded_promotion`,
          merchantNetTotal: sql`excluded.merchant_net_total`,
          customerType: sql`excluded.customer_type`,
        },
      });
    console.log(`Upserted ${Math.min(i + 100, grubhubTransactionsToInsert.length)}/${grubhubTransactionsToInsert.length}`);
  }

  console.log("\n✅ Import complete for week 10/6!");
}

importWeek10_6().catch(console.error).finally(() => process.exit(0));
