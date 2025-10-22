import { db } from "./db";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { DbStorage } from "./db-storage";
import type { InsertUberEatsTransaction, InsertGrubhubTransaction } from "../shared/schema";

const storage = new DbStorage();

// Helper to get column value from various possible names
function getColumnValue(row: any, ...possibleNames: string[]): string | null {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== "") {
      return row[name];
    }
  }
  return null;
}

// Helper to extract code from parentheses (e.g., "Capriotti's (IA069)" → "IA069")
function extractCodeFromParentheses(str: string): string | null {
  if (!str) return null;
  const match = str.match(/\(([A-Z]{2}\d+)\)/);
  return match ? match[1] : null;
}

// Helper to find or create location for Uber Eats by matching Store Name to uberEatsStoreLabel
async function findOrCreateUberEatsLocation(clientId: string, storeName: string): Promise<string | null> {
  const extractedCode = extractCodeFromParentheses(storeName);
  
  if (!extractedCode) {
    return null; // Will map to unmapped bucket
  }
  
  const allLocations = await storage.getLocationsByClient(clientId);
  const location = allLocations.find(l => 
    l.uberEatsStoreLabel === extractedCode || 
    l.storeId === extractedCode
  );
  
  return location ? location.id : null;
}

// Helper to find location for Grubhub by store_number
async function findGrubhubLocation(clientId: string, storeNumber: string): Promise<string | null> {
  if (!storeNumber) {
    return null;
  }
  
  const allLocations = await storage.getLocationsByClient(clientId);
  
  // Try matching by store ID first
  let location = allLocations.find(l => l.storeId === storeNumber);
  
  // If not found, also try grubhubStoreNumber if it exists
  if (!location) {
    location = allLocations.find((l: any) => l.grubhubStoreNumber === storeNumber);
  }
  
  return location ? location.id : null;
}

async function processGrubhubFile() {
  console.log("\n📦 Processing Grubhub file...");
  
  const csvContent = readFileSync("/tmp/grubhub_upload.csv", "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`   Found ${records.length} rows`);
  
  const clientId = "83506705-b408-4f0a-a9b0-e5b585db3b7d";
  
  // Step 1: Pre-fetch all locations and build a lookup map
  console.log(`   Pre-fetching locations for mapping...`);
  const allLocations = await storage.getLocationsByClient(clientId);
  const locationLookup = new Map<string, string>(); // storeNumber -> locationId
  
  for (const loc of allLocations) {
    if (loc.storeId) {
      locationLookup.set(loc.storeId, loc.id);
    }
  }
  
  console.log(`   Cached ${locationLookup.size} location mappings`);
  
  // Step 2: Build transactions array using cached location IDs
  const transactions: InsertGrubhubTransaction[] = [];
  
  for (const row of records) {
    const orderNumber = getColumnValue(row, "order_number", "Order_Id", "order number", "order_id");
    const transactionId = getColumnValue(row, "transaction_id", "Transaction_Id", "transaction id");
    
    // Skip rows without required IDs
    if (!orderNumber || orderNumber.trim() === "" || !transactionId || transactionId.trim() === "") {
      continue;
    }

    const storeNumber = getColumnValue(row, "store_number", "Store_Number", "store number")?.replace(/['"]/g, '').trim() || "";
    const locationName = getColumnValue(row, "store_name", "Restaurant", "Store_Name", "store name") || "";
    
    // Find location using cached map
    const locationId = storeNumber ? (locationLookup.get(storeNumber) || null) : null;
    
    // Parse financial fields
    const subtotal = parseFloat(getColumnValue(row, "subtotal", "Subtotal", "Sale_Amount", "sale amount") || "0");
    const subtotalSalesTax = parseFloat(getColumnValue(row, "subtotal_sales_tax", "Subtotal_Sales_Tax", "tax amount", "Tax Amount") || "0");
    const saleAmount = subtotal + subtotalSalesTax;

    transactions.push({
      clientId,
      locationId,
      orderId: orderNumber,
      orderDate: getColumnValue(row, "transaction_date", "Order_Date", "transaction date", "order_date") || "",
      transactionType: getColumnValue(row, "transaction_type", "Transaction_Type", "transaction type") || "",
      transactionId,
      restaurant: locationName,
      orderChannel: getColumnValue(row, "order_channel", "Order_Channel", "order channel") || null,
      fulfillmentType: getColumnValue(row, "fulfillment_type", "Fulfillment_Type", "fulfillment type") || null,
      subtotal,
      subtotalSalesTax,
      saleAmount,
      commission: parseFloat(getColumnValue(row, "commission", "Commission") || "0"),
      deliveryCommission: parseFloat(getColumnValue(row, "delivery_commission", "Delivery_Commission", "delivery commission") || "0"),
      processingFee: parseFloat(getColumnValue(row, "processing_fee", "merchant_service_fee", "Processing_Fee", "processing fee") || "0"),
      merchantFundedPromotion: parseFloat(getColumnValue(row, "merchant_funded_promotion", "Merchant_Funded_Promotion", "merchant funded promotion") || "0"),
      merchantNetTotal: parseFloat(getColumnValue(row, "merchant_net_total", "Merchant_Net_Total", "Net_Sales", "net sales", "total_payout") || "0"),
      transactionNote: getColumnValue(row, "transaction_note", "Transaction_Note", "transaction note") || null,
      customerType: getColumnValue(row, "gh_plus_customer", "Customer_Type", "customer type", "Customer Type") || "Unknown",
    });
  }

  console.log(`   Created ${transactions.length} transactions`);
  
  // Batch insert
  await storage.createGrubhubTransactionsBatch(transactions);
  
  const mapped = transactions.filter(t => t.locationId !== null).length;
  const unmapped = transactions.length - mapped;
  
  console.log(`✅ Grubhub complete: ${transactions.length} transactions (${mapped} mapped, ${unmapped} unmapped)\n`);
}

async function processUberEatsFile() {
  console.log("\n📦 Processing Uber Eats file...");
  
  const csvContent = readFileSync("/tmp/ubereats_upload.csv", "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    from_line: 2, // Skip first row (descriptions), use second row as headers
  });

  console.log(`   Found ${records.length} rows`);
  
  const clientId = "83506705-b408-4f0a-a9b0-e5b585db3b7d";
  
  // Step 1: Pre-fetch all locations and build a lookup map
  console.log(`   Pre-fetching locations for mapping...`);
  const allLocations = await storage.getLocationsByClient(clientId);
  const locationLookup = new Map<string, string>(); // extractedCode -> locationId
  
  for (const loc of allLocations) {
    if (loc.uberEatsStoreLabel) {
      locationLookup.set(loc.uberEatsStoreLabel, loc.id);
    }
    if (loc.storeId) {
      locationLookup.set(loc.storeId, loc.id);
    }
  }
  
  console.log(`   Cached ${locationLookup.size} location mappings`);
  
  // Step 2: Build transactions array using cached location IDs
  const transactions: InsertUberEatsTransaction[] = [];
  
  let skipped = 0;
  for (const row of records) {
    const workflowId = getColumnValue(row, "Workflow ID", "Workflow_ID", "workflow_id");
    const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id");
    
    // Skip rows without required IDs (ad spend rows, etc.)
    if (!workflowId || workflowId.trim() === "" || !orderId || orderId.trim() === "") {
      skipped++;
      continue;
    }

    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name") || "";
    
    // Find location by matching extracted code to cached map
    const extractedCode = extractCodeFromParentheses(locationName);
    const locationId = extractedCode ? (locationLookup.get(extractedCode) || null) : null;
    
    const salesExclTax = parseFloat(getColumnValue(row, "Sales (excl. tax)", "Sales_excl_tax", "sales_excl_tax") || "0");
    const tax = parseFloat(getColumnValue(row, "Tax on Sales", "Tax", "Tax_on_Sales", "tax_on_sales") || "0");

    transactions.push({
      clientId,
      locationId,
      orderId,
      workflowId,
      orderStatus: getColumnValue(row, "Order Status", "Order_Status", "order_status") || null,
      date: getColumnValue(row, "Order Date", "Date", "Order_Date", "order_date") || "",
      time: getColumnValue(row, "Order Accept Time", "Time", "Order_Accept_Time", "order_accept_time") || "",
      location: locationName,
      
      // Sales fields
      salesExclTax,
      subtotal: salesExclTax + tax,
      tax,
      
      // Fee fields
      deliveryFee: parseFloat(getColumnValue(row, "Delivery Fee", "Delivery_Fee", "delivery_fee") || "0"),
      serviceFee: parseFloat(getColumnValue(row, "Service Fee", "Service_Fee", "service_fee") || "0"),
      platformFee: parseFloat(getColumnValue(row, "Marketplace Fee", "Platform_Fee", "Platform Fee", "marketplace_fee") || "0"),
      
      // Marketing/promotional fields
      offersOnItems: parseFloat(getColumnValue(row, "Offers on items (incl. tax)", "Offers_on_items", "offers_on_items") || "0"),
      deliveryOfferRedemptions: parseFloat(getColumnValue(row, "Delivery Offer Redemptions (incl. tax)", "Delivery_Offer_Redemptions", "delivery_offer_redemptions") || "0"),
      offerRedemptionFee: parseFloat(getColumnValue(row, "Offer Redemption Fee", "Offer_Redemption_Fee", "offer_redemption_fee") || "0"),
      marketingPromo: getColumnValue(row, "Marketing Promotion", "Marketing_Promo", "marketing_promotion") || null,
      marketingAmount: parseFloat(getColumnValue(row, "Marketing Adjustment", "Marketing_Amount", "marketing_adjustment") || "0"),
      
      // Other payments
      otherPayments: parseFloat(getColumnValue(row, "Other payments", "Other_payments", "other_payments") || "0"),
      otherPaymentsDescription: getColumnValue(row, "Other payments description", "Other_payments_description", "other_payments_description") || null,
      
      // Payout (note the trailing space in some CSVs)
      netPayout: parseFloat(getColumnValue(row, "Total payout ", "Total payout", "Net_Payout", "net_payout") || "0"),
      
      // Other
      customerRating: null,
    });
  }

  console.log(`   Skipped ${skipped} rows (no workflow ID - likely ad spend)`);
  console.log(`   Created ${transactions.length} transactions`);
  
  // Deduplicate by workflowId (keep last occurrence)
  const uniqueTransactions = new Map<string, InsertUberEatsTransaction>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.workflowId, txn);
  }
  
  const deduplicatedTransactions = Array.from(uniqueTransactions.values());
  console.log(`   Deduplicated to ${deduplicatedTransactions.length} unique transactions`);
  
  // Batch insert
  await storage.createUberEatsTransactionsBatch(deduplicatedTransactions);
  
  const mapped = deduplicatedTransactions.filter(t => t.locationId !== null).length;
  const unmapped = deduplicatedTransactions.length - mapped;
  
  console.log(`✅ Uber Eats complete: ${deduplicatedTransactions.length} transactions (${mapped} mapped, ${unmapped} unmapped)\n`);
}

async function main() {
  console.log("🚀 Starting data import process...\n");
  
  try {
    await processGrubhubFile();
    await processUberEatsFile();
    
    console.log("\n✅ All imports complete! Run diagnostic to see results:");
    console.log("   tsx server/quick-diagnostic.ts");
  } catch (error) {
    console.error("\n❌ Import failed:", error);
    process.exit(1);
  }
}

main();
