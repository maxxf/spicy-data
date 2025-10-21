import fs from 'fs';
import {parse} from 'csv-parse/sync';
import { DbStorage } from './server/db-storage';
import type {InsertUberEatsTransaction, InsertDoordashTransaction, InsertGrubhubTransaction} from './shared/schema';

const storage = new DbStorage();
const clientId = '83506705-b408-4f0a-a9b0-e5b585db3b7d'; //  Capriotti's

function parseCSV(buffer: Buffer, platform?: string): any[] {
  // Strip UTF-8 BOM if present
  if (buffer.length >= 3 && buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) {
    buffer = buffer.subarray(3);
  }
  
  // Auto-detect Uber Eats header row
  if (platform === "ubereats") {
    const firstLineParse = parse(buffer, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      to_line: 2,
    });
    
    const firstRow = firstLineParse[0];
    const isDescriptionRow = firstRow && firstRow.length > 0 && 
      /\b(as per|whether it|either|mode of|platform from which)\b/i.test(String(firstRow[0]));
    
    return parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      from_line: isDescriptionRow ? 2 : 1,
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

function getColumnValue(row: any, ...possibleNames: string[]): string {
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return row[name];
    }
  }
  return '';
}

async function uploadUberEats() {
  console.log('Uploading Uber Eats data...');
  const fileBuffer = fs.readFileSync('attached_assets/305f864c-ba6b-4e69-be00-f8482f56ea5b-united_states_1761019117059.csv');
  const rows = parseCSV(fileBuffer, 'ubereats');
  
  console.log(`Parsed ${rows.length} rows`);
  
  // Build transactions array
  const transactions: InsertUberEatsTransaction[] = [];
  
  for (const row of rows) {
    const workflowId = getColumnValue(row, "Workflow ID", "Workflow_ID", "workflow_id");
    if (!workflowId || workflowId.trim() === "") continue;
    
    const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id");
    if (!orderId || orderId.trim() === "") continue;
    
    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    const salesExclTax = parseFloat(getColumnValue(row, "Sales (excl. tax)", "Sales_excl_tax", "sales_excl_tax")) || 0;
    const tax = parseFloat(getColumnValue(row, "Tax on Sales", "Tax", "Tax_on_Sales", "tax_on_sales")) || 0;
    
    transactions.push({
      clientId,
      locationId: null, // Will be matched by backend
      orderId,
      workflowId,
      orderStatus: getColumnValue(row, "Order Status", "Order_Status", "order_status") || null,
      date: getColumnValue(row, "Order Date", "Date", "Order_Date", "order_date"),
      time: getColumnValue(row, "Order Accept Time", "Time", "Order_Accept_Time", "order_accept_time"),
      location: locationName,
      salesExclTax,
      subtotal: parseFloat(getColumnValue(row, "Sales (incl. tax)", "Sales_incl_tax", "sales_incl_tax")) || 0,
      tax,
      deliveryFee: parseFloat(getColumnValue(row, "Delivery Fee", "delivery_fee")) || 0,
      serviceFee: parseFloat(getColumnValue(row, "Service Fee", "service_fee")) || 0,
      platformFee: parseFloat(getColumnValue(row, "Platform Fee", "platform_fee")) || 0,
      offersOnItems: parseFloat(getColumnValue(row, "Offers on items (incl. tax)", "offers_on_items")) || 0,
      deliveryOfferRedemptions: parseFloat(getColumnValue(row, "Delivery Offer Redemptions (incl. tax)", "delivery_offer_redemptions")) || 0,
      marketingPromo: getColumnValue(row, "Marketing promo", "marketing_promo"),
      marketingAmount: parseFloat(getColumnValue(row, "Marketing Amount", "marketing_amount")) || 0,
      otherPayments: parseFloat(getColumnValue(row, "Other payments", "other_payments")) || 0,
      otherPaymentsDescription: getColumnValue(row, "Other payments description", "other_payments_description") || null,
      netPayout: parseFloat(getColumnValue(row, "Total payout", "Net Payout", "net_payout")) || 0,
      customerRating: parseInt(getColumnValue(row, "Customer rating", "customer_rating")) || null,
    });
  }
  
  // Deduplicate by workflowId
  const seen = new Set<string>();
  const deduplicatedTransactions = transactions.filter(t => {
    if (seen.has(t.workflowId)) return false;
    seen.add(t.workflowId);
    return true;
  });
  
  console.log(`Inserting ${deduplicatedTransactions.length} unique transactions in batches...`);
  
  // Insert in batches of 500 to avoid connection timeouts
  const batchSize = 500;
  for (let i = 0; i < deduplicatedTransactions.length; i += batchSize) {
    const batch = deduplicatedTransactions.slice(i, i + batchSize);
    console.log(`Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(deduplicatedTransactions.length/batchSize)} (${batch.length} transactions)...`);
    await storage.createUberEatsTransactionsBatch(batch);
  }
  
  console.log('✅ Uber Eats upload complete!');
}

async function uploadGrubhub() {
  console.log('Uploading Grubhub data...');
  const fileBuffer = fs.readFileSync('attached_assets/caps_-_10_13_1761019117060.csv');
  const rows = parseCSV(fileBuffer, 'grubhub');
  
  console.log(`Parsed ${rows.length} rows`);
  
  const transactions: InsertGrubhubTransaction[] = [];
  
  for (const row of rows) {
    const orderNumber = getColumnValue(row, "order_number", "Order_Id", "order number", "order_id");
    const transactionId = getColumnValue(row, "transaction_id", "Transaction_Id", "transaction id");
    if (!orderNumber || orderNumber.trim() === "" || !transactionId || transactionId.trim() === "") continue;
    
    const locationName = getColumnValue(row, "store_name", "Restaurant", "Store_Name", "store name");
    
    // Parse financial fields
    const subtotal = parseFloat(getColumnValue(row, "subtotal", "Subtotal")) || 0;
    const subtotalSalesTax = parseFloat(getColumnValue(row, "subtotal_sales_tax", "Subtotal Sales Tax")) || 0;
    const saleAmount = subtotal + subtotalSalesTax; // Calculate total sale amount (matches routes.ts logic)
    
    transactions.push({
      clientId,
      locationId: null, // Will be matched by backend
      orderId: orderNumber,
      orderDate: getColumnValue(row, "transaction_date", "Transaction Date", "transaction_date"),
      transactionType: getColumnValue(row, "transaction_type", "Transaction Type", "transaction_type"),
      transactionId,
      restaurant: locationName,
      orderChannel: getColumnValue(row, "order_channel", "Order Channel", "order_channel") || null,
      fulfillmentType: getColumnValue(row, "fulfillment_type", "Fulfillment Type", "fulfillment_type") || null,
      subtotal,
      subtotalSalesTax,
      saleAmount,
      commission: parseFloat(getColumnValue(row, "commission", "Commission")) || 0,
      deliveryCommission: parseFloat(getColumnValue(row, "delivery_commission", "Delivery Commission")) || 0,
      processingFee: parseFloat(getColumnValue(row, "processing_fee", "Processing Fee")) || 0,
      merchantFundedPromotion: parseFloat(getColumnValue(row, "merchant_funded_promotion", "Merchant Funded Promotion")) || 0,
      merchantNetTotal: parseFloat(getColumnValue(row, "merchant_net_total", "Merchant Net Total")) || 0,
      transactionNote: getColumnValue(row, "transaction_note", "Transaction Note") || null,
      customerType: getColumnValue(row, "customer_type", "Customer Type") || 'non GH+',
    });
  }
  
  console.log(`Inserting ${transactions.length} transactions in batches...`);
  
  // Insert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    console.log(`Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(transactions.length/batchSize)} (${batch.length} transactions)...`);
    await storage.createGrubhubTransactionsBatch(batch);
  }
  
  console.log('✅ Grubhub upload complete!');
}

async function uploadDoorDash() {
  console.log('Uploading DoorDash data...');
  const fileBuffer = fs.readFileSync('attached_assets/financials_simplified_transactions_us_2025-10-13_2025-10-19_dCiqE_2025-10-21T03-57-54Z_1761019117061.csv');
  const rows = parseCSV(fileBuffer, 'doordash');
  
  console.log(`Parsed ${rows.length} rows`);
  
  const parseNegativeFloat = (val: any) => {
    if (!val) return 0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };
  
  const transactions: InsertDoordashTransaction[] = [];
  
  for (const row of rows) {
    const transactionId = getColumnValue(row, "DoorDash transaction ID", "Transaction ID", "Transaction_ID", "transaction_id");
    if (!transactionId || transactionId.trim() === "") continue;
    
    const orderNumber = getColumnValue(row, "DoorDash order ID", "Order Number", "Order_Number", "order_number");
    if (!orderNumber || orderNumber.trim() === "") continue;
    
    const locationName = getColumnValue(row, "Store name", "Store Name", "Store_Name", "store_name");
    const subtotal = parseNegativeFloat(getColumnValue(row, "Subtotal", "Order Subtotal", "Order_Subtotal", "order_subtotal"));
    const taxes = parseNegativeFloat(getColumnValue(row, "Subtotal tax passed to merchant", "Subtotal Tax Passed by DoorDash to Merchant", "Taxes", "taxes"));
    const commission = parseNegativeFloat(getColumnValue(row, "Commission", "commission"));
    const totalTips = parseNegativeFloat(getColumnValue(row, "Total Tips", "total_tips"));
    const errorCharge = parseNegativeFloat(getColumnValue(row, "Error charges", "Error Charges", "error_charges"));
    const paymentProcessingFee = parseNegativeFloat(getColumnValue(row, "Payment processing fee", "Payment Processing Fee", "payment_processing_fee"));
    const deliveryOrderFee = parseNegativeFloat(getColumnValue(row, "Delivery order fee", "Delivery Order Fee", "delivery_order_fee"));
    const pickupOrderFee = parseNegativeFloat(getColumnValue(row, "Pickup order fee", "Pickup Order Fee", "pickup_order_fee"));
    
    const calculatedNetPayout = subtotal + taxes + totalTips - commission - paymentProcessingFee - deliveryOrderFee - pickupOrderFee + errorCharge;
    
    transactions.push({
      clientId,
      locationId: null,
      transactionId,
      orderNumber,
      transactionDate: getColumnValue(row, "Timestamp local time", "Timestamp local date", "Transaction Date", "Transaction_Date", "transaction_date"),
      storeLocation: locationName,
      channel: getColumnValue(row, "Channel", "channel") || null,
      orderStatus: getColumnValue(row, "Final order status", "Order Status", "Order_Status", "order_status") || null,
      transactionType: getColumnValue(row, "Transaction type", "Transaction Type", "Transaction_Type", "transaction_type")?.trim() || null,
      salesExclTax: subtotal,
      orderSubtotal: subtotal,
      taxes,
      deliveryFees: 0,
      commission,
      errorCharges: errorCharge,
      offersOnItems: parseNegativeFloat(getColumnValue(row, "Merchant offers", "Offers on items", "offers_on_items")),
      deliveryOfferRedemptions: parseNegativeFloat(getColumnValue(row, "Delivery offer redemptions", "delivery_offer_redemptions")),
      marketingCredits: parseNegativeFloat(getColumnValue(row, "Marketing credits", "marketing_credits")),
      thirdPartyContribution: parseNegativeFloat(getColumnValue(row, "Third-party contribution", "third_party_contribution")),
      otherPayments: 0,
      otherPaymentsDescription: null,
      marketingSpend: 0,
      totalPayout: calculatedNetPayout,
      netPayment: calculatedNetPayout,
      orderSource: null,
    });
  }
  
  // Deduplicate by transactionId
  const seen = new Set<string>();
  const deduplicatedTransactions = transactions.filter(t => {
    if (seen.has(t.transactionId)) return false;
    seen.add(t.transactionId);
    return true;
  });
  
  console.log(`Inserting ${deduplicatedTransactions.length} unique transactions in batches...`);
  
  // Insert in batches of 500
  const batchSize = 500;
  for (let i = 0; i < deduplicatedTransactions.length; i += batchSize) {
    const batch = deduplicatedTransactions.slice(i, i + batchSize);
    console.log(`Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(deduplicatedTransactions.length/batchSize)} (${batch.length} transactions)...`);
    await storage.createDoordashTransactionsBatch(batch);
  }
  
  console.log('✅ DoorDash upload complete!');
}

async function main() {
  try {
    // Only re-upload Grubhub with corrected sale_amount calculation
    // await uploadUberEats();
    await uploadGrubhub();
    // await uploadDoorDash();
    console.log('\n🎉 Grubhub re-upload complete!');
    process.exit(0);
  } catch (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
}

main();
