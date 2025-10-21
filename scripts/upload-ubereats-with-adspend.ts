import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { DbStorage } from "../server/db-storage";
import type { InsertUberEatsTransaction } from "../shared/schema";

const CAPRIOTTIS_CLIENT_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";
const UBEREATS_FILE = "attached_assets/305f864c-ba6b-4e69-be00-f8482f56ea5b-united_states_1761071444429.csv";

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

async function findOrCreateLocation(storage: DbStorage, clientId: string, storeName: string, storeId: string): Promise<string | null> {
  const locations = await storage.getLocationsByClient(clientId);
  
  // Match by uberEatsStoreKey (storeId)
  if (storeId) {
    const match = locations.find(loc => 
      loc.uberEatsStoreKey && 
      loc.uberEatsStoreKey === storeId
    );
    
    if (match) {
      return match.id;
    }
  }
  
  // Match by ubereatsName
  const nameMatch = locations.find(loc => 
    loc.ubereatsName && 
    loc.ubereatsName.toLowerCase() === storeName.toLowerCase()
  );
  
  if (nameMatch) {
    return nameMatch.id;
  }
  
  // Create unmapped location
  console.log(`  Creating unmapped location: ${storeName} (${storeId})`);
  const newLocation = await storage.createLocation({
    clientId,
    canonicalName: storeName,
    ubereatsName: storeName,
    isVerified: false,
  });
  
  return newLocation.id;
}

async function main() {
  const storage = new DbStorage();
  
  console.log("=== Uploading UberEats CSV with Ad Spend ===\n");
  console.log(`File: ${UBEREATS_FILE}`);
  
  const buffer = readFileSync(UBEREATS_FILE);
  
  // Parse CSV - skip first 2 header rows
  const rows = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    from_line: 2, // Skip description row
    bom: true,
  });
  
  console.log(`Parsed ${rows.length} rows\n`);
  
  // Step 1: Collect unique locations
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Set<{name: string, id: string}>();
  
  for (const row of rows) {
    const storeName = getColumnValue(row, "Store Name");
    const storeId = getColumnValue(row, "Store ID");
    
    if (storeName && storeName.trim() !== "") {
      uniqueLocations.add({name: storeName, id: storeId});
    }
  }
  
  // Batch create/find locations
  for (const loc of uniqueLocations) {
    const locationId = await findOrCreateLocation(storage, CAPRIOTTIS_CLIENT_ID, loc.name, loc.id);
    if (locationId) {
      locationMap.set(loc.name, locationId);
    }
  }
  
  console.log(`Mapped ${locationMap.size} unique locations\n`);
  
  // Step 2: Build transactions
  const transactions: InsertUberEatsTransaction[] = [];
  let adSpendCount = 0;
  let regularTransactions = 0;
  
  for (const row of rows) {
    const workflowId = getColumnValue(row, "Workflow ID");
    const storeName = getColumnValue(row, "Store Name");
    const locationId = locationMap.get(storeName) || null;
    
    const salesExclTax = Math.abs(parseFloat(getColumnValue(row, "Sales (excl. tax)") || "0"));
    const taxOnSales = Math.abs(parseFloat(getColumnValue(row, "Tax on Sales") || "0"));
    const commission = Math.abs(parseFloat(getColumnValue(row, "Commission") || "0"));
    const netPayout = parseNegativeFloat(getColumnValue(row, "Total payout"));
    const otherPayments = parseNegativeFloat(getColumnValue(row, "Other payments"));
    const otherPaymentsDescription = getColumnValue(row, "Other payments description") || null;
    
    // Check if this is an ad spend row
    const isAdSpend = otherPaymentsDescription === "Ad Spend";
    
    if (isAdSpend) {
      adSpendCount++;
    } else if (workflowId && workflowId.trim() !== "") {
      regularTransactions++;
    }
    
    // Create transaction record
    transactions.push({
      clientId: CAPRIOTTIS_CLIENT_ID,
      locationId,
      workflowId: workflowId || null,
      storeName: storeName,
      storeId: getColumnValue(row, "Store ID") || null,
      orderId: getColumnValue(row, "Order ID") || null,
      diningMode: getColumnValue(row, "Dining Mode") || null,
      orderStatus: getColumnValue(row, "Order Status") || null,
      orderDate: getColumnValue(row, "Order Date") || null,
      salesExclTax,
      taxOnSales,
      commission,
      netPayout: Math.abs(netPayout),
      offersOnItems: 0,
      deliveryOfferRedemptions: 0,
      offerRedemptionFee: 0,
      otherPayments: Math.abs(otherPayments),
      otherPaymentsDescription,
      totalPayout: Math.abs(netPayout),
    });
  }
  
  console.log(`Built ${transactions.length} transaction records:`);
  console.log(`  - ${adSpendCount} ad spend rows`);
  console.log(`  - ${regularTransactions} regular transactions\n`);
  
  // Step 3: Upload in batch
  console.log(`Uploading to database...`);
  await storage.createUberEatsTransactionsBatch(transactions);
  console.log(`✓ Upload complete!\n`);
  
  // Verify ad spend
  console.log(`Verifying ad spend data...`);
  const verifyQuery = await fetch(
    `http://localhost:5000/api/analytics/overview?clientId=${CAPRIOTTIS_CLIENT_ID}&weekStart=2025-09-08&weekEnd=2025-09-14`
  );
  const analytics = await verifyQuery.json();
  
  const uePlatform = analytics.platformBreakdown.find((p: any) => p.platform === 'ubereats');
  if (uePlatform) {
    console.log(`\nUberEats Week 9/8 Results:`);
    console.log(`  Ad Spend: $${uePlatform.adSpend.toFixed(2)}`);
    console.log(`  Offers: $${uePlatform.offerDiscountValue.toFixed(2)}`);
    console.log(`  Total Marketing: $${uePlatform.totalMarketingInvestment.toFixed(2)}`);
    console.log(`  Expected: $9,214 ($5,253 ad spend + $3,961 offers)`);
  }
}

main().catch(console.error);
