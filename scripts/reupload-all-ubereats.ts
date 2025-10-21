import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { DbStorage } from "../server/db-storage";
import type { InsertUberEatsTransaction } from "../shared/schema";

const CAPRIOTTIS_CLIENT_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

// All UberEats CSV files (identified by "united_states" in filename)
const UBEREATS_FILES = [
  "attached_assets/2ec4128c-c9bd-48f8-9f54-82ee0a670d39-united_states_1760742358828.csv",
  "attached_assets/305f864c-ba6b-4e69-be00-f8482f56ea5b-united_states_1761001541535.csv",
  "attached_assets/305f864c-ba6b-4e69-be00-f8482f56ea5b-united_states_1761019117059.csv",
  "attached_assets/645fb228-803b-45e3-b6de-3e7792ef1a97-united_states (1)_1760994428325.csv",
  "attached_assets/645fb228-803b-45e3-b6de-3e7792ef1a97-united_states (1)_1761016323567.csv",
  "attached_assets/66d3abf1-0326-47a5-8a73-7ead7981350b-united_states (1)_1760937747500.csv",
  "attached_assets/6784c24a-0b8f-4c69-8a61-77e74bb89811-united_states_1760901415065.csv",
  "attached_assets/6784c24a-0b8f-4c69-8a61-77e74bb89811-united_states_1760906228250.csv",
  "attached_assets/6784c24a-0b8f-4c69-8a61-77e74bb89811-united_states_1760915830111.csv",
  "attached_assets/6784c24a-0b8f-4c69-8a61-77e74bb89811-united_states_1760922116016.csv",
  "attached_assets/6784c24a-0b8f-4c69-8a61-77e74bb89811-united_states_1760928022792.csv",
  "attached_assets/8b03ddef-cfc0-4821-8219-abe7664064f9-united_states_1761063414058.csv",
  "attached_assets/9176bfa9-e35d-43c1-8c38-2b318f3ef120-united_states_1760898219620.csv",
  "attached_assets/aa8b1212-5eb3-4c31-82bf-61118961e3c9-united_states_1760937105563.csv",
  "attached_assets/aa8b1212-5eb3-4c31-82bf-61118961e3c9-united_states_1760938287485.csv",
  "attached_assets/abd32c28-5d15-462f-ac47-1e80348c0bd8-united_states (1)_1760977498224.csv",
  "attached_assets/abd32c28-5d15-462f-ac47-1e80348c0bd8-united_states (1)_1760993784475.csv",
  "attached_assets/abd32c28-5d15-462f-ac47-1e80348c0bd8-united_states (1)_1760997348174.csv",
  "attached_assets/abd32c28-5d15-462f-ac47-1e80348c0bd8-united_states (1)_1761020000931.csv",
  "attached_assets/abd32c28-5d15-462f-ac47-1e80348c0bd8-united_states_1760811061261.csv",
];

function getColumnValue(row: any, ...possibleNames: string[]): string {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return String(row[name]);
    }
  }
  return '';
}

function parseCSV(buffer: Buffer): any[] {
  // Handle BOM
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    buffer = buffer.subarray(3);
  }
  
  // Check for dual-header format (description row + actual headers)
  const headerCheck = parse(buffer, {
    columns: false,
    skip_empty_lines: true,
    trim: true,
    to_line: 3,
    bom: true,
  });
  
  const firstRow = headerCheck[0];
  const isDescriptionRow = firstRow && firstRow.length > 0 && 
    /\b(as per|whether it|either|mode of|platform from which)\b/i.test(String(firstRow[0]));
  
  if (isDescriptionRow && headerCheck[1]) {
    // Use row 1 as column headers, skip both description and header rows
    return parse(buffer, {
      columns: headerCheck[1],
      skip_empty_lines: true,
      trim: true,
      from_line: 3,
      bom: true,
    });
  }
  
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

async function findOrCreateLocation(storage: DbStorage, clientId: string, name: string): Promise<string | null> {
  const locations = await storage.getLocationsByClient(clientId);
  
  // Match by uberEatsStoreLabel (Column E from master sheet)
  const match = locations.find(loc => 
    loc.uberEatsStoreLabel && 
    loc.uberEatsStoreLabel.toLowerCase() === name.toLowerCase()
  );
  
  if (match) {
    return match.id;
  }
  
  // Create unmapped location
  console.log(`Creating unmapped location: ${name}`);
  const newLocation = await storage.createLocation({
    clientId,
    canonicalName: name,
    uberEatsName: name,
    isVerified: false,
  });
  
  return newLocation.id;
}

async function processFile(storage: DbStorage, filename: string, fileIndex: number, totalFiles: number) {
  console.log(`\n[${fileIndex}/${totalFiles}] Processing: ${filename}`);
  
  const buffer = readFileSync(filename);
  const rows = parseCSV(buffer);
  
  console.log(`  Parsed ${rows.length} rows`);
  
  // Step 1: Collect unique locations
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Set<string>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    if (locationName && locationName.trim() !== "") {
      uniqueLocations.add(locationName);
    }
  }
  
  // Batch create/find locations
  for (const locationName of uniqueLocations) {
    const locationId = await findOrCreateLocation(storage, CAPRIOTTIS_CLIENT_ID, locationName);
    if (locationId) {
      locationMap.set(locationName, locationId);
    }
  }
  
  // Step 2: Build transactions
  const transactions: InsertUberEatsTransaction[] = [];
  
  for (const row of rows) {
    const workflowId = getColumnValue(row, "Workflow ID", "Workflow_ID", "workflow_id", "Unique ID to identify the order");
    if (!workflowId || workflowId.trim() === "") {
      continue;
    }
    
    const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id", "Order ID as per Uber Eats manager");
    if (!orderId || orderId.trim() === "") {
      continue;
    }
    
    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    const locationId = locationMap.get(locationName) || null;
    
    const salesExclTax = parseFloat(getColumnValue(row, "Sales (excl. tax)", "Sales_excl_tax", "sales_excl_tax")) || 0;
    const tax = parseFloat(getColumnValue(row, "Tax on Sales", "Tax", "Tax_on_Sales", "tax_on_sales")) || 0;
    
    transactions.push({
      clientId: CAPRIOTTIS_CLIENT_ID,
      locationId,
      orderId,
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
  
  // Step 3: Deduplicate by workflowId
  const uniqueTransactions = new Map<string, InsertUberEatsTransaction>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.workflowId, txn);
  }
  
  const deduplicatedTransactions = Array.from(uniqueTransactions.values());
  console.log(`  Reduced ${transactions.length} rows to ${deduplicatedTransactions.length} unique transactions`);
  
  // Step 4: Upload in batch
  await storage.createUberEatsTransactionsBatch(deduplicatedTransactions);
  console.log(`  ✓ Upload complete`);
  
  return deduplicatedTransactions.length;
}

async function main() {
  const storage = new DbStorage();
  
  console.log("=== Re-uploading All UberEats Data ===\n");
  console.log(`Found ${UBEREATS_FILES.length} UberEats CSV files`);
  
  // Step 1: Clear existing UberEats data
  console.log("\n📋 Step 1: Clearing existing UberEats transactions...");
  await storage.clearUberEatsTransactions(CAPRIOTTIS_CLIENT_ID);
  console.log("✓ Cleared all existing UberEats data");
  
  // Step 2: Re-upload all files
  console.log("\n📋 Step 2: Re-uploading all UberEats CSVs with offerRedemptionFee...");
  
  let totalTransactions = 0;
  for (let i = 0; i < UBEREATS_FILES.length; i++) {
    const count = await processFile(storage, UBEREATS_FILES[i], i + 1, UBEREATS_FILES.length);
    totalTransactions += count;
  }
  
  console.log(`\n✅ Re-upload complete!`);
  console.log(`   Total transactions uploaded: ${totalTransactions.toLocaleString()}`);
  console.log(`\n🎉 Dashboard will now show correct UberEats data with offer redemption fees!`);
}

main().catch(console.error);
