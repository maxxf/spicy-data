import { db } from "../server/db";
import { locations, locationWeeklyFinancials, doordashTransactions, grubhubTransactions, uberEatsTransactions } from "../shared/schema";
import { eq, sql, and } from "drizzle-orm";
import { calculateDoorDashMetrics, isUberEatsDateInRange } from "../server/db-storage";

// Generate location weekly financials from transaction data
async function generateWeeklyFinancials() {
  const weekStart = "2025-10-06";
  const weekEnd = "2025-10-12";
  const clientId = "83506705-b408-4f0a-a9b0-e5b585db3b7d"; // Capriotti's

  console.log(`\nGenerating weekly financials for ${weekStart} to ${weekEnd}...\n`);

  // Get all locations for this client
  const allLocations = await db
    .select()
    .from(locations)
    .where(eq(locations.clientId, clientId));

  console.log(`Found ${allLocations.length} locations`);

  // Get all transactions for the week
  const [uberTxns, doorTxns, grubTxns] = await Promise.all([
    db.select().from(uberEatsTransactions).where(eq(uberEatsTransactions.clientId, clientId)),
    db.select().from(doordashTransactions).where(
      and(
        eq(doordashTransactions.clientId, clientId),
        sql`${doordashTransactions.transactionDate} >= ${weekStart}`,
        sql`${doordashTransactions.transactionDate} <= ${weekEnd}`
      )
    ),
    db.select().from(grubhubTransactions).where(
      and(
        eq(grubhubTransactions.clientId, clientId),
        sql`${grubhubTransactions.orderDate} >= ${weekStart}`,
        sql`${grubhubTransactions.orderDate} <= ${weekEnd}`
      )
    ),
  ]);

  console.log(`Transactions: UberEats=${uberTxns.length}, DoorDash=${doorTxns.length}, Grubhub=${grubTxns.length}`);

  // Delete existing records for this week
  await db.delete(locationWeeklyFinancials).where(
    and(
      eq(locationWeeklyFinancials.clientId, clientId),
      eq(locationWeeklyFinancials.weekStartDate, weekStart)
    )
  );

  let recordsCreated = 0;
  let totalSales = 0;
  let totalMarketing = 0;
  let totalPayout = 0;

  for (const location of allLocations) {
    // Get transactions for this location
    const locationUber = uberTxns.filter(t => t.locationId === location.id);
    const locationDoor = doorTxns.filter(t => t.locationId === location.id);
    const locationGrub = grubTxns.filter(t => t.locationId === location.id);

    let sales = 0;
    let marketingSales = 0;
    let marketingSpend = 0;
    let payout = 0;

    // UberEats (with date filtering)
    locationUber.forEach(t => {
      // Apply date filter
      if (!isUberEatsDateInRange(t.date, weekStart, weekEnd)) {
        return;
      }
      
      sales += t.subtotal;
      payout += t.netPayout;
      if (t.marketingPromo) {
        const marketingAmt = t.marketingAmount || 0;
        marketingSpend += marketingAmt;
        marketingSales += t.subtotal;
      }
    });

    // DoorDash (using shared attribution helper)
    const ddMetrics = calculateDoorDashMetrics(locationDoor);
    sales += ddMetrics.totalSales;
    marketingSales += ddMetrics.marketingDrivenSales;
    marketingSpend += ddMetrics.adSpend + ddMetrics.offerDiscountValue;
    payout += ddMetrics.netPayout;

    // Grubhub
    locationGrub.forEach(t => {
      sales += t.saleAmount;
      payout += t.netSales;
      if (t.promotionCost && t.promotionCost > 0) {
        marketingSpend += t.promotionCost;
        marketingSales += t.saleAmount;
      }
    });

    // Only create record if location has sales
    if (sales > 0) {
      const marketingPercent = sales > 0 ? (marketingSpend / sales) * 100 : 0;
      const roas = marketingSpend > 0 ? marketingSales / marketingSpend : 0;
      const payoutPercent = sales > 0 ? (payout / sales) * 100 : 0;
      const payoutWithCogs = payout - (sales * 0.46);

      await db.insert(locationWeeklyFinancials).values({
        locationId: location.id,
        clientId: clientId,
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        sales,
        marketingSales,
        marketingSpend,
        marketingPercent,
        roas,
        payout,
        payoutPercent,
        payoutWithCogs,
      });

      recordsCreated++;
      totalSales += sales;
      totalMarketing += marketingSpend;
      totalPayout += payout;
    }
  }

  console.log(`\nCreated ${recordsCreated} location weekly financial records`);
  console.log(`Total Sales: $${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Total Marketing: $${totalMarketing.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Total Payout: $${totalPayout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`Payout %: ${totalSales > 0 ? ((totalPayout / totalSales) * 100).toFixed(2) : 0}%`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateWeeklyFinancials()
    .then(() => {
      console.log("\n✅ Weekly financials generated successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Error:", error);
      process.exit(1);
    });
}

export { generateWeeklyFinancials };
