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
import { eq, and, sql } from "drizzle-orm";

async function main() {
  console.log("Starting import for week 9/15-9/21/2025...");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }
  console.log(`Found client: ${client.name} (${client.id})`);

  // Clear transactions for week of 9/15 only
  console.log("Clearing transactions for week 9/15-9/21...");
  
  // Uber Eats uses M/D/YY format
  await db.delete(uberEatsTransactions).where(
    and(
      eq(uberEatsTransactions.clientId, client.id),
      sql`date >= '9/15/25'`,
      sql`date <= '9/21/25'`
    )
  );
  
  // DoorDash uses YYYY-MM-DD format
  await db.delete(doordashTransactions).where(
    and(
      eq(doordashTransactions.clientId, client.id),
      sql`transaction_date >= '2025-09-15'`,
      sql`transaction_date <= '2025-09-21'`
    )
  );
  
  // Grubhub uses YYYY-MM-DD format
  await db.delete(grubhubTransactions).where(
    and(
      eq(grubhubTransactions.clientId, client.id),
      sql`order_date >= '2025-09-15'`,
      sql`order_date <= '2025-09-21'`
    )
  );
  
  console.log("Old transactions cleared.");

  // Get all locations for matching
  const allLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));
  console.log(`Found ${allLocations.length} locations for matching`);

  // Cache for location lookups
  const locationCache = new Map<string, string>();

  // Helper: Extract code from parentheses (e.g., "Capriotti's (IA069)" → "IA069")
  function extractCodeFromParentheses(text: string): string | null {
    const match = text.match(/\(([A-Za-z0-9|-]+)\)/);
    return match ? match[1].trim() : null;
  }

  // Helper: Find location (no auto-create)
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
      return null;
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

    return null;
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
    "attached_assets/de1f7aa7-43c3-406d-a907-6e3628a23684-united_states_1760939066315.csv",
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

  const ubereatsTransactionsToInsert = [];
  let matchedCount = 0;
  let skippedNoMatch = 0;
  
  for (const row of ubereatsRows) {
    // Try to get store name with or without BOM
    const storeName = row["Store Name"] || row["\ufeffStore Name"] || "";
    if (!storeName || storeName.trim() === "") {
      continue;
    }

    const locationId = await findLocation(storeName, "ubereats");
    if (!locationId) {
      skippedNoMatch++;
      continue;
    }
    matchedCount++;

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

  console.log(`Matched: ${matchedCount}, Skipped (no match): ${skippedNoMatch}`);
  
  // Deduplicate transactions by (clientId, orderId, date)
  const transactionMap = new Map<string, typeof ubereatsTransactionsToInsert[0]>();
  for (const transaction of ubereatsTransactionsToInsert) {
    const key = `${transaction.clientId}|${transaction.orderId}|${transaction.date}`;
    transactionMap.set(key, transaction);
  }
  const uniqueTransactions = Array.from(transactionMap.values());
  
  console.log(`After deduplication: ${uniqueTransactions.length} unique UberEats transactions`);
  console.log(`Upserting ${uniqueTransactions.length} UberEats transactions in batches...`);
  const chunkSize = 100;
  for (let i = 0; i < uniqueTransactions.length; i += chunkSize) {
    const chunk = uniqueTransactions.slice(i, i + chunkSize);
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
    "attached_assets/financials_detailed_transactions_summarized_us_2025-09-15_2025-09-21_1ZdEK_2025-10-20T05-42-41Z_1760939066315.csv",
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
    const storeName = row["Store Name"] || "";
    if (!storeName) continue;

    const locationId = await findLocation(storeName, "doordash");
    if (!locationId) continue;

    const parseFloat = (val: any) => {
      if (!val || val === "") return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    // This is a summary file, so we need to generate transaction records
    // We'll create one summary transaction per store per week
    const merchantFundedDiscount = Math.abs(parseFloat(row["Merchant Funded Discounts"]));
    const thirdPartyFundedDiscount = Math.abs(parseFloat(row["Third-party Funded Discounts"]));
    const marketingFees = Math.abs(parseFloat(row["Marketing Fees (for historical reference only) | (All discounts and fees)"]));
    const marketingCredit = Math.abs(parseFloat(row["DoorDash Marketing Credit"]));
    const thirdPartyContrib = Math.abs(parseFloat(row["Third-party Contribution"]));
    
    doordashTransactionsToInsert.push({
      clientId: client.id,
      locationId,
      transactionId: `SUMMARY_${row["Merchant Store ID"]}_9_15_21`,
      orderNumber: `SUMMARY_${row["Merchant Store ID"]}_9_15_21`,
      transactionDate: "2025-09-18", // Mid-point of the week
      storeLocation: storeName,
      channel: "Marketplace",
      orderStatus: "Completed",
      salesExclTax: parseFloat(row["Subtotal"]),
      orderSubtotal: parseFloat(row["Subtotal"]),
      taxes: parseFloat(row["Subtotal Tax Passed by DoorDash to Merchant"]),
      deliveryFees: 0,
      commission: parseFloat(row["Commission"]),
      errorCharges: parseFloat(row["Error Charges"]) || 0,
      offersOnItems: merchantFundedDiscount,
      deliveryOfferRedemptions: parseFloat(row["Discounts"]) - merchantFundedDiscount,
      marketingCredits: marketingCredit,
      thirdPartyContribution: thirdPartyFundedDiscount + thirdPartyContrib,
      otherPayments: marketingFees,
      otherPaymentsDescription: marketingFees !== 0 ? "Marketing fees" : null,
      marketingSpend: marketingFees,
      totalPayout: parseFloat(row["Net Total"]),
      netPayment: parseFloat(row["Net Total"]),
      orderSource: "Marketplace",
    });
  }

  console.log(`Inserting ${doordashTransactionsToInsert.length} DoorDash transactions...`);
  for (let i = 0; i < doordashTransactionsToInsert.length; i += chunkSize) {
    const chunk = doordashTransactionsToInsert.slice(i, i + chunkSize);
    await db.insert(doordashTransactions).values(chunk);
    console.log(`Inserted ${Math.min(i + chunkSize, doordashTransactionsToInsert.length)}/${doordashTransactionsToInsert.length}`);
  }

  // Import Grubhub data
  console.log("\nImporting Grubhub transactions...");
  const grubhubCsv = readFileSync(
    "attached_assets/caps_-_9_15_1760939066315.csv",
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
      transactionId: row.transaction_id || "",
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

  console.log(`Inserting ${grubhubTransactionsToInsert.length} Grubhub transactions in batches...`);
  for (let i = 0; i < grubhubTransactionsToInsert.length; i += chunkSize) {
    const chunk = grubhubTransactionsToInsert.slice(i, i + chunkSize);
    await db.insert(grubhubTransactions).values(chunk);
    console.log(`Inserted ${Math.min(i + chunkSize, grubhubTransactionsToInsert.length)}/${grubhubTransactionsToInsert.length}`);
  }

  console.log("\n✅ Import complete for week 9/15!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
