import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { db } from "../server/db";
import {
  doordashTransactions,
  grubhubTransactions,
  uberEatsTransactions,
  clients,
  locations,
} from "../shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

async function main() {
  console.log("Starting import for week 9/29-10/5/2025...");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }
  console.log(`Found client: ${client.name} (${client.id})`);

  // Clear transactions for week of 9/29 only
  console.log("Clearing transactions for week 9/29-10/5...");
  
  // Uber Eats uses M/D/YY format
  await db.delete(uberEatsTransactions).where(
    and(
      eq(uberEatsTransactions.clientId, client.id),
      gte(uberEatsTransactions.date, "9/29/25"),
      lte(uberEatsTransactions.date, "10/5/25")
    )
  );
  
  // DoorDash uses YYYY-MM-DD format
  await db.delete(doordashTransactions).where(
    and(
      eq(doordashTransactions.clientId, client.id),
      gte(doordashTransactions.transactionDate, "2025-09-29"),
      lte(doordashTransactions.transactionDate, "2025-10-05")
    )
  );
  
  // Grubhub uses YYYY-MM-DD format
  await db.delete(grubhubTransactions).where(
    and(
      eq(grubhubTransactions.clientId, client.id),
      gte(grubhubTransactions.orderDate, "2025-09-29"),
      lte(grubhubTransactions.orderDate, "2025-10-05")
    )
  );
  
  console.log("Old transactions cleared.");

  // Get all locations for matching
  const allLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));
  console.log(`Found ${allLocations.length} locations for matching`);
  
  // Debug: Check how many have UberEats store labels
  const uberEatsLocations = allLocations.filter(l => l.uberEatsStoreLabel);
  console.log(`Locations with UberEats store labels: ${uberEatsLocations.length}`);
  if (uberEatsLocations.length > 0) {
    console.log(`Sample UberEats labels: ${uberEatsLocations.slice(0, 5).map(l => l.uberEatsStoreLabel).join(', ')}`);
  }

  // Cache for location lookups
  const locationCache = new Map<string, string>();

  // Helper: Extract code from parentheses (e.g., "Capriotti's (IA069)" → "IA069")
  function extractCodeFromParentheses(text: string): string | null {
    const match = text.match(/\(([A-Za-z0-9|-]+)\)/);
    return match ? match[1].trim() : null;
  }

  // Get or find unmapped location bucket
  const unmappedLocation = allLocations.find(l => l.canonicalName === "Unmapped Locations");
  if (!unmappedLocation) {
    console.error("⚠️  'Unmapped Locations' bucket not found!");
    process.exit(1);
  }
  console.log(`Using 'Unmapped Locations' bucket: ${unmappedLocation.id}`);

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
      console.log(`Matched "${storeName}" to "${bestMatch.location.canonicalName}" (score: ${bestMatch.score.toFixed(2)})`);
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
    "attached_assets/aa8b1212-5eb3-4c31-82bf-61118961e3c9-united_states_1760938287485.csv",
    "utf-8"
  );
  const ubereatsRows = parse(ubereatsCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    from_line: 1, // Line 1 has the actual headers
    relax_quotes: true, // Handle multi-line headers
  });

  console.log(`Parsed ${ubereatsRows.length} UberEats rows`);
  
  // Debug: Check what columns exist in the first row
  if (ubereatsRows.length > 0) {
    const firstRow = ubereatsRows[0];
    const columnNames = Object.keys(firstRow);
    console.log(`First 10 column names: ${columnNames.slice(0, 10).join(', ')}`);
    console.log(`Store Name value in first row: "${firstRow["Store Name"]}"`);
    // Try with BOM
    console.log(`Try with BOM: "${firstRow["\ufeffStore Name"]}"`);
  }

  const ubereatsTransactionsToInsert = [];
  let processedCount = 0;
  let matchedCount = 0;
  let skippedNoName = 0;
  let skippedNoMatch = 0;
  
  for (const row of ubereatsRows) {
    // Try to get store name with or without BOM
    const storeName = row["Store Name"] || row["\ufeffStore Name"] || "";
    if (!storeName || storeName.trim() === "") {
      skippedNoName++;
      continue;
    }

    const locationId = await findLocation(storeName, "ubereats");
    if (!locationId) {
      skippedNoMatch++;
      continue;
    }
    matchedCount++;
    
    processedCount++;
    if (processedCount % 500 === 0) {
      console.log(`Processed ${processedCount}/${ubereatsRows.length} UberEats rows...`);
    }

    const parseFloatSafe = (val: any) => {
      if (!val || val === "") return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    // Skip rows without Order ID (e.g., Ad Spend summary rows)
    const orderId = row["Order ID"] || "";
    if (!orderId || orderId.trim() === "") {
      continue;
    }

    const offersOnItems = Math.abs(parseFloatSafe(row["Offers on items (incl. tax)"]));
    const deliveryOfferRedemptions = Math.abs(parseFloatSafe(row["Delivery Offer Redemptions (incl. tax)"]));
    const marketingAdjustment = parseFloatSafe(row["Marketing Adjustment"]);
    const otherPayments = Math.abs(parseFloatSafe(row["Other payments"]));

    ubereatsTransactionsToInsert.push({
      clientId: client.id,
      locationId,
      orderId,
      date: row["Order Date"] || "",
      time: row["Order Accept Time"] || "",
      location: storeName,
      subtotal: parseFloatSafe(row["Sales (excl. tax)"]),
      tax: parseFloatSafe(row["Tax on Sales"]),
      deliveryFee: parseFloatSafe(row["Delivery Fee"]),
      serviceFee: 0,
      marketingPromo: (offersOnItems > 0 || deliveryOfferRedemptions > 0 || marketingAdjustment !== 0 || otherPayments !== 0) ? "Yes" : null,
      marketingAmount: offersOnItems + deliveryOfferRedemptions + Math.abs(marketingAdjustment) + otherPayments,
      platformFee: parseFloatSafe(row["Marketplace Fee"]),
      netPayout: parseFloatSafe(row["Total payout"]),
      customerRating: null,
      orderStatus: row["Order Status"] || null,
    });
  }

  console.log(`\nUberEats Summary:`);
  console.log(`  Total rows parsed: ${ubereatsRows.length}`);
  console.log(`  Skipped (no store name): ${skippedNoName}`);
  console.log(`  Skipped (no location match): ${skippedNoMatch}`);
  console.log(`  Successfully matched: ${matchedCount}`);
  
  // Deduplicate transactions by (clientId, orderId, date) - keep the last occurrence
  const transactionMap = new Map<string, typeof ubereatsTransactionsToInsert[0]>();
  for (const transaction of ubereatsTransactionsToInsert) {
    const key = `${transaction.clientId}|${transaction.orderId}|${transaction.date}`;
    transactionMap.set(key, transaction);
  }
  const uniqueTransactions = Array.from(transactionMap.values());
  
  console.log(`After deduplication: ${uniqueTransactions.length} unique UberEats transactions`);
  console.log(`Upserting ${uniqueTransactions.length} UberEats transactions in batches...`);
  const chunkSize = 100; // Smaller chunks for upsert
  for (let i = 0; i < uniqueTransactions.length; i += chunkSize) {
    const chunk = uniqueTransactions.slice(i, i + chunkSize);
    // Batch upsert using a loop but with better error handling
    await db.insert(uberEatsTransactions)
      .values(chunk)
      .onConflictDoUpdate({
        target: [uberEatsTransactions.clientId, uberEatsTransactions.orderId, uberEatsTransactions.date],
        set: {
          locationId: sql`excluded.location_id`,
          location: sql`excluded.location`,
          time: sql`excluded.time`,
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
        }
      });
    console.log(`Upserted ${Math.min(i + chunkSize, uniqueTransactions.length)}/${uniqueTransactions.length}`);
  }

  // Import DoorDash data
  console.log("\nImporting DoorDash transactions...");
  const doordashCsv = readFileSync(
    "attached_assets/financials_simplified_transactions_us_2025-09-29_2025-10-05_5Gbw1_2025-10-19T18-21-21Z 2_1760937747501.csv",
    "utf-8"
  );
  const doordashRows = parse(doordashCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${doordashRows.length} DoorDash rows`);

  const doordashTransactionsToInsert = [];
  for (const row of doordashRows) {
    const storeName = row["Store name"] || "";
    if (!storeName) continue;

    const locationId = await findLocation(storeName, "doordash");
    if (!locationId) continue;

    const parseFloat = (val: any) => {
      if (!val || val === "") return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    const merchantFundedDiscount = Math.abs(parseFloat(row["Merchant funded discounts"]));
    const thirdPartyFundedDiscount = Math.abs(parseFloat(row["Third-party funded discounts"]));
    const marketingFees = Math.abs(parseFloat(row["Marketing fees | (including any applicable taxes)"]));
    const marketingCredit = Math.abs(parseFloat(row["DoorDash marketing credit"]));
    const thirdPartyContrib = Math.abs(parseFloat(row["Third-party contribution"]));
    
    doordashTransactionsToInsert.push({
      clientId: client.id,
      locationId,
      transactionId: row["DoorDash transaction ID"] || "",
      orderNumber: row["DoorDash order ID"] || "",
      transactionDate: row["Timestamp local time"]?.split(" ")[0] || "",
      storeLocation: storeName,
      channel: row.Channel || null,
      orderStatus: "Completed",
      salesExclTax: parseFloat(row.Subtotal),
      orderSubtotal: parseFloat(row.Subtotal),
      taxes: parseFloat(row["Tax (subtotal)"]),
      deliveryFees: 0,
      commission: parseFloat(row.Commission),
      errorCharges: parseFloat(row["Error charges"]) || 0,
      offersOnItems: merchantFundedDiscount, 
      deliveryOfferRedemptions: parseFloat(row["Discounts"]) - merchantFundedDiscount,
      marketingCredits: marketingCredit,
      thirdPartyContribution: thirdPartyFundedDiscount + thirdPartyContrib,
      otherPayments: marketingFees,
      otherPaymentsDescription: marketingFees !== 0 ? "Marketing fees" : null,
      marketingSpend: marketingFees,
      totalPayout: parseFloat(row["Net total"]),
      netPayment: parseFloat(row["Net total"]),
      orderSource: row.Channel || null,
    });
  }

  console.log(`Upserting ${doordashTransactionsToInsert.length} DoorDash transactions in batches...`);
  for (let i = 0; i < doordashTransactionsToInsert.length; i += chunkSize) {
    const chunk = doordashTransactionsToInsert.slice(i, i + chunkSize);
    await db.insert(doordashTransactions)
      .values(chunk)
      .onConflictDoUpdate({
        target: [doordashTransactions.clientId, doordashTransactions.transactionId],
        set: {
          locationId: sql`excluded.location_id`,
          orderNumber: sql`excluded.order_number`,
          storeLocation: sql`excluded.store_location`,
          channel: sql`excluded.channel`,
          orderStatus: sql`excluded.order_status`,
          salesExclTax: sql`excluded.sales_excl_tax`,
          orderSubtotal: sql`excluded.order_subtotal`,
          taxes: sql`excluded.taxes`,
          deliveryFees: sql`excluded.delivery_fees`,
          commission: sql`excluded.commission`,
          errorCharges: sql`excluded.error_charges`,
          offersOnItems: sql`excluded.offers_on_items`,
          deliveryOfferRedemptions: sql`excluded.delivery_offer_redemptions`,
          marketingCredits: sql`excluded.marketing_credits`,
          thirdPartyContribution: sql`excluded.third_party_contribution`,
          otherPayments: sql`excluded.other_payments`,
          otherPaymentsDescription: sql`excluded.other_payments_description`,
          marketingSpend: sql`excluded.marketing_spend`,
          totalPayout: sql`excluded.total_payout`,
          netPayment: sql`excluded.net_payment`,
          orderSource: sql`excluded.order_source`,
        }
      });
    console.log(`Upserted ${Math.min(i + chunkSize, doordashTransactionsToInsert.length)}/${doordashTransactionsToInsert.length}`);
  }

  // Import Grubhub data
  console.log("\nImporting Grubhub transactions...");
  const grubhubCsv = readFileSync(
    "attached_assets/caps_9_29_1760938287486.csv",
    "utf-8"
  );
  const grubhubRows = parse(grubhubCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`Parsed ${grubhubRows.length} Grubhub rows`);

  const grubhubTransactionsToInsert = [];
  for (const row of grubhubRows) {
    const storeName = row.store_name || "";
    if (!storeName) continue;

    const locationId = await findLocation(storeName, "grubhub");
    if (!locationId) continue;

    const parseFloat = (val: any) => {
      if (!val || val === "") return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    const subtotal = parseFloat(row.subtotal);
    const tax = parseFloat(row.subtotal_sales_tax);

    grubhubTransactionsToInsert.push({
      clientId: client.id,
      locationId,
      orderId: row.order_number || "",
      orderDate: row.transaction_date || "",
      transactionType: row.transaction_type || "Prepaid Order",
      transactionId: row.transaction_id || "", // Use Grubhub's unique transaction ID
      restaurant: storeName,
      orderChannel: row.order_channel || null,
      fulfillmentType: row.fulfillment_type || null,
      subtotal: subtotal,
      saleAmount: subtotal + tax,
      subtotalSalesTax: tax,
      taxAmount: tax,
      commission: parseFloat(row.commission),
      deliveryCharge: parseFloat(row.self_delivery_charge),
      processingFee: parseFloat(row.processing_fee),
      merchantFundedPromotion: Math.abs(parseFloat(row.merchant_funded_promotion)),
      merchantNetTotal: parseFloat(row.merchant_net_total),
      transactionNote: row.transaction_note || null,
      customerType: row.gh_plus_customer || "non GH+",
    });
  }

  console.log(`Upserting ${grubhubTransactionsToInsert.length} Grubhub transactions in batches...`);
  for (let i = 0; i < grubhubTransactionsToInsert.length; i += chunkSize) {
    const chunk = grubhubTransactionsToInsert.slice(i, i + chunkSize);
    await db.insert(grubhubTransactions)
      .values(chunk)
      .onConflictDoUpdate({
        target: [grubhubTransactions.clientId, grubhubTransactions.transactionId],
        set: {
          locationId: sql`excluded.location_id`,
          orderId: sql`excluded.order_id`,
          orderDate: sql`excluded.order_date`,
          transactionType: sql`excluded.transaction_type`,
          restaurant: sql`excluded.restaurant`,
          orderChannel: sql`excluded.order_channel`,
          fulfillmentType: sql`excluded.fulfillment_type`,
          subtotal: sql`excluded.subtotal`,
          saleAmount: sql`excluded.sale_amount`,
          subtotalSalesTax: sql`excluded.subtotal_sales_tax`,
          taxAmount: sql`excluded.tax_amount`,
          commission: sql`excluded.commission`,
          deliveryCharge: sql`excluded.delivery_charge`,
          processingFee: sql`excluded.processing_fee`,
          merchantFundedPromotion: sql`excluded.merchant_funded_promotion`,
          merchantNetTotal: sql`excluded.merchant_net_total`,
          transactionNote: sql`excluded.transaction_note`,
          customerType: sql`excluded.customer_type`,
        }
      });
    console.log(`Upserted ${Math.min(i + chunkSize, grubhubTransactionsToInsert.length)}/${grubhubTransactionsToInsert.length}`);
  }

  console.log("\n✅ Import complete for week 9/29!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
