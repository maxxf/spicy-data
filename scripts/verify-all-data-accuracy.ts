import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { db } from "../server/db";
import { uberEatsTransactions, doordashTransactions, grubhubTransactions } from "../shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

interface WeekData {
  week: string;
  startDate: string;
  endDate: string;
  files: {
    ubereats: string;
    doordash: string;
    grubhub: string;
  };
}

const weeks: WeekData[] = [
  {
    week: "9/15",
    startDate: "2025-09-15",
    endDate: "2025-09-21",
    files: {
      ubereats: "attached_assets/de1f7aa7-43c3-406d-a907-6e3628a23684-united_states_1760939066315.csv",
      doordash: "attached_assets/financials_detailed_transactions_summarized_us_2025-09-15_2025-09-21_1ZdEK_2025-10-20T05-42-41Z_1760939066315.csv",
      grubhub: "attached_assets/caps_-_9_15_1760939066315.csv"
    }
  },
  {
    week: "9/29",
    startDate: "2025-09-29",
    endDate: "2025-10-05",
    files: {
      ubereats: "attached_assets/aa8b1212-5eb3-4c31-82bf-61118961e3c9-united_states_1760938287485.csv",
      doordash: "attached_assets/financials_simplified_transactions_us_2025-09-29_2025-10-05_5Gbw1_2025-10-19T18-21-21Z 2_1760937747501.csv",
      grubhub: "attached_assets/caps_9_29_1760938287486.csv"
    }
  }
];

function parseFloatSafe(val: any): number {
  if (!val || val === "") return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

async function verifyUberEats(weekData: WeekData) {
  console.log(`\n📊 Verifying UberEats for week ${weekData.week}...`);
  
  // Read CSV
  const csv = readFileSync(weekData.files.ubereats, "utf-8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  
  // Calculate CSV totals (only valid order rows with Order ID)
  let csvCount = 0;
  let csvSales = 0;
  let csvMarketing = 0;
  let csvPayout = 0;
  
  for (const row of rows) {
    const orderId = row["Order ID"] || row["\ufeffOrder ID"] || "";
    if (!orderId || orderId.trim() === "") continue;
    
    csvCount++;
    csvSales += parseFloatSafe(row["Sales (excl. tax)"]);
    
    const offersOnItems = Math.abs(parseFloatSafe(row["Offers on items (incl. tax)"]));
    const deliveryOfferRedemptions = Math.abs(parseFloatSafe(row["Delivery Offer Redemptions (incl. tax)"]));
    const marketingAdjustment = parseFloatSafe(row["Marketing Adjustment"]);
    const otherPayments = Math.abs(parseFloatSafe(row["Other payments"]));
    csvMarketing += offersOnItems + deliveryOfferRedemptions + Math.abs(marketingAdjustment) + otherPayments;
    
    csvPayout += parseFloatSafe(row["Total payout"]);
  }
  
  // Query database - UberEats uses M/D/YY format, need to convert to dates for proper comparison
  // across month boundaries
  const dbResults = await db.select({
    count: sql<number>`count(*)::int`,
    sales: sql<number>`sum(subtotal)::float`,
    marketing: sql<number>`sum(marketing_amount)::float`,
    payout: sql<number>`sum(net_payout)::float`,
  }).from(uberEatsTransactions)
    .where(and(
      eq(uberEatsTransactions.clientId, CAPRIOTTIS_ID),
      sql`TO_DATE(date, 'MM/DD/YY') >= TO_DATE(${weekData.startDate}, 'YYYY-MM-DD')`,
      sql`TO_DATE(date, 'MM/DD/YY') <= TO_DATE(${weekData.endDate}, 'YYYY-MM-DD')`
    ));
  
  const dbData = dbResults[0];
  
  console.log(`  CSV:      ${csvCount} transactions, $${csvSales.toFixed(2)} sales, $${csvMarketing.toFixed(2)} marketing, $${csvPayout.toFixed(2)} payout`);
  console.log(`  Database: ${dbData.count} transactions, $${(dbData.sales || 0).toFixed(2)} sales, $${(dbData.marketing || 0).toFixed(2)} marketing, $${(dbData.payout || 0).toFixed(2)} payout`);
  
  const countMatch = csvCount === dbData.count;
  const salesMatch = Math.abs(csvSales - (dbData.sales || 0)) < 0.01;
  const marketingMatch = Math.abs(csvMarketing - (dbData.marketing || 0)) < 0.01;
  const payoutMatch = Math.abs(csvPayout - (dbData.payout || 0)) < 0.01;
  
  if (countMatch && salesMatch && marketingMatch && payoutMatch) {
    console.log(`  ✅ MATCH - All metrics match!`);
    return true;
  } else {
    console.log(`  ❌ MISMATCH:`);
    if (!countMatch) console.log(`     Count: CSV=${csvCount}, DB=${dbData.count}, Diff=${csvCount - dbData.count}`);
    if (!salesMatch) console.log(`     Sales: CSV=$${csvSales.toFixed(2)}, DB=$${(dbData.sales || 0).toFixed(2)}, Diff=$${(csvSales - (dbData.sales || 0)).toFixed(2)}`);
    if (!marketingMatch) console.log(`     Marketing: CSV=$${csvMarketing.toFixed(2)}, DB=$${(dbData.marketing || 0).toFixed(2)}, Diff=$${(csvMarketing - (dbData.marketing || 0)).toFixed(2)}`);
    if (!payoutMatch) console.log(`     Payout: CSV=$${csvPayout.toFixed(2)}, DB=$${(dbData.payout || 0).toFixed(2)}, Diff=$${(csvPayout - (dbData.payout || 0)).toFixed(2)}`);
    return false;
  }
}

async function verifyDoorDash(weekData: WeekData) {
  console.log(`\n📊 Verifying DoorDash for week ${weekData.week}...`);
  
  // Read CSV
  const csv = readFileSync(weekData.files.doordash, "utf-8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  
  // Determine if this is summary or detailed format
  // Detailed format has "DoorDash transaction ID" or "Timestamp local time"
  // Summary format has "Merchant Store ID" but NOT "DoorDash transaction ID"
  const isDetailed = rows[0] && ("DoorDash transaction ID" in rows[0] || "Timestamp local time" in rows[0]);
  const isSummary = !isDetailed;
  
  let csvCount = 0;
  let csvSales = 0;
  let csvMarketing = 0;
  let csvPayout = 0;
  
  if (isSummary) {
    console.log(`  Format: Summary (by store)`);
    for (const row of rows) {
      const storeName = row["Store Name"] || "";
      if (!storeName) continue;
      
      csvCount++; // One summary row per store
      csvSales += parseFloatSafe(row["Subtotal"]);
      
      const marketingFees = Math.abs(parseFloatSafe(row["Marketing Fees | (Including any applicable taxes)"]));
      csvMarketing += marketingFees;
      
      csvPayout += parseFloatSafe(row["Estimated Payout"]);
    }
  } else {
    console.log(`  Format: Detailed (transaction-level)`);
    
    // Check if this is the "simplified" format (has "Transaction type" instead of "Order status")
    const hasOrderStatus = rows[0] && "Order status" in rows[0];
    
    for (const row of rows) {
      const channel = row["Channel"] || "";
      const transactionType = row["Transaction type"] || "";
      
      // For simplified format: count all Marketplace "Order" transactions
      // For full detailed format: only count Delivered/Picked Up
      let shouldCount = false;
      if (hasOrderStatus) {
        const orderStatus = row["Order status"] || "";
        shouldCount = channel === "Marketplace" && (orderStatus === "Delivered" || orderStatus === "Picked Up");
      } else {
        // Simplified format: count all Marketplace orders (not adjustments/refunds)
        shouldCount = channel === "Marketplace" && transactionType === "Order";
      }
      
      if (shouldCount) {
        csvCount++;
        csvSales += parseFloatSafe(row["Subtotal"]);
        
        const marketingFees = Math.abs(parseFloatSafe(row["Marketing fees | (for historical reference only)"]));
        csvMarketing += marketingFees;
        
        // Payout from Net total
        csvPayout += parseFloatSafe(row["Net total"]);
      }
    }
  }
  
  // Query database
  const dbResults = await db.select({
    count: sql<number>`count(*)::int`,
    sales: sql<number>`sum(sales_excl_tax)::float`,
    marketing: sql<number>`sum(marketing_spend)::float`,
    payout: sql<number>`sum(total_payout)::float`,
  }).from(doordashTransactions)
    .where(and(
      eq(doordashTransactions.clientId, CAPRIOTTIS_ID),
      gte(doordashTransactions.transactionDate, weekData.startDate),
      lte(doordashTransactions.transactionDate, weekData.endDate)
    ));
  
  const dbData = dbResults[0];
  
  console.log(`  CSV:      ${csvCount} records, $${csvSales.toFixed(2)} sales, $${csvMarketing.toFixed(2)} marketing, $${csvPayout.toFixed(2)} payout`);
  console.log(`  Database: ${dbData.count} records, $${(dbData.sales || 0).toFixed(2)} sales, $${(dbData.marketing || 0).toFixed(2)} marketing, $${(dbData.payout || 0).toFixed(2)} payout`);
  
  const countMatch = csvCount === dbData.count;
  const salesMatch = Math.abs(csvSales - (dbData.sales || 0)) < 0.01;
  const marketingMatch = Math.abs(csvMarketing - (dbData.marketing || 0)) < 0.01;
  const payoutMatch = Math.abs(csvPayout - (dbData.payout || 0)) < 0.01;
  
  if (countMatch && salesMatch && marketingMatch && payoutMatch) {
    console.log(`  ✅ MATCH - All metrics match!`);
    return true;
  } else {
    console.log(`  ❌ MISMATCH:`);
    if (!countMatch) console.log(`     Count: CSV=${csvCount}, DB=${dbData.count}, Diff=${csvCount - dbData.count}`);
    if (!salesMatch) console.log(`     Sales: CSV=$${csvSales.toFixed(2)}, DB=$${(dbData.sales || 0).toFixed(2)}, Diff=$${(csvSales - (dbData.sales || 0)).toFixed(2)}`);
    if (!marketingMatch) console.log(`     Marketing: CSV=$${csvMarketing.toFixed(2)}, DB=$${(dbData.marketing || 0).toFixed(2)}, Diff=$${(csvMarketing - (dbData.marketing || 0)).toFixed(2)}`);
    if (!payoutMatch) console.log(`     Payout: CSV=$${csvPayout.toFixed(2)}, DB=$${(dbData.payout || 0).toFixed(2)}, Diff=$${(csvPayout - (dbData.payout || 0)).toFixed(2)}`);
    return false;
  }
}

async function verifyGrubhub(weekData: WeekData) {
  console.log(`\n📊 Verifying Grubhub for week ${weekData.week}...`);
  
  // Read CSV
  const csv = readFileSync(weekData.files.grubhub, "utf-8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  
  // Calculate CSV totals (only Prepaid Orders for sales)
  let csvSalesCount = 0;
  let csvSales = 0;
  let csvMarketing = 0;
  let csvPayout = 0;
  
  for (const row of rows) {
    const transactionType = row.transaction_type || "";
    const subtotal = parseFloatSafe(row.subtotal);
    const tax = parseFloatSafe(row.subtotal_sales_tax);
    
    // Sales: only Prepaid Orders
    if (transactionType === "Prepaid Order") {
      csvSalesCount++;
      csvSales += subtotal + tax;
      csvMarketing += Math.abs(parseFloatSafe(row.merchant_funded_promotion));
    }
    
    // Payout: all transaction types
    csvPayout += parseFloatSafe(row.merchant_net_total);
  }
  
  // Query database - sales only from Prepaid Orders
  const salesResults = await db.select({
    count: sql<number>`count(*)::int`,
    sales: sql<number>`sum(sale_amount)::float`,
    marketing: sql<number>`sum(merchant_funded_promotion)::float`,
  }).from(grubhubTransactions)
    .where(and(
      eq(grubhubTransactions.clientId, CAPRIOTTIS_ID),
      gte(grubhubTransactions.orderDate, weekData.startDate),
      lte(grubhubTransactions.orderDate, weekData.endDate),
      eq(grubhubTransactions.transactionType, "Prepaid Order")
    ));
  
  // Query database - payout from all transactions
  const payoutResults = await db.select({
    payout: sql<number>`sum(merchant_net_total)::float`,
  }).from(grubhubTransactions)
    .where(and(
      eq(grubhubTransactions.clientId, CAPRIOTTIS_ID),
      gte(grubhubTransactions.orderDate, weekData.startDate),
      lte(grubhubTransactions.orderDate, weekData.endDate)
    ));
  
  const dbSales = salesResults[0];
  const dbPayout = payoutResults[0];
  
  console.log(`  CSV:      ${csvSalesCount} prepaid orders, $${csvSales.toFixed(2)} sales, $${csvMarketing.toFixed(2)} marketing, $${csvPayout.toFixed(2)} payout (all types)`);
  console.log(`  Database: ${dbSales.count} prepaid orders, $${(dbSales.sales || 0).toFixed(2)} sales, $${(dbSales.marketing || 0).toFixed(2)} marketing, $${(dbPayout.payout || 0).toFixed(2)} payout (all types)`);
  
  const countMatch = csvSalesCount === dbSales.count;
  const salesMatch = Math.abs(csvSales - (dbSales.sales || 0)) < 0.01;
  const marketingMatch = Math.abs(csvMarketing - (dbSales.marketing || 0)) < 0.01;
  const payoutMatch = Math.abs(csvPayout - (dbPayout.payout || 0)) < 0.01;
  
  if (countMatch && salesMatch && marketingMatch && payoutMatch) {
    console.log(`  ✅ MATCH - All metrics match!`);
    return true;
  } else {
    console.log(`  ❌ MISMATCH:`);
    if (!countMatch) console.log(`     Count: CSV=${csvSalesCount}, DB=${dbSales.count}, Diff=${csvSalesCount - dbSales.count}`);
    if (!salesMatch) console.log(`     Sales: CSV=$${csvSales.toFixed(2)}, DB=$${(dbSales.sales || 0).toFixed(2)}, Diff=$${(csvSales - (dbSales.sales || 0)).toFixed(2)}`);
    if (!marketingMatch) console.log(`     Marketing: CSV=$${csvMarketing.toFixed(2)}, DB=$${(dbSales.marketing || 0).toFixed(2)}, Diff=$${(csvMarketing - (dbSales.marketing || 0)).toFixed(2)}`);
    if (!payoutMatch) console.log(`     Payout: CSV=$${csvPayout.toFixed(2)}, DB=$${(dbPayout.payout || 0).toFixed(2)}, Diff=$${(csvPayout - (dbPayout.payout || 0)).toFixed(2)}`);
    return false;
  }
}

async function main() {
  console.log("🔍 Verifying data accuracy across all weeks and platforms...\n");
  console.log("=" .repeat(80));
  
  let allPassed = true;
  
  for (const weekData of weeks) {
    console.log(`\n\n📅 WEEK ${weekData.week} (${weekData.startDate} to ${weekData.endDate})`);
    console.log("=" .repeat(80));
    
    const uberMatch = await verifyUberEats(weekData);
    const doorMatch = await verifyDoorDash(weekData);
    const grubMatch = await verifyGrubhub(weekData);
    
    if (!uberMatch || !doorMatch || !grubMatch) {
      allPassed = false;
    }
  }
  
  console.log("\n\n" + "=" .repeat(80));
  if (allPassed) {
    console.log("✅ ALL DATA VERIFIED - Everything matches!");
  } else {
    console.log("❌ DISCREPANCIES FOUND - Review the mismatches above");
  }
  console.log("=" .repeat(80));
  
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
