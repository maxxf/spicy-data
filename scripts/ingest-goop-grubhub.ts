import { parse } from "csv-parse/sync";
import fs from "fs";
import { db } from "../server/db";
import { grubhubTransactions, locations } from "../shared/schema";
import { eq, sql } from "drizzle-orm";
import type { InsertGrubhubTransaction } from "../shared/schema";

const GOOP_CLIENT_ID = "b935f09a-1969-412e-ba35-3c7a9d6aa810";
const BATCH_SIZE = 500;

function getColumnValue(row: any, ...possibleNames: string[]): string {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  const normalizedRow: Record<string, any> = {};
  for (const key in row) {
    normalizedRow[key.toLowerCase().replace(/[\s\-\_\|]/g, '').replace(/[()]/g, '')] = row[key];
  }
  for (const name of possibleNames) {
    const normalized = name.toLowerCase().replace(/[\s\-\_\|]/g, '').replace(/[()]/g, '');
    if (normalizedRow[normalized] !== undefined && normalizedRow[normalized] !== null) return normalizedRow[normalized];
  }
  return "";
}

function normalizeAddress(address: string): string {
  return address.toLowerCase().trim().replace(/\s+/g, ' ')
    .replace(/\s+(suite|ste|unit|apt|apartment|#)\s*[a-z0-9\-]+.*$/i, '')
    .replace(/\s+#\s*[a-z0-9\-]+.*$/i, '')
    .replace(/\bst\b\.?/g, 'street').replace(/\bave\b\.?/g, 'avenue')
    .replace(/\bblvd\b\.?/g, 'boulevard').replace(/\bdr\b\.?/g, 'drive')
    .replace(/\brd\b\.?/g, 'road').replace(/\bln\b\.?/g, 'lane')
    .replace(/\bct\b\.?/g, 'court').replace(/\bpl\b\.?/g, 'place')
    .replace(/\bpkwy\b\.?/g, 'parkway').replace(/\bhwy\b\.?/g, 'highway')
    .replace(/[.,]/g, '').trim();
}

async function findOrCreateLocation(clientId: string, locationName: string, address?: string, storeNumber?: string): Promise<string> {
  const existing = await db.select().from(locations).where(eq(locations.clientId, clientId));

  if (address) {
    const normalizedInput = normalizeAddress(address);
    const match = existing.find(l => l.address && normalizeAddress(l.address) === normalizedInput);
    if (match) return match.id;
  }

  if (storeNumber) {
    const clean = storeNumber.replace(/['"]/g, '').trim();
    const match = existing.find(l => l.storeId === clean || l.grubhubStoreCode === clean);
    if (match) return match.id;
  }

  const nameMatch = existing.find(l => l.name === locationName || l.grubhubName === locationName);
  if (nameMatch) return nameMatch.id;

  const unmapped = existing.find(l => l.name === "Unmapped Locations");
  if (unmapped) return unmapped.id;

  const displayName = storeNumber ? `${locationName} (${storeNumber})` : locationName;
  const [newLoc] = await db.insert(locations).values({
    clientId,
    name: displayName,
    canonicalName: displayName,
    grubhubName: locationName,
    grubhubStoreCode: storeNumber || null,
    address: address || null,
    locationType: "master",
    isActive: true,
  }).returning();

  console.log(`  Created location: "${displayName}" (address: ${address || 'N/A'})`);
  return newLoc.id;
}

async function main() {
  console.log("=== Ingesting Grubhub data for Goop Kitchen ===");
  const filePath = "attached_assets/orders_-_l3_1770855620670.csv";

  const buffer = fs.readFileSync(filePath);
  console.log(`File size: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    skip_records_with_error: true,
  });
  console.log(`Parsed ${rows.length} rows`);

  const locationMap = new Map<string, string>();
  const uniqueLocations = new Map<string, { locationName: string; address?: string; storeNumber?: string }>();

  for (const row of rows) {
    const locationName = getColumnValue(row, "store_name", "Restaurant", "Store_Name");
    const address = getColumnValue(row, "street_address", "store_address", "Address") || undefined;
    const storeNumber = getColumnValue(row, "store_number", "Store_Number") || undefined;
    const grubhubStoreId = getColumnValue(row, "grubhub_store_id", "Grubhub_Store_ID") || undefined;

    const cleanStoreNumber = storeNumber?.replace(/['"]/g, '').trim() || '';
    const cleanGrubhubId = grubhubStoreId?.replace(/['"]/g, '').trim() || '';

    const addressKey = address
      ? normalizeAddress(address)
      : cleanStoreNumber
      ? `store:${cleanStoreNumber}`
      : cleanGrubhubId
      ? `store:${cleanGrubhubId}`
      : null;

    if (locationName && locationName.trim() !== "" && addressKey) {
      if (!uniqueLocations.has(addressKey)) {
        uniqueLocations.set(addressKey, { locationName, address, storeNumber });
      }
    }
  }

  console.log(`Found ${uniqueLocations.size} unique locations`);
  for (const [addressKey, { locationName, address, storeNumber }] of uniqueLocations) {
    const locationId = await findOrCreateLocation(GOOP_CLIENT_ID, locationName, address, storeNumber);
    locationMap.set(addressKey, locationId);
  }

  const transactions: InsertGrubhubTransaction[] = [];
  let skipped = 0;

  for (const row of rows) {
    const locationName = getColumnValue(row, "store_name", "Restaurant", "Store_Name");
    const orderNumber = getColumnValue(row, "order_number", "Order_Id", "order_id");
    const transactionId = getColumnValue(row, "transaction_id", "Transaction_Id");
    if (!transactionId || transactionId.trim() === "") {
      skipped++;
      continue;
    }
    const effectiveOrderNumber = orderNumber && orderNumber.trim() !== "" ? orderNumber : transactionId;

    const address = getColumnValue(row, "street_address", "store_address", "Address") || undefined;
    const storeNumber = getColumnValue(row, "store_number", "Store_Number") || undefined;
    const cleanStoreNumber = storeNumber?.replace(/['"]/g, '').trim() || '';

    const addressKey = address
      ? normalizeAddress(address)
      : cleanStoreNumber
      ? `store:${cleanStoreNumber}`
      : null;

    const locationId = addressKey ? (locationMap.get(addressKey) || null) : null;

    const subtotal = parseFloat(getColumnValue(row, "subtotal", "Subtotal")) || 0;
    const subtotalSalesTax = parseFloat(getColumnValue(row, "subtotal_sales_tax", "Subtotal_Sales_Tax")) || 0;
    const saleAmount = subtotal + subtotalSalesTax;

    transactions.push({
      clientId: GOOP_CLIENT_ID,
      locationId,
      orderId: effectiveOrderNumber,
      orderDate: getColumnValue(row, "transaction_date", "Order_Date", "order_date"),
      transactionType: getColumnValue(row, "transaction_type", "Transaction_Type"),
      transactionId,
      restaurant: locationName,
      orderChannel: getColumnValue(row, "order_channel", "Order_Channel") || null,
      fulfillmentType: getColumnValue(row, "fulfillment_type", "Fulfillment_Type") || null,
      subtotal,
      subtotalSalesTax,
      saleAmount,
      commission: parseFloat(getColumnValue(row, "commission", "Commission")) || 0,
      deliveryCommission: parseFloat(getColumnValue(row, "delivery_commission", "Delivery_Commission")) || 0,
      processingFee: parseFloat(getColumnValue(row, "processing_fee", "merchant_service_fee", "Processing_Fee")) || 0,
      merchantFundedPromotion: parseFloat(getColumnValue(row, "merchant_funded_promotion", "Merchant_Funded_Promotion")) || 0,
      merchantNetTotal: parseFloat(getColumnValue(row, "merchant_net_total", "Merchant_Net_Total")) || 0,
      transactionNote: getColumnValue(row, "transaction_note", "Transaction_Note") || null,
      customerType: getColumnValue(row, "gh_plus_customer", "Customer_Type") || "Unknown",
    });
  }

  console.log(`Skipped: ${skipped} rows (no transactionId)`);
  console.log(`Total transactions to insert: ${transactions.length}`);

  let inserted = 0;
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    await db.insert(grubhubTransactions)
      .values(batch)
      .onConflictDoNothing()
      .execute();
    inserted += batch.length;
    if (inserted % 2000 === 0 || inserted === transactions.length) {
      console.log(`  Inserted ${inserted}/${transactions.length}`);
    }
  }

  console.log(`\nGrubhub ingestion complete: ${inserted} transactions`);

  const ghCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(grubhubTransactions)
    .where(eq(grubhubTransactions.clientId, GOOP_CLIENT_ID));
  console.log(`Total Grubhub transactions in DB: ${ghCount[0].count}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
