import { storage } from "./storage";
import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

// Helper to normalize column names for flexible CSV parsing
function normalizeColumnName(name: string): string {
  return name.toLowerCase().replace(/[\s\-\_\|]/g, '').replace(/[()]/g, '');
}

function getColumnValue(row: any, ...possibleNames: string[]): string {
  // First try exact matches
  for (const name of possibleNames) {
    if (row[name] !== undefined && row[name] !== null) {
      return row[name];
    }
  }
  
  // Then try normalized matches
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

// Normalize location name for matching
function normalizeLocationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .replace(/[,._]/g, '') // Remove punctuation (except dashes for now)
    .replace(/\b(inc|llc|corp|corporation|co)\b/g, '') // Remove corporate suffixes
    .replace(/\bof\b/g, '') // Remove "of"
    .replace(/\b(street|road|avenue|boulevard|highway|drive|lane|parkway)\b/g, '') // Remove full street type words only
    .trim();
}

function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeLocationName(str1);
  const s2 = normalizeLocationName(str2);

  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = (s1: string, s2: string): number => {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  const distance = editDistance(shorter, longer);
  return (longer.length - distance) / longer.length;
}

async function findOrCreateLocation(
  clientId: string,
  locationName: string,
  platform: "ubereats" | "doordash" | "grubhub",
  storeId?: string
): Promise<string> {
  const UNMAPPED_BUCKET_ID = "f534a2cf-12f6-4052-9d3e-d885211183ee";
  const allLocations = await storage.getLocationsByClient(clientId);
  
  if (platform === "ubereats") {
    // Extract store code from format "Capriotti's Sandwich Shop (STORECODE)"
    const storeCodeMatch = locationName.match(/\(([^)]+)\)/);
    const storeCode = storeCodeMatch ? storeCodeMatch[1].trim() : locationName.trim();
    
    // Try to match by extracted store code first
    const match = allLocations.find(loc => 
      loc.uberEatsStoreLabel && loc.uberEatsStoreLabel.trim().toLowerCase() === storeCode.toLowerCase()
    );
    if (match) return match.id;
    
    // Fallback: try full location name match (in case format is different)
    const fullMatch = allLocations.find(loc => 
      loc.uberEatsStoreLabel && loc.uberEatsStoreLabel.trim().toLowerCase() === locationName.trim().toLowerCase()
    );
    if (fullMatch) return fullMatch.id;
    
    console.log(`Warning: No Uber Eats location found for "${locationName}" (extracted code: "${storeCode}") - assigning to Unmapped Locations`);
    return UNMAPPED_BUCKET_ID;
  }
  
  if (platform === "doordash") {
    // 1. Try exact match on Store ID (primary key)
    if (storeId) {
      const exactMatch = allLocations.find(loc => 
        loc.doorDashStoreKey && loc.doorDashStoreKey.trim() === storeId.trim()
      );
      if (exactMatch) return exactMatch.id;
    }
    
    // 2. Try exact normalized match on doordashName
    const normalizedInput = normalizeLocationName(locationName);
    const exactNameMatch = allLocations.find(loc => {
      if (!loc.doordashName) return false;
      return normalizeLocationName(loc.doordashName) === normalizedInput;
    });
    if (exactNameMatch) return exactNameMatch.id;
    
    // 3. Try exact normalized match on canonicalName
    const canonicalMatch = allLocations.find(loc => {
      if (!loc.canonicalName) return false;
      return normalizeLocationName(loc.canonicalName) === normalizedInput;
    });
    if (canonicalMatch) return canonicalMatch.id;
    
    // 4. Try fuzzy match as fallback (conservative threshold)
    const fuzzyMatch = allLocations.find(loc => {
      if (!loc.doordashName && !loc.canonicalName) return false;
      const nameToCheck = loc.doordashName || loc.canonicalName;
      const similarity = calculateStringSimilarity(nameToCheck, locationName);
      return similarity >= 0.90;
    });
    if (fuzzyMatch) return fuzzyMatch.id;
    
    console.log(`Warning: No DoorDash location found for "${locationName}" (Store ID: ${storeId || 'N/A'}) - assigning to Unmapped Locations`);
    return UNMAPPED_BUCKET_ID;
  }
  
  return UNMAPPED_BUCKET_ID;
}

async function uploadUberEats(filePath: string, clientId: string) {
  console.log(`\n📤 Uploading Uber Eats file: ${filePath}`);
  const buffer = readFileSync(filePath);
  const rows = parseCSV(buffer, "ubereats");
  
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Set<string>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    if (locationName && locationName.trim() !== "") {
      uniqueLocations.add(locationName);
    }
  }
  
  for (const locationName of Array.from(uniqueLocations)) {
    const locationId = await findOrCreateLocation(clientId, locationName, "ubereats");
    locationMap.set(locationName, locationId);
  }
  
  const transactions: any[] = [];
  
  for (const row of rows) {
    const workflowId = getColumnValue(row, "Workflow ID", "Workflow_ID", "workflow_id");
    if (!workflowId || workflowId.trim() === "") continue;

    const orderId = getColumnValue(row, "Order ID", "Order_ID", "order_id");
    if (!orderId || orderId.trim() === "") continue;

    const locationName = getColumnValue(row, "Store Name", "Location", "Store_Name", "store_name");
    const locationId = locationMap.get(locationName) || null;

    const salesExclTax = parseFloat(getColumnValue(row, "Sales (excl. tax)", "Sales_excl_tax", "sales_excl_tax")) || 0;
    const tax = parseFloat(getColumnValue(row, "Tax on Sales", "Tax", "Tax_on_Sales", "tax_on_sales")) || 0;

    transactions.push({
      clientId,
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
      marketingPromo: getColumnValue(row, "Marketing Promotion", "Marketing_Promo", "marketing_promotion") || null,
      marketingAmount: parseFloat(getColumnValue(row, "Marketing Adjustment", "Marketing_Amount", "marketing_adjustment")) || 0,
      otherPayments: parseFloat(getColumnValue(row, "Other payments", "Other_payments", "other_payments")) || 0,
      otherPaymentsDescription: getColumnValue(row, "Other payments description", "Other_payments_description", "other_payments_description") || null,
      netPayout: parseFloat(getColumnValue(row, "Total payout ", "Total payout", "Net_Payout", "net_payout")) || 0,
      customerRating: null,
    });
  }
  
  const uniqueTransactions = new Map<string, any>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.workflowId, txn);
  }
  
  const deduplicatedTransactions = Array.from(uniqueTransactions.values());
  console.log(`  ✓ Processed ${rows.length} rows → ${deduplicatedTransactions.length} unique transactions`);
  
  await storage.createUberEatsTransactionsBatch(deduplicatedTransactions);
  console.log(`  ✓ Uploaded ${deduplicatedTransactions.length} Uber Eats transactions`);
  
  return deduplicatedTransactions.length;
}

async function uploadDoorDash(filePath: string, clientId: string) {
  console.log(`\n📤 Uploading DoorDash file: ${filePath}`);
  const buffer = readFileSync(filePath);
  const rows = parseCSV(buffer);
  
  const parseNegativeFloat = (val: any) => {
    if (!val) return 0;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Map by Store ID (preferred) or locationName as fallback
  // Key format: storeId if available, otherwise "name::{locationName}"
  const locationMap = new Map<string, string>();
  const uniqueLocations = new Map<string, { locationName: string; storeId?: string }>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "Store name", "Store_name", "location");
    const storeId = getColumnValue(row, "Store ID", "Store_ID", "store_id", "Merchant Store ID");
    if (locationName && locationName.trim() !== "") {
      const key = storeId && storeId.trim() !== "" ? storeId : `name::${locationName}`;
      uniqueLocations.set(key, { locationName, storeId: storeId || undefined });
    }
  }
  
  for (const [key, { locationName, storeId }] of Array.from(uniqueLocations.entries())) {
    const locationId = await findOrCreateLocation(clientId, locationName, "doordash", storeId);
    locationMap.set(key, locationId);
  }
  
  const transactions: any[] = [];
  
  // Debug: Log first row column names
  if (rows.length > 0) {
    console.log("  [DEBUG] First row columns:", Object.keys(rows[0]).slice(0, 10));
  }
  
  for (const row of rows) {
    const transactionId = getColumnValue(row, "DoorDash transaction ID", "Transaction_ID", "transaction_id");
    if (!transactionId || transactionId.trim() === "") continue;

    const orderId = getColumnValue(row, "DoorDash order ID", "Order_ID", "order_id");
    // Skip rows without order ID (required field in database)
    if (!orderId || orderId.trim() === "") continue;

    const locationName = getColumnValue(row, "Store name", "Store_name", "location");
    const storeId = getColumnValue(row, "Store ID", "Store_ID", "store_id", "Merchant Store ID");
    
    // Look up location by Store ID (preferred) or name (fallback)
    const lookupKey = storeId && storeId.trim() !== "" ? storeId : `name::${locationName}`;
    const locationId = locationMap.get(lookupKey) || null;

    const subtotal = parseNegativeFloat(getColumnValue(row, "Subtotal"));
    const discounts = parseNegativeFloat(getColumnValue(row, "Discounts"));
    const taxSubtotal = parseNegativeFloat(getColumnValue(row, "Tax (subtotal)", "Tax"));
    const commission = parseNegativeFloat(getColumnValue(row, "Commission"));
    const taxCommission = parseNegativeFloat(getColumnValue(row, "Tax (commission)"));
    const merchantFees = parseNegativeFloat(getColumnValue(row, "Merchant fees"));
    const taxMerchantFees = parseNegativeFloat(getColumnValue(row, "Tax (merchant fees)"));
    const marketingFees = parseNegativeFloat(getColumnValue(row, "Marketing fees"));
    const netTotal = parseNegativeFloat(getColumnValue(row, "Net total"));

    // Marketing columns (AA-AD in DoorDash Financial Report)
    // Support multiple column name variants across different DoorDash export formats
    const otherPayments = parseNegativeFloat(getColumnValue(row, "Other payments", "Other Payments"));
    const offers = parseNegativeFloat(getColumnValue(row, "Offers", "offers"));
    const deliveryRedemptions = parseNegativeFloat(getColumnValue(row, "Delivery redemptions", "Delivery Redemptions"));
    const credits = parseNegativeFloat(getColumnValue(row, "Credits", "DoorDash marketing credit", "DoorDash Marketing Credit"));
    const thirdParty = parseNegativeFloat(getColumnValue(row, "Third-party contribution", "Third-party contributions", "Third Party Contributions", "Third-Party Contribution"));
    
    // Calculate total marketing spend as sum of all marketing components
    const totalMarketingSpend = Math.abs(otherPayments) + Math.abs(offers) + 
                               Math.abs(deliveryRedemptions) + Math.abs(credits) + 
                               Math.abs(thirdParty);

    transactions.push({
      clientId,
      locationId,
      transactionId,
      orderNumber: orderId,
      transactionDate: getColumnValue(row, "Timestamp local time", "Timestamp", "timestamp"),
      storeLocation: locationName,
      channel: getColumnValue(row, "Channel"),
      orderStatus: getColumnValue(row, "Transaction type", "Transaction_type", "transaction_type"),
      salesExclTax: subtotal,
      orderSubtotal: subtotal,
      taxes: taxSubtotal,
      deliveryFees: parseNegativeFloat(getColumnValue(row, "Customer fees")),
      commission: Math.abs(commission),
      errorCharges: parseNegativeFloat(getColumnValue(row, "Error charges")),
      offersOnItems: offers,
      deliveryOfferRedemptions: deliveryRedemptions,
      marketingCredits: credits,
      thirdPartyContribution: thirdParty,
      otherPayments: otherPayments,
      otherPaymentsDescription: getColumnValue(row, "Other payments description"),
      marketingSpend: totalMarketingSpend,
      totalPayout: netTotal,
      netPayment: netTotal,
      orderSource: getColumnValue(row, "Channel"),
    });
  }
  
  const uniqueTransactions = new Map<string, any>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.transactionId, txn);
  }
  
  const deduplicatedTransactions = Array.from(uniqueTransactions.values());
  console.log(`  ✓ Processed ${rows.length} rows → ${deduplicatedTransactions.length} unique transactions`);
  
  await storage.createDoordashTransactionsBatch(deduplicatedTransactions);
  console.log(`  ✓ Uploaded ${deduplicatedTransactions.length} DoorDash transactions`);
  
  return deduplicatedTransactions.length;
}

async function uploadGrubhub(filePath: string, clientId: string) {
  console.log(`\n📤 Uploading Grubhub file: ${filePath}`);
  const buffer = readFileSync(filePath);
  const rows = parseCSV(buffer);
  
  const allLocations = await storage.getLocationsByClient(clientId);
  const locationMap = new Map<string, { locationName: string; address?: string; storeNumber?: string }>();
  
  for (const row of rows) {
    const locationName = getColumnValue(row, "store_name");
    const address = getColumnValue(row, "street_address");
    const storeNumber = getColumnValue(row, "store_number");
    
    if (locationName && locationName.trim() !== "") {
      // Use store_number as key if available, otherwise use location name
      // This ensures each unique store gets its own mapping entry
      const key = storeNumber && storeNumber.trim() !== "" 
        ? `store:${storeNumber.trim()}`
        : `name:${locationName.trim().toLowerCase()}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, { locationName, address, storeNumber });
      }
    }
  }
  
  const resolvedLocations = new Map<string, string>();
  
  for (const [key, data] of Array.from(locationMap.entries())) {
    const { locationName, address, storeNumber } = data;
    
    // 1. Match by store_number against locations.store_id (primary method for corp locations)
    if (storeNumber && storeNumber.trim() !== "") {
      console.log(`[DEBUG] Trying to match store_number="${storeNumber}" for "${locationName}"`);
      const match = allLocations.find(loc => {
        const hasStoreId = loc.storeId && loc.storeId.trim() === storeNumber.trim();
        if (hasStoreId) {
          console.log(`[DEBUG] ✓ Matched "${storeNumber}" to location "${loc.canonicalName}" (storeId: ${loc.storeId})`);
        }
        return hasStoreId;
      });
      if (match) {
        resolvedLocations.set(key, match.id);
        continue;
      } else {
        console.log(`[DEBUG] ✗ No match found for store_number="${storeNumber}"`);
      }
    }
    
    // 2. Match by normalized address (fallback)
    if (address) {
      const normalizedAddress = address.toLowerCase().trim();
      const match = allLocations.find(loc => 
        loc.address && loc.address.toLowerCase().trim() === normalizedAddress
      );
      if (match) {
        resolvedLocations.set(key, match.id);
        continue;
      }
    }
    
    // No match found - assign to unmapped bucket
    const UNMAPPED_BUCKET_ID = "f534a2cf-12f6-4052-9d3e-d885211183ee";
    console.log(`Warning: No Grubhub location found for "${locationName}" (Address: ${address || 'N/A'}, Store#: ${storeNumber || 'N/A'}) - assigning to Unmapped Locations`);
    resolvedLocations.set(key, UNMAPPED_BUCKET_ID);
  }
  
  const transactions: any[] = [];
  
  for (const row of rows) {
    const orderNumber = getColumnValue(row, "order_number");
    if (!orderNumber || orderNumber.trim() === "") continue;

    const locationName = getColumnValue(row, "store_name");
    const storeNumber = getColumnValue(row, "store_number");
    
    // Use same key format as locationMap: store_number if available, otherwise location name
    const locationKey = storeNumber && storeNumber.trim() !== "" 
      ? `store:${storeNumber.trim()}`
      : `name:${locationName.trim().toLowerCase()}`;
    const locationId = resolvedLocations.get(locationKey) || null;

    const subtotal = parseFloat(getColumnValue(row, "subtotal")) || 0;
    const subtotalSalesTax = parseFloat(getColumnValue(row, "subtotal_sales_tax")) || 0;
    const merchantServiceFee = parseFloat(getColumnValue(row, "merchant_service_fee")) || 0;
    const ghPlusFee = parseFloat(getColumnValue(row, "grubhub_plus_fee")) || 0;
    const deliveryCharge = parseFloat(getColumnValue(row, "delivery_charge")) || 0;
    const totalRestaurantBill = parseFloat(getColumnValue(row, "total_restaurant_bill")) || 0;

    const commission = parseFloat(getColumnValue(row, "commission")) || 0;
    const deliveryCommission = parseFloat(getColumnValue(row, "delivery_commission")) || 0;
    const processingFee = parseFloat(getColumnValue(row, "processing_fee")) || 0;
    const merchantFundedPromotion = parseFloat(getColumnValue(row, "merchant_funded_promotion")) || 0;
    const merchantNetTotal = parseFloat(getColumnValue(row, "merchant_net_total")) || 0;
    const transactionId = getColumnValue(row, "transaction_id");

    transactions.push({
      clientId,
      locationId,
      orderId: orderNumber,
      orderDate: getColumnValue(row, "transaction_date"),
      transactionType: getColumnValue(row, "transaction_type"),
      transactionId: transactionId || `GH-${orderNumber}-${Date.now()}`,
      restaurant: locationName,
      orderChannel: getColumnValue(row, "order_channel"),
      fulfillmentType: getColumnValue(row, "fulfillment_type"),
      subtotal,
      subtotalSalesTax,
      saleAmount: subtotal + subtotalSalesTax,
      commission,
      deliveryCommission,
      processingFee,
      merchantFundedPromotion,
      merchantNetTotal,
      transactionNote: getColumnValue(row, "transaction_note"),
      customerType: getColumnValue(row, "gh_plus_customer"),
    });
  }
  
  const uniqueTransactions = new Map<string, any>();
  for (const txn of transactions) {
    uniqueTransactions.set(txn.transactionId, txn);
  }
  
  const deduplicatedTransactions = Array.from(uniqueTransactions.values());
  console.log(`  ✓ Processed ${rows.length} rows → ${deduplicatedTransactions.length} unique transactions`);
  
  await storage.createGrubhubTransactionsBatch(deduplicatedTransactions);
  console.log(`  ✓ Uploaded ${deduplicatedTransactions.length} Grubhub transactions`);
  
  return deduplicatedTransactions.length;
}

async function main() {
  const clientId = "83506705-b408-4f0a-a9b0-e5b585db3b7d"; // Capriotti's
  
  console.log("\n🚀 Starting data upload for week Sept 8-14, 2025...\n");
  
  try {
    const uberCount = await uploadUberEats(
      "attached_assets/8b03ddef-cfc0-4821-8219-abe7664064f9-united_states_1761099884745.csv",
      clientId
    );
    
    const doordashCount = await uploadDoorDash(
      "attached_assets/financials_simplified_transactions_us_2025-09-08_2025-09-14_Hqdxm_2025-10-21T15-58-24Z_1761099884746.csv",
      clientId
    );
    
    const grubhubCount = await uploadGrubhub(
      "attached_assets/caps_-_9_8_1761099884745.csv",
      clientId
    );
    
    console.log("\n✅ Upload complete!");
    console.log(`   • Uber Eats: ${uberCount} transactions`);
    console.log(`   • DoorDash: ${doordashCount} transactions`);
    console.log(`   • Grubhub: ${grubhubCount} transactions`);
    console.log(`   • Total: ${uberCount + doordashCount + grubhubCount} transactions\n`);
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Upload failed:", error);
    process.exit(1);
  }
}

main();
