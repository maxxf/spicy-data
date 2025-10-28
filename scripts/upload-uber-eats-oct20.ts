import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { db } from "../server/db";
import { clients, locations, uberEatsTransactions } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";

// Helper function to get column value with multiple possible names
function getColumnValue(row: any, ...possibleNames: string[]): any {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }
  return null;
}

// Helper to extract code from parentheses
function extractCodeFromParentheses(str: string): string | null {
  const match = str.match(/\(([^)]+)\)/);
  return match ? match[1] : null;
}

async function findOrCreateLocation(clientId: string, locationName: string): Promise<string> {
  const allLocations = await db.select().from(locations).where(eq(locations.clientId, clientId));
  
  // Extract code from Store Name (e.g., "Capriotti's (IA069)" → "IA069")
  const extractedCode = extractCodeFromParentheses(locationName);
  const normalizedCsvCode = (extractedCode || locationName).trim().toUpperCase();
  
  // Match by comparing codes
  const locationByCode = allLocations.find(l => {
    if (!l.uberEatsStoreLabel) return false;
    const dbCode = extractCodeFromParentheses(l.uberEatsStoreLabel) || l.uberEatsStoreLabel;
    const normalizedDbCode = dbCode.trim().toUpperCase();
    return normalizedDbCode === normalizedCsvCode;
  });
  
  if (locationByCode) {
    // Update Uber Eats display name if not set
    if (!locationByCode.uberEatsName) {
      await db.update(locations)
        .set({ uberEatsName: locationName })
        .where(eq(locations.id, locationByCode.id));
    }
    return locationByCode.id;
  }
  
  // No match - return unmapped bucket
  const unmappedBucket = allLocations.find(l => 
    l.canonicalName === "Unmapped Locations" && l.locationTag === "unmapped_bucket"
  );
  
  if (unmappedBucket) {
    return unmappedBucket.id;
  }
  
  throw new Error("Unmapped bucket not found");
}

async function main() {
  console.log("🚀 Starting Uber Eats upload for week Oct 20-26...\n");
  
  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    throw new Error("Capriotti's client not found");
  }
  
  // Read and parse CSV (skip first description row, use second row as headers)
  const csvContent = readFileSync("attached_assets/Uber Eats - 20 - 26th_1761668767312.csv", "utf-8");
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    from_line: 2, // Skip first row (descriptions), use second row as headers
  });
  
  console.log(`📄 Parsed ${rows.length} rows from CSV\n`);
  
  // Step 1: Collect unique locations
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Set<string>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    if (locationName && locationName.trim() !== "") {
      uniqueLocations.add(locationName);
    }
  }
  
  console.log(`📍 Found ${uniqueLocations.size} unique locations\n`);
  
  // Step 2: Map locations
  for (const locationName of uniqueLocations) {
    const locationId = await findOrCreateLocation(client.id, locationName);
    locationMap.set(locationName, locationId);
  }
  
  // Step 3: Build transactions array
  const transactions: any[] = [];
  
  for (const row of rows) {
    // Skip rows without workflow ID
    const workflowId = getColumnValue(row, "Workflow ID", "Workflow_ID", "workflow_id");
    if (!workflowId || workflowId.trim() === "") {
      continue;
    }
    
    // Skip rows without order ID
    const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id");
    if (!orderId || orderId.trim() === "") {
      continue;
    }
    
    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    const locationId = locationMap.get(locationName) || null;
    
    // Parse date safely
    const rawDate = getColumnValue(row, "Order Date", "Date", "date", "order_date");
    let parsedDate = rawDate;
    
    if (rawDate && rawDate.includes("/")) {
      const [month, day, year] = rawDate.split("/");
      const fullYear = year.length === 2 ? `20${year}` : year;
      parsedDate = `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    
    const subtotal = parseFloat(getColumnValue(row, "Sales (incl. tax)", "Subtotal", "subtotal") || "0");
    const salesExclTax = parseFloat(getColumnValue(row, "Sales (excl. tax)", "Sales_excl_tax", "sales_excl_tax") || "0");
    const tax = parseFloat(getColumnValue(row, "Tax on Sales", "Tax", "tax") || "0");
    
    transactions.push({
      clientId: client.id,
      locationId,
      orderId,
      workflowId,
      orderStatus: getColumnValue(row, "Order Status", "Status", "order_status") || null,
      date: parsedDate,
      time: getColumnValue(row, "Order Accept Time", "Time", "time") || "",
      location: locationName,
      salesExclTax: salesExclTax || 0,
      subtotal: subtotal || 0,
      tax: tax || 0,
      deliveryFee: parseFloat(getColumnValue(row, "Delivery Fee", "delivery_fee") || "0"),
      serviceFee: parseFloat(getColumnValue(row, "Service Fee", "service_fee") || "0"),
      platformFee: parseFloat(getColumnValue(row, "Commission", "Platform Fee", "platform_fee") || "0"),
      offersOnItems: parseFloat(getColumnValue(row, "Offers on items (incl. tax)", "offers_on_items") || "0"),
      deliveryOfferRedemptions: parseFloat(getColumnValue(row, "Delivery Offer Redemptions (incl. tax)", "delivery_offer_redemptions") || "0"),
      offerRedemptionFee: parseFloat(getColumnValue(row, "Offer Redemption Fee", "offer_redemption_fee") || "0"),
      marketingPromo: getColumnValue(row, "Marketing Promo", "marketing_promo") || null,
      marketingAmount: parseFloat(getColumnValue(row, "Marketing Amount", "marketing_amount") || "0"),
      otherPayments: parseFloat(getColumnValue(row, "Other payments", "other_payments") || "0"),
      otherPaymentsDescription: getColumnValue(row, "Other payments description", "other_payments_description") || null,
      netPayout: parseFloat(getColumnValue(row, "Net payout", "net_payout") || "0"),
      customerRating: parseInt(getColumnValue(row, "Customer Rating", "customer_rating") || "0") || null,
    });
  }
  
  // Deduplicate by workflow ID
  const uniqueTransactions = new Map<string, any>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.workflowId, txn);
  }
  
  const deduplicatedTransactions = Array.from(uniqueTransactions.values());
  
  console.log(`💾 Inserting ${deduplicatedTransactions.length} transactions...\n`);
  
  // Insert in batches
  const batchSize = 500;
  for (let i = 0; i < deduplicatedTransactions.length; i += batchSize) {
    const batch = deduplicatedTransactions.slice(i, i + batchSize);
    await db.insert(uberEatsTransactions).values(batch).onConflictDoNothing();
    console.log(`  ✓ Inserted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(deduplicatedTransactions.length / batchSize)}`);
  }
  
  console.log(`\n✅ Successfully uploaded ${deduplicatedTransactions.length} Uber Eats transactions!\n`);
  
  // Verify upload
  const verifyResult = await db.execute(sql`
    SELECT 
      COUNT(*) as count,
      COUNT(DISTINCT location_id) as locations,
      ROUND(SUM(COALESCE(sales_excl_tax, subtotal - tax, 0))::numeric, 2) as total_sales
    FROM uber_eats_transactions
    WHERE date >= '2025-10-20' AND date <= '2025-10-26'
  `);
  
  console.log("📊 Verification for week Oct 20-26:");
  console.log(`  Transactions: ${verifyResult.rows[0].count}`);
  console.log(`  Locations: ${verifyResult.rows[0].locations}`);
  console.log(`  Total Sales: $${verifyResult.rows[0].total_sales}`);
}

main()
  .then(() => {
    console.log("\n🎉 Upload complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Upload failed:", error);
    process.exit(1);
  });
