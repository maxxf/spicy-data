import { storage } from "../server/storage";

// Helper to parse dates from different formats (MM/DD/YY or YYYY-MM-DD)
function parseDate(dateStr: string): Date {
  // Check if it's in MM/DD/YY format (Uber Eats)
  if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(dateStr)) {
    const [month, day, year] = dateStr.split('/');
    // Assume 20xx for 2-digit years
    const fullYear = `20${year}`;
    return new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  }
  // Otherwise assume ISO format (YYYY-MM-DD)
  return new Date(dateStr);
}

// Helper to get Monday of the week containing a date
function getWeekStart(dateStr: string): string {
  const date = parseDate(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Helper to get Sunday of the week containing a date
function getWeekEnd(weekStart: string): string {
  const date = new Date(weekStart);
  date.setDate(date.getDate() + 6);
  return date.toISOString().split('T')[0];
}

async function main() {
  console.log("Generating weekly financials from transaction data...\n");

  const clients = await storage.getAllClients();
  const capriottis = clients.find(c => c.name === "Capriotti's");
  if (!capriottis) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }
  const clientId = capriottis.id;

  // Get all locations
  const locations = await storage.getLocationsByClient(clientId);
  console.log(`Processing ${locations.length} locations...\n`);

  // Get all transactions
  const [uberTxns, doorTxns, grubTxns] = await Promise.all([
    storage.getUberEatsTransactionsByClient(clientId),
    storage.getDoordashTransactionsByClient(clientId),
    storage.getGrubhubTransactionsByClient(clientId),
  ]);

  console.log(`Found ${uberTxns.length} Uber Eats, ${doorTxns.length} DoorDash, ${grubTxns.length} Grubhub transactions\n`);

  // Group transactions by location and week
  const weeklyData = new Map<string, Map<string, {
    sales: number;
    marketingSales: number;
    marketingSpend: number;
    payout: number;
  }>>();

  // Process Uber Eats transactions
  for (const txn of uberTxns) {
    if (!txn.locationId || !txn.date || txn.date.trim() === '') continue;
    
    const weekStart = getWeekStart(txn.date);
    const key = `${txn.locationId}|${weekStart}`;
    
    if (!weeklyData.has(txn.locationId)) {
      weeklyData.set(txn.locationId, new Map());
    }
    const locationWeeks = weeklyData.get(txn.locationId)!;
    
    if (!locationWeeks.has(weekStart)) {
      locationWeeks.set(weekStart, {
        sales: 0,
        marketingSales: 0,
        marketingSpend: 0,
        payout: 0,
      });
    }
    
    const week = locationWeeks.get(weekStart)!;
    week.sales += txn.subtotal;
    week.payout += txn.netPayout;
    
    if (txn.marketingPromo) {
      week.marketingSales += txn.subtotal;
      week.marketingSpend += txn.marketingAmount;
    }
  }

  // Process DoorDash transactions
  for (const txn of doorTxns) {
    if (!txn.locationId || !txn.transactionDate || txn.transactionDate.trim() === '') continue;
    
    const weekStart = getWeekStart(txn.transactionDate);
    
    if (!weeklyData.has(txn.locationId)) {
      weeklyData.set(txn.locationId, new Map());
    }
    const locationWeeks = weeklyData.get(txn.locationId)!;
    
    if (!locationWeeks.has(weekStart)) {
      locationWeeks.set(weekStart, {
        sales: 0,
        marketingSales: 0,
        marketingSpend: 0,
        payout: 0,
      });
    }
    
    const week = locationWeeks.get(weekStart)!;
    week.sales += txn.orderSubtotal;
    week.payout += txn.netPayment;
    
    if (txn.marketingSpend > 0) {
      week.marketingSales += txn.orderSubtotal;
      week.marketingSpend += txn.marketingSpend;
    }
  }

  // Process Grubhub transactions
  for (const txn of grubTxns) {
    if (!txn.locationId || !txn.orderDate || txn.orderDate.trim() === '') continue;
    
    const weekStart = getWeekStart(txn.orderDate);
    
    if (!weeklyData.has(txn.locationId)) {
      weeklyData.set(txn.locationId, new Map());
    }
    const locationWeeks = weeklyData.get(txn.locationId)!;
    
    if (!locationWeeks.has(weekStart)) {
      locationWeeks.set(weekStart, {
        sales: 0,
        marketingSales: 0,
        marketingSpend: 0,
        payout: 0,
      });
    }
    
    const week = locationWeeks.get(weekStart)!;
    week.sales += txn.saleAmount;
    week.payout += txn.netSales;
    
    if (txn.promotionCost > 0) {
      week.marketingSales += txn.saleAmount;
      week.marketingSpend += txn.promotionCost;
    }
  }

  // Clear existing weekly financials for this client (to make it idempotent)
  console.log("Clearing existing weekly financials...");
  const deletedCount = await storage.deleteLocationWeeklyFinancialsByClient(clientId);
  console.log(`Deleted ${deletedCount} existing records\n`);

  // Insert weekly financials
  let insertCount = 0;
  for (const [locationId, weeks] of weeklyData) {
    for (const [weekStart, data] of weeks) {
      const weekEnd = getWeekEnd(weekStart);
      const organicSales = data.sales - data.marketingSales;
      const marketingPercent = data.sales > 0 ? (data.marketingSpend / data.sales) * 100 : 0;
      const roas = data.marketingSpend > 0 ? data.marketingSales / data.marketingSpend : 0;
      const payoutPercent = data.sales > 0 ? (data.payout / data.sales) * 100 : 0;
      const payoutWithCogs = data.payout - (data.sales * 0.46); // Subtract 46% COGS

      await storage.createLocationWeeklyFinancial({
        locationId,
        clientId,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        sales: data.sales,
        marketingSales: data.marketingSales,
        marketingSpend: data.marketingSpend,
        marketingPercent,
        roas,
        payout: data.payout,
        payoutPercent,
        payoutWithCogs,
      });
      
      insertCount++;
    }
  }

  console.log(`✓ Generated ${insertCount} weekly financial records\n`);

  // Summary
  const totalSales = Array.from(weeklyData.values())
    .flatMap(weeks => Array.from(weeks.values()))
    .reduce((sum, week) => sum + week.sales, 0);
  const totalMarketingSpend = Array.from(weeklyData.values())
    .flatMap(weeks => Array.from(weeks.values()))
    .reduce((sum, week) => sum + week.marketingSpend, 0);

  console.log("=== Summary ===");
  console.log(`Total Sales: $${totalSales.toFixed(2)}`);
  console.log(`Total Marketing Spend: $${totalMarketingSpend.toFixed(2)}`);
  console.log(`Unique Location-Week Combinations: ${insertCount}`);
  
  console.log("\n✓ Weekly financials generation complete!");
  process.exit(0);
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
