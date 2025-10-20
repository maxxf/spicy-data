import { db } from "../server/db";
import { clients, locations, doordashTransactions, grubhubTransactions } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

async function completeWeek9_22Import() {
  console.log("Completing import for week 9/22 (DoorDash + Grubhub)...\n");

  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) throw new Error("Client not found");

  const allLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));
  const unmappedLocation = allLocations.find(l => l.canonicalName === "Unmapped Locations");
  
  const locationCache = new Map<string, string>();

  function findLocation(storeName: string, platform: "doordash" | "grubhub") {
    const cacheKey = `${platform}:${storeName}`;
    if (locationCache.has(cacheKey)) return locationCache.get(cacheKey)!;

    const platformField = platform === "doordash" ? "doordashName" : "grubhubName";
    const location = allLocations.find(
      l => l[platformField] === storeName || l.canonicalName.toLowerCase() === storeName.toLowerCase()
    );

    const result = location?.id || unmappedLocation!.id;
    locationCache.set(cacheKey, result);
    return result;
  }

  // Import DoorDash
  console.log("\nImporting DoorDash...");
  const doordashCsv = readFileSync(
    "attached_assets/financials_detailed_transactions_summarized_us_2025-09-22_2025-09-28_W0rt2_2025-10-20T05-27-06Z_1760994428326.csv",
    "utf-8"
  );
  const doordashRows = parse(doordashCsv, { columns: true, skip_empty_lines: true, trim: true });
  
  console.log(`Parsed ${doordashRows.length} DoorDash rows, inserting in batches...`);
  
  const batchSize = 100;
  for (let i = 0; i < doordashRows.length; i += batchSize) {
    const batch = doordashRows.slice(i, i + batchSize);
    const records = batch.map((row: any) => {
      const storeId = row["Merchant Store ID"] || "";
      const storeName = row["Store Name"] || "";
      const startDate = row["Transactions Start Local Date"] || "";
      const endDate = row["Transactions End Local Date"] || "";
      
      // For summarized reports, create synthetic transaction ID
      const transactionId = `${storeId}-${startDate}-${endDate}`;
      const orderNumber = `WEEKLY-${storeId}-${startDate}`;
      
      return {
        clientId: client.id,
        locationId: findLocation(storeName, "doordash"),
        transactionId: transactionId,
        orderNumber: orderNumber,
        transactionDate: startDate,
        storeLocation: storeName,
        channel: "Marketplace",
        orderStatus: "Delivered",
        salesExclTax: parseFloat(row["Subtotal"] || "0") || 0,
        orderSubtotal: parseFloat(row["Subtotal"] || "0") || 0,
        taxes: parseFloat(row["Subtotal Tax Passed by DoorDash to Merchant"] || "0") || 0,
        deliveryFees: 0,
        commission: parseFloat(row["Commission"] || "0") || 0,
        errorCharges: 0,
        offersOnItems: Math.abs(parseFloat(row["Customer-Facing Discounts (Merchant-Funded)"] || "0") || 0),
        deliveryOfferRedemptions: Math.abs(parseFloat(row["Customer-Facing Discounts (DoorDash-Funded)"] || "0") || 0),
        marketingCredits: 0,
        thirdPartyContribution: Math.abs(parseFloat(row["Customer-Facing Discounts (Third-Party-Funded)"] || "0") || 0),
        tips: parseFloat(row["Total Tips"] || "0") || 0,
        marketingSpend: parseFloat(row["Marketing Fees (for historical reference only) | (All discounts and fees)"] || "0") || 0,
        otherPaymentsDescription: row["Other Payments Description"] || "",
        otherPayments: (row["Other Payments Description"] || "") ? Math.abs(parseFloat(row["Other Payments"] || "0") || 0) : 0,
        totalPayout: parseFloat(row["Net Payout"] || "0") || 0,
        netPayment: parseFloat(row["Net Payout"] || "0") || 0,
      };
    });
    
    await db.insert(doordashTransactions).values(records).onConflictDoNothing();
    console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(doordashRows.length / batchSize)}`);
  }

  // Import Grubhub
  console.log("\nImporting Grubhub...");
  const grubhubCsv = readFileSync("attached_assets/caps_-_9_22_1760994428325.csv", "utf-8");
  const grubhubRows = parse(grubhubCsv, { columns: true, skip_empty_lines: true, trim: true });
  
  console.log(`Parsed ${grubhubRows.length} Grubhub rows, inserting in batches...`);
  
  for (let i = 0; i < grubhubRows.length; i += batchSize) {
    const batch = grubhubRows.slice(i, i + batchSize);
    const records = batch.map((row: any) => ({
      clientId: client.id,
      locationId: findLocation(row["store_name"] || "", "grubhub"),
      orderId: row["order_number"] || "",
      orderDate: row["transaction_date"] || "",
      transactionType: row["transaction_type"] || "",
      transactionId: row["transaction_id"] || "",
      restaurant: row["store_name"] || "",
      orderChannel: row["order_channel"] || "",
      fulfillmentType: row["fulfillment_type"] || "",
      subtotal: parseFloat(row["subtotal"] || "0") || 0,
      subtotalSalesTax: parseFloat(row["subtotal_sales_tax"] || "0") || 0,
      saleAmount: parseFloat(row["subtotal"] || "0") || 0 + parseFloat(row["subtotal_sales_tax"] || "0") || 0,
      commission: parseFloat(row["commission"] || "0") || 0,
      deliveryCommission: parseFloat(row["delivery_commission"] || "0") || 0,
      processingFee: parseFloat(row["processing_fee"] || "0") || 0,
      merchantFundedPromotion: parseFloat(row["merchant_funded_promotion"] || "0") || 0,
      merchantNetTotal: parseFloat(row["merchant_net_total"] || "0") || 0,
      transactionNote: row["transaction_note"] || null,
      customerType: row["gh_plus_customer"] || "non GH+",
    }));
    
    await db.insert(grubhubTransactions).values(records).onConflictDoNothing();
    console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(grubhubRows.length / batchSize)}`);
  }

  console.log("\n✅ Week 9/22 import complete!");
  process.exit(0);
}

completeWeek9_22Import().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
