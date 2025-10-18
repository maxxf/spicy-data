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
import { eq } from "drizzle-orm";

async function main() {
  console.log("Starting import for week 10/6-10/12/2025...");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }
  console.log(`Found client: ${client.name} (${client.id})`);

  // Clear existing transactions
  console.log("Clearing old transactions...");
  await db.delete(doordashTransactions).where(eq(doordashTransactions.clientId, client.id));
  await db.delete(grubhubTransactions).where(eq(grubhubTransactions.clientId, client.id));
  console.log("Old transactions cleared.");

  // Get all locations for fuzzy matching
  const allLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));
  console.log(`Found ${allLocations.length} locations for matching`);

  // Helper: Find or create location
  async function findOrCreateLocation(storeName: string, platform: "doordash" | "grubhub") {
    // First try exact match on platform-specific name
    const platformField = platform === "doordash" ? "doordashName" : "grubhubName";
    let location = allLocations.find(
      (l) =>
        l[platformField] === storeName ||
        l.canonicalName.toLowerCase() === storeName.toLowerCase()
    );

    if (location) {
      return location.id;
    }

    // Fuzzy match based on similarity
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
      // Update location with platform name
      const updates: any = {};
      if (platform === "doordash") updates.doordashName = storeName;
      if (platform === "grubhub") updates.grubhubName = storeName;

      await db.update(locations).set(updates).where(eq(locations.id, bestMatch.location.id));
      console.log(`Matched "${storeName}" to "${bestMatch.location.canonicalName}" (score: ${bestMatch.score.toFixed(2)})`);
      return bestMatch.location.id;
    }

    // Create new location
    const [newLocation] = await db
      .insert(locations)
      .values({
        clientId: client.id,
        canonicalName: storeName,
        doordashName: platform === "doordash" ? storeName : null,
        grubhubName: platform === "grubhub" ? storeName : null,
        isVerified: false,
      })
      .returning();

    allLocations.push(newLocation);
    console.log(`Created new location: "${storeName}"`);
    return newLocation.id;
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

  // Import DoorDash data
  console.log("\nImporting DoorDash transactions...");
  const doordashCsv = readFileSync(
    "attached_assets/FINANCIAL_DETAILED_TRANSACTIONS_2025-10-06_2025-10-12_fMQyL_2025-10-13T17-38-47Z 2_1760813092152.csv",
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
    const storeName = row["Store name"] || row.store_name || "";
    if (!storeName) continue;

    const locationId = await findOrCreateLocation(storeName, "doordash");

    const parseFloat = (val: any) => {
      if (!val || val === "") return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    doordashTransactionsToInsert.push({
      clientId: client.id,
      locationId,
      orderNumber: row["DoorDash order ID"] || row.doordash_order_id || "",
      transactionDate: row["Timestamp UTC date"] || row.timestamp_utc_date || "",
      storeLocation: storeName,
      channel: row.Channel || row.channel || null,
      orderStatus: row["Final order status"] || row.final_order_status || null,
      salesExclTax: parseFloat(row.Subtotal || row.subtotal),
      orderSubtotal: parseFloat(row.Subtotal || row.subtotal),
      taxes: parseFloat(row["Subtotal tax passed to merchant"] || row.subtotal_tax_passed_to_merchant),
      deliveryFees: 0,
      commission: parseFloat(row.Commission || row.commission),
      errorCharges: 0,
      offersOnItems: parseFloat(row.Discount || row.discount) * -1, // Make negative
      deliveryOfferRedemptions: 0,
      marketingCredits: 0,
      thirdPartyContribution: 0,
      otherPayments: Math.abs(parseFloat(row["Payment processing fee"] || row.payment_processing_fee)),
      otherPaymentsDescription: row.Description || row.description || null,
      marketingSpend: 0,
      totalPayout: parseFloat(row["Total payout"] || row.total_payout),
      netPayment: parseFloat(row["Total payout"] || row.total_payout),
      orderSource: row.Channel || row.channel || null,
    });
  }

  console.log(`Inserting ${doordashTransactionsToInsert.length} DoorDash transactions in batches...`);
  const chunkSize = 500;
  for (let i = 0; i < doordashTransactionsToInsert.length; i += chunkSize) {
    const chunk = doordashTransactionsToInsert.slice(i, i + chunkSize);
    await db.insert(doordashTransactions).values(chunk);
    console.log(`Inserted ${Math.min(i + chunkSize, doordashTransactionsToInsert.length)}/${doordashTransactionsToInsert.length}`);
  }

  // Import Grubhub data
  console.log("\nImporting Grubhub transactions...");
  const grubhubCsv = readFileSync(
    "attached_assets/Grubhub_Payments_-_Last_week__1760813092154.csv",
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

    const locationId = await findOrCreateLocation(storeName, "grubhub");

    const parseFloat = (val: any) => {
      if (!val || val === "") return 0;
      const num = Number(val);
      return isNaN(num) ? 0 : num;
    };

    grubhubTransactionsToInsert.push({
      clientId: client.id,
      locationId,
      orderId: row.order_number || "",
      orderDate: row.transaction_date || "",
      restaurant: storeName,
      saleAmount: parseFloat(row.subtotal),
      taxAmount: parseFloat(row.subtotal_sales_tax),
      deliveryCharge: parseFloat(row.self_delivery_charge),
      processingFee: parseFloat(row.merchant_service_fee),
      promotionCost: Math.abs(parseFloat(row.merchant_promotion_subsidy || row.grubhub_promotion_subsidy)),
      netSales: parseFloat(row.total_payout),
      customerType: row.gh_plus_customer || "non GH+",
    });
  }

  console.log(`Inserting ${grubhubTransactionsToInsert.length} Grubhub transactions in batches...`);
  for (let i = 0; i < grubhubTransactionsToInsert.length; i += chunkSize) {
    const chunk = grubhubTransactionsToInsert.slice(i, i + chunkSize);
    await db.insert(grubhubTransactions).values(chunk);
    console.log(`Inserted ${Math.min(i + chunkSize, grubhubTransactionsToInsert.length)}/${grubhubTransactionsToInsert.length}`);
  }

  console.log("\n✅ Import complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
