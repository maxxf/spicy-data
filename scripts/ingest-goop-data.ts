import { parse } from "csv-parse/sync";
import fs from "fs";
import { db } from "../server/db";
import { uberEatsTransactions, doordashTransactions, locations } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import type { InsertUberEatsTransaction, InsertDoordashTransaction } from "../shared/schema";

const GOOP_CLIENT_ID = "b935f09a-1969-412e-ba35-3c7a9d6aa810";
const BATCH_SIZE = 500;

function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s\-\_\|]/g, '').replace(/[()]/g, '');
}

function getColumnValue(row: any, ...possibleNames: string[]): string {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return row[name];
    }
  }
  const normalizedRow: Record<string, any> = {};
  for (const key in row) {
    normalizedRow[normalizeColumnName(key)] = row[key];
  }
  for (const name of possibleNames) {
    const normalized = normalizeColumnName(name);
    if (normalizedRow[normalized] !== undefined && normalizedRow[normalized] !== null) {
      return normalizedRow[normalized];
    }
  }
  return "";
}

function parseCSV(buffer: Buffer, platform?: string): any[] {
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    buffer = buffer.subarray(3);
  }
  
  if (platform === "ubereats") {
    const firstLineParse = parse(buffer, {
      columns: false,
      skip_empty_lines: true,
      to: 3,
      relax_column_count: true,
    });
    
    let headerRowIndex = 0;
    if (firstLineParse.length >= 2) {
      const firstRow = firstLineParse[0];
      const secondRow = firstLineParse[1];
      const firstRowHasLongValues = firstRow.some((v: string) => v && v.length > 50);
      const secondRowLooksLikeHeader = secondRow.some((v: string) => 
        v && (v.includes("Store") || v.includes("Order") || v.includes("Sales"))
      );
      if (firstRowHasLongValues && secondRowLooksLikeHeader) {
        headerRowIndex = 1;
      }
    }
    
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      from_line: headerRowIndex + 1,
      relax_column_count: true,
      skip_records_with_error: true,
    });
  }
  
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    skip_records_with_error: true,
  });
}

async function findOrCreateLocation(clientId: string, locationName: string, platform: string, storeId?: string): Promise<string> {
  const existing = await db.select().from(locations).where(eq(locations.clientId, clientId));
  
  for (const loc of existing) {
    if (platform === "ubereats" && loc.uberEatsStoreLabel === locationName) return loc.id;
    if (platform === "doordash" && loc.doorDashStoreKey === locationName) return loc.id;
    if (loc.name === locationName) return loc.id;
  }
  
  const unmapped = existing.find(l => l.name === "Unmapped Locations");
  if (unmapped) return unmapped.id;
  
  const [newLoc] = await db.insert(locations).values({
    clientId,
    name: locationName,
    canonicalName: locationName,
    uberEatsStoreLabel: platform === "ubereats" ? locationName : null,
    doorDashStoreKey: platform === "doordash" ? locationName : null,
    doorDashStoreId: platform === "doordash" && storeId ? storeId : null,
    locationType: "master",
    isActive: true,
  }).returning();
  
  console.log(`  Created location: "${locationName}"`);
  return newLoc.id;
}

async function ingestUberEats(filePath: string) {
  console.log("\n=== Ingesting Uber Eats data ===");
  console.log(`File: ${filePath}`);
  
  const buffer = fs.readFileSync(filePath);
  console.log(`File size: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
  
  const rows = parseCSV(buffer, "ubereats");
  console.log(`Parsed ${rows.length} rows`);
  
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Set<string>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    if (locationName && locationName.trim() !== "") {
      uniqueLocations.add(locationName);
    }
  }
  
  console.log(`Found ${uniqueLocations.size} unique locations`);
  for (const locationName of uniqueLocations) {
    const locationId = await findOrCreateLocation(GOOP_CLIENT_ID, locationName, "ubereats");
    locationMap.set(locationName, locationId);
  }
  
  const transactions: InsertUberEatsTransaction[] = [];
  let skippedNoWorkflow = 0;
  let skippedNoOrder = 0;
  
  for (const row of rows) {
    const workflowId = getColumnValue(row, "Workflow ID", "Workflow_ID", "workflow_id", "Payout reference ID");
    if (!workflowId || workflowId.trim() === "") {
      skippedNoWorkflow++;
      continue;
    }
    
    const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id");

    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    const locationId = locationMap.get(locationName) || null;
    
    const salesExclTax = parseFloat(getColumnValue(row, "Sales (excl. tax)", "Sales_excl_tax", "sales_excl_tax")) || 0;
    const tax = parseFloat(getColumnValue(row, "Tax on Sales", "Tax", "Tax_on_Sales", "tax_on_sales")) || 0;
    
    transactions.push({
      clientId: GOOP_CLIENT_ID,
      locationId,
      orderId: orderId || null,
      workflowId,
      orderStatus: getColumnValue(row, "Order Status", "Order_Status", "order_status") || null,
      date: getColumnValue(row, "Order Date", "Date", "Order_Date", "order_date"),
      time: getColumnValue(row, "Order Accept Time", "Time", "Order_Accept_Time", "order_accept_time"),
      location: locationName,
      salesExclTax,
      subtotal: salesExclTax + tax,
      tax,
      deliveryFee: parseFloat(getColumnValue(row, "Delivery Fee", "Delivery_Fee", "delivery_fee")) || 0,
      serviceFee: parseFloat(getColumnValue(row, "Service Fee", "Service_Fee", "service_fee")) || 0,
      platformFee: parseFloat(getColumnValue(row, "Marketplace Fee", "Platform_Fee", "Platform Fee", "marketplace_fee")) || 0,
      offersOnItems: parseFloat(getColumnValue(row, "Offers on items (incl. tax)", "Offers_on_items", "offers_on_items")) || 0,
      deliveryOfferRedemptions: parseFloat(getColumnValue(row, "Delivery Offer Redemptions (incl. tax)", "Delivery_Offer_Redemptions", "delivery_offer_redemptions")) || 0,
      offerRedemptionFee: parseFloat(getColumnValue(row, "Offer Redemption Fee", "Offer_Redemption_Fee", "offer_redemption_fee")) || 0,
      marketingPromo: getColumnValue(row, "Marketing Promotion", "Marketing_Promo", "marketing_promotion") || null,
      marketingAmount: parseFloat(getColumnValue(row, "Marketing Adjustment", "Marketing_Amount", "marketing_adjustment")) || 0,
      otherPayments: parseFloat(getColumnValue(row, "Other payments", "Other_payments", "other_payments")) || 0,
      otherPaymentsDescription: getColumnValue(row, "Other payments description", "Other_payments_description", "other_payments_description") || null,
      netPayout: parseFloat(getColumnValue(row, "Total payout ", "Total payout", "Net_Payout", "net_payout")) || 0,
      customerRating: null,
    });
  }
  
  console.log(`Skipped: ${skippedNoWorkflow} no workflowId, ${skippedNoOrder} no orderId`);
  
  const uniqueTransactions = new Map<string, InsertUberEatsTransaction>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.workflowId, txn);
  }
  
  const deduped = Array.from(uniqueTransactions.values());
  console.log(`Deduplicated: ${transactions.length} -> ${deduped.length} unique transactions`);
  
  let inserted = 0;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    await db.insert(uberEatsTransactions)
      .values(batch)
      .onConflictDoNothing()
      .execute();
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === deduped.length) {
      console.log(`  Inserted ${inserted}/${deduped.length}`);
    }
  }
  
  console.log(`UberEats ingestion complete: ${inserted} transactions`);
}

async function ingestDoorDash(filePath: string) {
  console.log("\n=== Ingesting DoorDash data ===");
  console.log(`File: ${filePath}`);
  
  const buffer = fs.readFileSync(filePath);
  console.log(`File size: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
  
  const rows = parseCSV(buffer, "doordash");
  console.log(`Parsed ${rows.length} rows`);
  
  const parseNegativeFloat = (val: any) => {
    if (!val) return 0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };
  
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Map<string, string | undefined>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "Store name", "Store Name", "Store_Name", "store_name");
    const storeId = getColumnValue(row, "Store ID", "Merchant Store ID", "merchant_store_id") || undefined;
    if (locationName && locationName.trim() !== "") {
      uniqueLocations.set(locationName, storeId);
    }
  }
  
  console.log(`Found ${uniqueLocations.size} unique locations`);
  for (const [locationName, storeId] of uniqueLocations) {
    const locationId = await findOrCreateLocation(GOOP_CLIENT_ID, locationName, "doordash", storeId);
    locationMap.set(locationName, locationId);
  }
  
  const transactions: InsertDoordashTransaction[] = [];
  let skippedNoTxnId = 0;
  let skippedNoOrder = 0;
  let skippedStorefront = 0;
  
  for (const row of rows) {
    const transactionId = getColumnValue(row, "DoorDash transaction ID", "Transaction ID", "Transaction_ID", "transaction_id");
    if (!transactionId || transactionId.trim() === "") {
      skippedNoTxnId++;
      continue;
    }
    
    const orderNumber = getColumnValue(row, "DoorDash order ID", "Order Number", "Order_Number", "order_number");
    if (!orderNumber || orderNumber.trim() === "") {
      skippedNoOrder++;
      continue;
    }
    
    const channel = getColumnValue(row, "Channel", "channel");
    if (channel && channel.trim().toLowerCase() === "storefront") {
      skippedStorefront++;
      continue;
    }
    
    const locationName = getColumnValue(row, "Store name", "Store Name", "Store_Name", "store_name");
    const locationId = locationMap.get(locationName) || null;
    
    const subtotal = parseNegativeFloat(getColumnValue(row, "Subtotal", "Order Subtotal", "Order_Subtotal", "order_subtotal"));
    const taxes = parseNegativeFloat(getColumnValue(row, "Tax (subtotal)", "Subtotal tax passed to merchant", "Taxes", "taxes"));
    const commission = parseNegativeFloat(getColumnValue(row, "Commission", "commission"));
    const marketingFees = parseNegativeFloat(getColumnValue(row, "Marketing fees", "Marketing fees | (including any applicable taxes)", "other_payments"));
    const errorCharge = parseNegativeFloat(getColumnValue(row, "Error Charge", "Error charges", "Error Charges", "error_charges"));
    const offersOnItems = parseNegativeFloat(getColumnValue(row, "Customer discounts", "Customer discounts from marketing | (funded by you)", "offers_on_items"));
    const adjustments = parseNegativeFloat(getColumnValue(row, "Adjustments", "adjustments"));
    const deliveryOfferRedemptions = parseNegativeFloat(getColumnValue(row, "Customer discounts from marketing | (funded by DoorDash)", "delivery_offer_redemptions"));
    const marketingCredits = parseNegativeFloat(getColumnValue(row, "DoorDash marketing credit", "DoorDash Marketing Credit", "marketing_credits"));
    const thirdPartyContribution = parseNegativeFloat(getColumnValue(row, "Customer discounts from marketing | (funded by a third-party)", "third_party_contribution"));
    
    const totalMarketingSpend = Math.abs(marketingFees) + Math.abs(offersOnItems) + Math.abs(deliveryOfferRedemptions) + thirdPartyContribution - marketingCredits;
    const netTotal = parseNegativeFloat(getColumnValue(row, "Net total", "Net Total"));
    
    transactions.push({
      clientId: GOOP_CLIENT_ID,
      locationId,
      transactionId,
      orderNumber,
      transactionDate: getColumnValue(row, "Timestamp local time", "Timestamp local date", "Transaction Date", "transaction_date"),
      storeLocation: locationName,
      channel: channel || null,
      orderStatus: getColumnValue(row, "Final order status", "Order Status", "order_status") || null,
      transactionType: getColumnValue(row, "Transaction type", "Transaction Type", "transaction_type")?.trim() || null,
      salesExclTax: parseNegativeFloat(getColumnValue(row, "Subtotal", "Sales (excl. tax)", "sales_excl_tax")),
      orderSubtotal: subtotal,
      taxes,
      deliveryFees: parseNegativeFloat(getColumnValue(row, "Delivery Fees", "delivery_fees")),
      commission: Math.abs(commission),
      errorCharges: errorCharge,
      offersOnItems,
      deliveryOfferRedemptions,
      marketingCredits,
      thirdPartyContribution,
      otherPayments: Math.abs(marketingFees) + Math.abs(adjustments),
      otherPaymentsDescription: marketingFees !== 0 || adjustments !== 0
        ? (getColumnValue(row, "Description", "Other payments description") || "Marketing Fees")
        : null,
      marketingSpend: totalMarketingSpend,
      totalPayout: netTotal,
      netPayment: netTotal,
      orderSource: getColumnValue(row, "Order Source", "order_source") || null,
    });
  }
  
  console.log(`Skipped: ${skippedNoTxnId} no txnId, ${skippedNoOrder} no orderId, ${skippedStorefront} storefront`);
  
  const uniqueTransactions = new Map<string, InsertDoordashTransaction>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.transactionId, txn);
  }
  
  const deduped = Array.from(uniqueTransactions.values());
  console.log(`Deduplicated: ${transactions.length} -> ${deduped.length} unique transactions`);
  
  let inserted = 0;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);
    await db.insert(doordashTransactions)
      .values(batch)
      .onConflictDoNothing()
      .execute();
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === deduped.length) {
      console.log(`  Inserted ${inserted}/${deduped.length}`);
    }
  }
  
  console.log(`DoorDash ingestion complete: ${inserted} transactions`);
}

async function main() {
  console.log("=== Goop Kitchen Data Ingestion ===");
  console.log(`Client ID: ${GOOP_CLIENT_ID}`);
  console.log(`Date range: 12/1/2025 - 2/8/2026`);
  
  await ingestUberEats("attached_assets/f860c6db-76b3-4929-ba92-0a210c3540b1-united_states_1770854702585.csv");
  await ingestDoorDash("attached_assets/FINANCIAL_SIMPLIFIED_TRANSACTIONS_2025-12-01_2026-02-08_k7ZKz__1770854709951.csv");
  
  const ueCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(uberEatsTransactions)
    .where(eq(uberEatsTransactions.clientId, GOOP_CLIENT_ID));
  const ddCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(doordashTransactions)
    .where(eq(doordashTransactions.clientId, GOOP_CLIENT_ID));
  const locCount = await db.select({ count: sql<number>`count(*)::int` })
    .from(locations)
    .where(eq(locations.clientId, GOOP_CLIENT_ID));
  
  console.log("\n=== Final Counts ===");
  console.log(`Uber Eats transactions: ${ueCount[0].count}`);
  console.log(`DoorDash transactions: ${ddCount[0].count}`);
  console.log(`Locations: ${locCount[0].count}`);
  console.log(`Total: ${ueCount[0].count + ddCount[0].count}`);
  
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
