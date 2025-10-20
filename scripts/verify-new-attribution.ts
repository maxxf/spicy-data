import { db } from "../server/db";
import { 
  uberEatsTransactions, 
  doordashTransactions,
  grubhubTransactions,
  clients 
} from "../shared/schema";
import { eq } from "drizzle-orm";
import { calculateUberEatsMetrics, calculateDoorDashMetrics } from "../server/db-storage";

async function main() {
  console.log("🔍 Verifying New Attribution Methodology for Week 10/6-10/12\n");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }

  // Fetch transactions for week 10/6-10/12
  const uberTxns = await db.select().from(uberEatsTransactions)
    .where(eq(uberEatsTransactions.clientId, client.id));
  
  const doorTxns = await db.select().from(doordashTransactions)
    .where(eq(doordashTransactions.clientId, client.id));
  
  const grubTxns = await db.select().from(grubhubTransactions)
    .where(eq(grubhubTransactions.clientId, client.id));

  // Filter UberEats by date
  const validDates = ["10/6/25", "10/7/25", "10/8/25", "10/9/25", "10/10/25", "10/11/25", "10/12/25"];
  const weekUberTxns = uberTxns.filter(t => validDates.includes(t.date));

  console.log("📊 UBEREATS ANALYSIS");
  console.log("=".repeat(60));
  
  // Analyze UberEats data
  const ueMetrics = calculateUberEatsMetrics(weekUberTxns);
  console.log(`Total Transactions (all statuses): ${weekUberTxns.length}`);
  console.log(`Completed Orders Only: ${ueMetrics.totalOrders}`);
  console.log(`Sales (excl. tax): $${ueMetrics.totalSales.toFixed(2)}`);
  console.log(`Ad Spend (Other payments with description): $${ueMetrics.adSpend.toFixed(2)}`);
  console.log(`Offer Discounts: $${ueMetrics.offerDiscountValue.toFixed(2)}`);
  console.log(`Marketing-Driven Sales: $${ueMetrics.marketingDrivenSales.toFixed(2)}`);
  console.log(`Orders from Marketing: ${ueMetrics.ordersFromMarketing}`);
  console.log(`Net Payout (all statuses): $${ueMetrics.netPayout.toFixed(2)}`);
  console.log(`Net Payout %: ${((ueMetrics.netPayout / ueMetrics.totalSales) * 100).toFixed(2)}%`);
  console.log(`ROAS: ${((ueMetrics.adSpend + ueMetrics.offerDiscountValue) > 0 ? ueMetrics.marketingDrivenSales / (ueMetrics.adSpend + ueMetrics.offerDiscountValue) : 0).toFixed(2)}x`);

  // Sample breakdown
  const completedOrders = weekUberTxns.filter(t => t.orderStatus === "Completed");
  const withOffers = completedOrders.filter(t => t.offersOnItems < 0 || t.deliveryOfferRedemptions < 0);
  const withOtherPayments = completedOrders.filter(t => t.otherPaymentsDescription);
  
  console.log(`\n🔍 Breakdown:`);
  console.log(`  Orders with Offers (< 0): ${withOffers.length}`);
  console.log(`  Orders with Other Payments: ${withOtherPayments.length}`);
  console.log(`  Sample Other Payment Descriptions: ${[...new Set(withOtherPayments.map(t => t.otherPaymentsDescription).filter(Boolean))].slice(0, 5).join(", ")}`);

  console.log("\n" + "=".repeat(60));
  console.log("📊 DOORDASH ANALYSIS");
  console.log("=".repeat(60));
  
  // Filter DoorDash by date
  const weekDoorTxns = doorTxns.filter(t => 
    t.transactionDate >= "2025-10-06" && t.transactionDate <= "2025-10-12"
  );

  const ddMetrics = calculateDoorDashMetrics(weekDoorTxns);
  console.log(`Total Transactions: ${weekDoorTxns.length}`);
  console.log(`Marketplace + Completed: ${ddMetrics.totalOrders}`);
  console.log(`Sales (excl. tax): $${ddMetrics.totalSales.toFixed(2)}`);
  console.log(`Ad Spend: $${ddMetrics.adSpend.toFixed(2)}`);
  console.log(`Offer Discounts: $${ddMetrics.offerDiscountValue.toFixed(2)}`);
  console.log(`Marketing-Driven Sales: $${ddMetrics.marketingDrivenSales.toFixed(2)}`);
  console.log(`Orders from Marketing: ${ddMetrics.ordersFromMarketing}`);
  console.log(`Net Payout: $${ddMetrics.netPayout.toFixed(2)}`);
  console.log(`Net Payout %: ${((ddMetrics.netPayout / ddMetrics.totalSales) * 100).toFixed(2)}%`);
  console.log(`ROAS: ${((ddMetrics.adSpend + ddMetrics.offerDiscountValue) > 0 ? ddMetrics.marketingDrivenSales / (ddMetrics.adSpend + ddMetrics.offerDiscountValue) : 0).toFixed(2)}x`);

  // Status breakdown
  const marketplaceOrders = weekDoorTxns.filter(t => !t.channel || t.channel === "Marketplace");
  const completedMarketplace = marketplaceOrders.filter(t => t.orderStatus === "Completed");
  console.log(`\n🔍 Breakdown:`);
  console.log(`  Marketplace Orders (all statuses): ${marketplaceOrders.length}`);
  console.log(`  Marketplace + Completed: ${completedMarketplace.length}`);
  console.log(`  Order Statuses: ${[...new Set(weekDoorTxns.map(t => t.orderStatus))].join(", ")}`);

  console.log("\n" + "=".repeat(60));
  console.log("📊 GRUBHUB ANALYSIS");
  console.log("=".repeat(60));
  
  // Filter Grubhub by date
  const weekGrubTxns = grubTxns.filter(t => 
    t.orderDate >= "2025-10-06" && t.orderDate <= "2025-10-12"
  );

  const prepaidOrders = weekGrubTxns.filter(t => t.transactionType === "Prepaid Order");
  const totalSales = prepaidOrders.reduce((sum, t) => sum + t.saleAmount, 0);
  const totalPromo = prepaidOrders.reduce((sum, t) => sum + Math.abs(t.merchantFundedPromotion || 0), 0);
  const ordersWithPromo = prepaidOrders.filter(t => (t.merchantFundedPromotion || 0) !== 0).length;
  const marketingSales = prepaidOrders.filter(t => (t.merchantFundedPromotion || 0) !== 0).reduce((sum, t) => sum + t.saleAmount, 0);
  const netPayout = weekGrubTxns.reduce((sum, t) => sum + (t.merchantNetTotal || 0), 0);

  console.log(`Total Transactions: ${weekGrubTxns.length}`);
  console.log(`Prepaid Orders Only: ${prepaidOrders.length}`);
  console.log(`Sales: $${totalSales.toFixed(2)}`);
  console.log(`Promo Discounts: $${totalPromo.toFixed(2)}`);
  console.log(`Marketing-Driven Sales: $${marketingSales.toFixed(2)}`);
  console.log(`Orders from Marketing: ${ordersWithPromo}`);
  console.log(`Net Payout (all types): $${netPayout.toFixed(2)}`);
  console.log(`Net Payout %: ${((netPayout / totalSales) * 100).toFixed(2)}%`);
  console.log(`ROAS: ${(totalPromo > 0 ? marketingSales / totalPromo : 0).toFixed(2)}x`);

  console.log(`\n🔍 Breakdown:`);
  console.log(`  Transaction Types: ${[...new Set(weekGrubTxns.map(t => t.transactionType || "NULL"))].join(", ")}`);

  console.log("\n✅ Verification complete!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
