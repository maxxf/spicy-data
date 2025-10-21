import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { DbStorage } from "../server/db-storage";
import type { InsertDoordashTransaction } from "../shared/schema";

const CAPRIOTTIS_CLIENT_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

// All DoorDash CSV files
const DOORDASH_FILES = [
  "attached_assets/financials_simplified_transactions_us_2025-09-08_2025-09-14_Hqdxm_2025-10-21T15-58-24Z_1761063047050.csv",
  "attached_assets/financials_simplified_transactions_us_2025-09-15_2025-09-21_N5yvt_2025-10-21T15-57-40Z_1761063055203.csv",
  "attached_assets/financials_simplified_transactions_us_2025-09-22_2025-09-28_JBp3r_2025-10-21T03-56-20Z_1761063063856.csv",
  "attached_assets/financials_simplified_transactions_us_2025-09-29_2025-10-05_2QIOm_2025-10-21T16-11-32Z_1761063150457.csv",
  "attached_assets/financials_simplified_transactions_us_2025-10-06_2025-10-12_n9mP1_2025-10-21T04-12-40Z_1761063163914.csv",
  "attached_assets/financials_simplified_transactions_us_2025-10-13_2025-10-19_dCiqE_2025-10-21T03-57-54Z_1761063169575.csv",
];

function getColumnValue(row: any, ...possibleNames: string[]): string {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return String(row[name]);
    }
  }
  return '';
}

function parseNegativeFloat(value: string): number {
  if (!value || value === 'NULL') return 0;
  const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : -Math.abs(num);
}

async function findOrCreateLocation(storage: DbStorage, clientId: string, name: string): Promise<string | null> {
  const locations = await storage.getLocationsByClient(clientId);
  
  // Match by doorDashStoreKey
  const match = locations.find(loc => 
    loc.doorDashStoreKey && 
    loc.doorDashStoreKey.toLowerCase() === name.toLowerCase()
  );
  
  if (match) {
    return match.id;
  }
  
  // Create unmapped location
  console.log(`  Creating unmapped location: ${name}`);
  const newLocation = await storage.createLocation({
    clientId,
    canonicalName: name,
    doordashName: name,
    isVerified: false,
  });
  
  return newLocation.id;
}

async function processFile(storage: DbStorage, filename: string, fileIndex: number, totalFiles: number) {
  console.log(`\n[${fileIndex}/${totalFiles}] Processing: ${filename}`);
  
  const buffer = readFileSync(filename);
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
  
  console.log(`  Parsed ${rows.length} rows`);
  
  // Step 1: Collect unique locations
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Set<string>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "Store name", "Store Name");
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
  const transactions: InsertDoordashTransaction[] = [];
  
  for (const row of rows) {
    const transactionId = getColumnValue(row, "DoorDash transaction ID");
    if (!transactionId || transactionId.trim() === "") {
      continue;
    }
    
    const orderNumber = getColumnValue(row, "DoorDash order ID");
    if (!orderNumber || orderNumber.trim() === "") {
      continue;
    }
    
    const locationName = getColumnValue(row, "Store name");
    const locationId = locationMap.get(locationName) || null;
    
    // Parse all financial columns using the new column names
    const offersOnItems = parseNegativeFloat(getColumnValue(row, "Customer discounts"));
    const deliveryOfferRedemptions = 0; // Not in this CSV format
    const marketingCredits = parseNegativeFloat(getColumnValue(row, "DoorDash marketing credit"));
    const thirdPartyContribution = parseNegativeFloat(getColumnValue(row, "Third-party contribution"));
    const marketingFees = parseNegativeFloat(getColumnValue(row, "Marketing fees | (including any applicable taxes)"));
    
    const subtotal = parseNegativeFloat(getColumnValue(row, "Subtotal"));
    const taxes = parseNegativeFloat(getColumnValue(row, "Tax (subtotal)"));
    const commission = parseNegativeFloat(getColumnValue(row, "Commission"));
    const errorCharge = parseNegativeFloat(getColumnValue(row, "Error charges"));
    const netTotal = parseNegativeFloat(getColumnValue(row, "Net total"));
    
    const totalMarketingSpend = Math.abs(marketingFees) + 
      Math.abs(offersOnItems) + 
      Math.abs(deliveryOfferRedemptions) + 
      marketingCredits + 
      thirdPartyContribution;
    
    transactions.push({
      clientId: CAPRIOTTIS_CLIENT_ID,
      locationId,
      transactionId: transactionId,
      orderNumber: orderNumber,
      transactionDate: getColumnValue(row, "Timestamp local time"),
      storeLocation: locationName,
      channel: getColumnValue(row, "Channel") || null,
      orderStatus: getColumnValue(row, "Final order status") || null,
      transactionType: getColumnValue(row, "Transaction type")?.trim() || null,
      salesExclTax: Math.abs(subtotal),
      orderSubtotal: Math.abs(subtotal),
      taxes: Math.abs(taxes),
      deliveryFees: 0,
      commission: Math.abs(commission),
      marketingSpend: totalMarketingSpend,
      errorCharges: Math.abs(errorCharge),
      netPayment: Math.abs(netTotal),
      offersOnItems: Math.abs(offersOnItems),
      deliveryOfferRedemptions: Math.abs(deliveryOfferRedemptions),
      marketingCredits: marketingCredits,
      thirdPartyContribution: thirdPartyContribution,
      otherPayments: Math.abs(marketingFees),
      otherPaymentsDescription: null,
      totalPayout: Math.abs(netTotal),
    });
  }
  
  console.log(`  Built ${transactions.length} transactions`);
  
  // Step 3: Upload in batch
  await storage.createDoordashTransactionsBatch(transactions);
  console.log(`  ✓ Upload complete`);
  
  return transactions.length;
}

async function main() {
  const storage = new DbStorage();
  
  console.log("=== Uploading All DoorDash CSVs ===\n");
  console.log(`Found ${DOORDASH_FILES.length} DoorDash CSV files`);
  
  let totalTransactions = 0;
  for (let i = 0; i < DOORDASH_FILES.length; i++) {
    const count = await processFile(storage, DOORDASH_FILES[i], i + 1, DOORDASH_FILES.length);
    totalTransactions += count;
  }
  
  console.log(`\n✅ Upload complete!`);
  console.log(`   Total transactions uploaded: ${totalTransactions.toLocaleString()}`);
  
  // Verify week 9/8
  console.log(`\n📊 Verifying week 9/8 data...`);
  const weekData = await fetch(
    `http://localhost:5000/api/analytics/overview?clientId=${CAPRIOTTIS_CLIENT_ID}&weekStart=2025-09-08&weekEnd=2025-09-14`
  );
  const analytics = await weekData.json();
  
  const ddPlatform = analytics.platformBreakdown.find((p: any) => p.platform === 'doordash');
  if (ddPlatform) {
    console.log(`\nDoorDash Week 9/8 Results:`);
    console.log(`  Ad Spend: $${ddPlatform.adSpend.toFixed(2)}`);
    console.log(`  Offers: $${ddPlatform.offerDiscountValue.toFixed(2)}`);
    console.log(`  Total Marketing: $${ddPlatform.totalMarketingInvestment.toFixed(2)}`);
    console.log(`  Expected: $32,821`);
  }
}

main().catch(console.error);
