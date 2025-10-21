import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { DbStorage } from '../server/db-storage';
import type { InsertUberEatsTransaction, InsertGrubhubTransaction } from '../shared/schema';

const CAPRIOTTIS_CLIENT_ID = '83506705-b408-4f0a-a9b0-e5b585db3b7d';

// Helper functions copied from upload-data.ts
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
  
  return '';
}

function parseCSV(buffer: Buffer, platform?: string): any[] {
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    buffer = buffer.subarray(3);
  }
  
  if (platform === "ubereats") {
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
  
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });
}

async function findOrCreateLocation(storage: DbStorage, clientId: string, name: string, platform: string): Promise<string | null> {
  const locations = await storage.getLocationsByClient(clientId);
  
  let matchedLocation = null;
  
  if (platform === "ubereats") {
    matchedLocation = locations.find((loc) => loc.uberEatsName === name);
  } else if (platform === "doordash") {
    matchedLocation = locations.find((loc) => loc.doordashName === name);
  } else if (platform === "grubhub") {
    matchedLocation = locations.find((loc) => loc.grubhubName === name);
  }
  
  return matchedLocation?.id || null;
}

async function uploadUberEats() {
  const storage = new DbStorage();
  const buffer = readFileSync('attached_assets/8b03ddef-cfc0-4821-8219-abe7664064f9-united_states_1761063414058.csv');
  const rows = parseCSV(buffer, 'ubereats');
  
  console.log(`Processing ${rows.length} Uber Eats rows...`);
  
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Set<string>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    if (locationName && locationName.trim() !== "") {
      uniqueLocations.add(locationName);
    }
  }
  
  for (const locationName of uniqueLocations) {
    const locationId = await findOrCreateLocation(storage, CAPRIOTTIS_CLIENT_ID, locationName, "ubereats");
    if (locationId) {
      locationMap.set(locationName, locationId);
    }
  }
  
  const transactions: InsertUberEatsTransaction[] = [];
  
  let debugCount = 0;
  for (const row of rows) {
    const workflowId = getColumnValue(row, "Workflow ID", "Workflow_ID", "workflow_id", "Unique ID to identify the order");
    if (!workflowId || workflowId.trim() === "") {
      if (debugCount < 3) {
        console.log(`Skipping row - no workflow ID. Sample keys:`, Object.keys(row).slice(0, 10));
        debugCount++;
      }
      continue;
    }
    
    const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id", "Order ID as per Uber Eats manager");
    if (!orderId || orderId.trim() === "") {
      if (debugCount < 5) {
        console.log(`Skipping row - no order ID. Workflow ID: ${workflowId}`);
        debugCount++;
      }
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
  
  const uniqueTransactions = new Map<string, InsertUberEatsTransaction>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.workflowId, txn);
  }
  
  const deduplicatedTransactions = Array.from(uniqueTransactions.values());
  console.log(`Uber Eats: Reduced ${transactions.length} rows to ${deduplicatedTransactions.length} unique transactions`);
  
  await storage.createUberEatsTransactionsBatch(deduplicatedTransactions);
  console.log('✓ Uber Eats upload complete');
}

async function uploadGrubhub() {
  const storage = new DbStorage();
  const buffer = readFileSync('attached_assets/caps_-_9_8_1761063414058.csv');
  const rows = parseCSV(buffer, 'grubhub');
  
  console.log(`Processing ${rows.length} Grubhub rows...`);
  
  const parseNegativeFloat = (val: any) => {
    if (!val) return 0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };
  
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Map<string, string | undefined>();
  
  for (const row of rows) {
    const storeName = getColumnValue(row, "store_name", "Store Name", "location", "Location");
    const storeNumber = getColumnValue(row, "store_number", "Store Number", "store_id");
    if (storeName && storeName.trim() !== "") {
      uniqueLocations.set(storeName, storeNumber || undefined);
    }
  }
  
  for (const [storeName, _storeNumber] of uniqueLocations) {
    const locationId = await findOrCreateLocation(storage, CAPRIOTTIS_CLIENT_ID, storeName, "grubhub");
    if (locationId) {
      locationMap.set(storeName, locationId);
    }
  }
  
  const transactions: InsertGrubhubTransaction[] = [];
  
  for (const row of rows) {
    const orderNumber = getColumnValue(row, "order_number", "Order Number");
    if (!orderNumber || orderNumber.trim() === "") {
      continue;
    }
    
    const transactionDate = getColumnValue(row, "transaction_date", "Transaction Date", "date", "Date");
    if (!transactionDate || transactionDate.trim() === "") {
      continue;
    }
    
    // Get transaction_id for unique constraint
    const transactionId = getColumnValue(row, "transaction_id", "Transaction ID");
    if (!transactionId || transactionId.trim() === "") {
      continue;
    }
    
    const storeName = getColumnValue(row, "store_name", "Store Name", "location", "Location");
    const locationId = locationMap.get(storeName) || null;
    
    const subtotal = parseNegativeFloat(getColumnValue(row, "subtotal", "Subtotal"));
    const tip = parseNegativeFloat(getColumnValue(row, "tip", "Tip"));
    const tax = parseNegativeFloat(getColumnValue(row, "subtotal_sales_tax", "Subtotal Sales Tax", "tax"));
    const commission = parseNegativeFloat(getColumnValue(row, "commission", "Commission"));
    const processingFee = parseNegativeFloat(getColumnValue(row, "processing_fee", "Processing Fee"));
    const deliveryCommission = parseNegativeFloat(getColumnValue(row, "delivery_commission", "Delivery Commission"));
    const merchantFundedPromotion = parseNegativeFloat(getColumnValue(row, "merchant_funded_promotion", "Merchant Funded Promotion"));
    const totalPayout = parseNegativeFloat(getColumnValue(row, "merchant_net_total", "Merchant Net Total", "total_payout"));
    
    transactions.push({
      clientId: CAPRIOTTIS_CLIENT_ID,
      locationId,
      orderId: transactionId,
      orderDate: transactionDate,
      transactionType: getColumnValue(row, "transaction_type", "Transaction Type") || "Prepaid Order",
      transactionId,
      restaurant: storeName,
      orderChannel: getColumnValue(row, "order_channel", "Order Channel") || null,
      fulfillmentType: getColumnValue(row, "fulfillment_type", "Fulfillment Type") || null,
      subtotal,
      subtotalSalesTax: tax,
      saleAmount: subtotal + tax,
      commission,
      processingFee,
      deliveryCommission,
      merchantFundedPromotion,
      merchantNetTotal: totalPayout,
      transactionNote: getColumnValue(row, "transaction_note", "Transaction Note") || null,
      customerType: getColumnValue(row, "gh_plus_customer", "GH Plus Customer", "customer_type") || "non GH+",
    });
  }
  
  console.log(`Grubhub: Processing ${transactions.length} transactions`);
  
  await storage.createGrubhubTransactionsBatch(transactions);
  console.log('✓ Grubhub upload complete');
}

async function main() {
  console.log('=== Uploading Week 9/8 Data ===\n');
  
  try {
    await uploadUberEats();
    console.log('');
    await uploadGrubhub();
    console.log('\n✅ Week 9/8 upload complete!');
  } catch (error: any) {
    console.error('Upload failed:', error.message);
    throw error;
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(1));
