import { readFileSync, readdirSync } from "fs";
import { parse } from "csv-parse/sync";
import { DbStorage } from "../server/db-storage";
import type { InsertUberEatsTransaction } from "../shared/schema";
import { sql } from "drizzle-orm";

const CAPRIOTTIS_CLIENT_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";
const ASSETS_DIR = "attached_assets";

// Find all UberEats CSV files
const files = readdirSync(ASSETS_DIR)
  .filter(f => f.includes("united_states") && f.endsWith(".csv"))
  .map(f => `${ASSETS_DIR}/${f}`);

console.log(`Found ${files.length} UberEats CSV files\n`);

function getColumnValue(row: any, ...possibleNames: string[]): string {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return String(row[name]);
    }
  }
  return '';
}

function parseFloat2(value: string): number {
  if (!value || value === 'NULL') return 0;
  const num = parseFloat(value.replace(/[^0-9.-]/g, ''));
  return isNaN(num) ? 0 : num;
}

async function main() {
  const storage = new DbStorage();
  
  console.log("=== Clearing existing UberEats transactions ===");
  await storage.db.execute(sql`
    DELETE FROM uber_eats_transactions 
    WHERE client_id = ${CAPRIOTTIS_CLIENT_ID}
  `);
  console.log("✓ Cleared\n");
  
  // Collect all transactions from all files
  const allTransactions: InsertUberEatsTransaction[] = [];
  const workflowIdsSeen = new Set<string>();
  
  for (const filePath of files) {
    console.log(`Processing: ${filePath}`);
    
    try {
      const buffer = readFileSync(filePath);
      
      // Parse CSV - skip first 2 header rows
      const rows = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        from_line: 2,
        bom: true,
      });
      
      console.log(`  Parsed ${rows.length} rows`);
      
      let newRows = 0;
      let adSpendRows = 0;
      
      for (const row of rows) {
        const workflowId = getColumnValue(row, "Workflow ID");
        const storeName = getColumnValue(row, "Store Name");
        const storeId = getColumnValue(row, "Store ID");
        const orderId = getColumnValue(row, "Order ID") || "N/A";
        const orderDate = getColumnValue(row, "Order Date") || "N/A";
        const orderTime = getColumnValue(row, "Order Time") || "00:00";
        const orderStatus = getColumnValue(row, "Order Status");
        const diningMode = getColumnValue(row, "Dining Mode");
        
        // Skip if we've already seen this workflow ID
        if (workflowId && workflowIdsSeen.has(workflowId)) {
          continue;
        }
        
        const salesExclTax = Math.abs(parseFloat2(getColumnValue(row, "Sales (excl. tax)")));
        const salesInclTax = Math.abs(parseFloat2(getColumnValue(row, "Sales (incl. tax)")));
        const taxOnSales = Math.abs(parseFloat2(getColumnValue(row, "Tax on Sales")));
        const deliveryFee = Math.abs(parseFloat2(getColumnValue(row, "Delivery Fee")));
        const serviceFee = Math.abs(parseFloat2(getColumnValue(row, "Service Fee")));
        const platformFee = Math.abs(parseFloat2(getColumnValue(row, "Platform Fee", "Commission")));
        
        // Marketing fields
        const offersOnItems = parseFloat2(getColumnValue(row, "Offers on items (incl. tax)"));
        const deliveryOfferRedemptions = parseFloat2(getColumnValue(row, "Delivery Offer Redemptions (incl. tax)"));
        const offerRedemptionFee = Math.abs(parseFloat2(getColumnValue(row, "Offer Redemption Fee")));
        
        // Other payments (includes ad spend)
        const netPayout = parseFloat2(getColumnValue(row, "Total payout"));
        const otherPayments = parseFloat2(getColumnValue(row, "Other payments"));
        const otherPaymentsDescription = getColumnValue(row, "Other payments description") || null;
        
        // Check if this is an ad spend row
        const isAdSpend = otherPaymentsDescription === "Ad Spend";
        
        if (isAdSpend) {
          adSpendRows++;
        }
        
        // Mark workflow ID as seen
        if (workflowId) {
          workflowIdsSeen.add(workflowId);
          newRows++;
        }
        
        // Create transaction record
        allTransactions.push({
          clientId: CAPRIOTTIS_CLIENT_ID,
          locationId: null, // Will be matched later
          orderId,
          workflowId: workflowId || `generated_${Date.now()}_${Math.random()}`,
          orderStatus,
          date: orderDate,
          time: orderTime,
          location: storeName,
          salesExclTax,
          subtotal: salesInclTax,
          tax: taxOnSales,
          deliveryFee,
          serviceFee,
          platformFee,
          offersOnItems: Math.abs(offersOnItems),
          deliveryOfferRedemptions: Math.abs(deliveryOfferRedemptions),
          offerRedemptionFee,
          marketingPromo: null,
          marketingAmount: 0,
          otherPayments: Math.abs(otherPayments),
          otherPaymentsDescription,
          netPayout: Math.abs(netPayout),
          customerRating: null,
        });
      }
      
      console.log(`  Added ${newRows} unique transactions (${adSpendRows} ad spend rows)\n`);
      
    } catch (error) {
      console.error(`  Error processing ${filePath}:`, error);
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Total unique transactions: ${allTransactions.length}`);
  console.log(`Ad spend rows: ${allTransactions.filter(t => t.otherPaymentsDescription === 'Ad Spend').length}`);
  console.log(`Total ad spend: $${allTransactions.filter(t => t.otherPaymentsDescription === 'Ad Spend').reduce((sum, t) => sum + t.otherPayments, 0).toFixed(2)}`);
  
  console.log(`\nUploading to database in batches...`);
  
  // Upload in batches of 1000
  const batchSize = 1000;
  for (let i = 0; i < allTransactions.length; i += batchSize) {
    const batch = allTransactions.slice(i, i + batchSize);
    console.log(`  Uploading batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(allTransactions.length / batchSize)} (${batch.length} transactions)`);
    await storage.createUberEatsTransactionsBatch(batch);
  }
  
  console.log(`✓ Upload complete!\n`);
}

main().catch(console.error);
