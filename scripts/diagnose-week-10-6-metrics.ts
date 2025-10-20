import { db } from "../server/db";
import {
  uberEatsTransactions,
  doordashTransactions,
  grubhubTransactions,
  clients,
} from "../shared/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";
import { calculateDoorDashMetrics } from "../server/db-storage";

async function main() {
  console.log("Diagnosing Week 10/6-10/12 Metrics...\n");

  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }

  // Get UberEats data
  console.log("=== UBER EATS ===");
  const uberTxns = await db.select().from(uberEatsTransactions)
    .where(and(
      eq(uberEatsTransactions.clientId, client.id),
      sql`date IN ('10/6/25', '10/7/25', '10/8/25', '10/9/25', '10/10/25', '10/11/25', '10/12/25')`
    ));
  
  const uberOrders = uberTxns.length;
  const uberSales = uberTxns.reduce((sum, t) => sum + t.subtotal, 0);
  const uberMarketingDrivenSales = uberTxns
    .filter(t => t.marketingPromo)
    .reduce((sum, t) => sum + t.subtotal, 0);
  const uberMarketingSpend = uberTxns.reduce((sum, t) => sum + t.marketingAmount, 0);
  const uberOrdersWithMarketing = uberTxns.filter(t => t.marketingPromo).length;
  const uberRoas = uberMarketingSpend > 0 ? uberMarketingDrivenSales / uberMarketingSpend : 0;
  
  console.log(`Orders: ${uberOrders}`);
  console.log(`Sales: $${uberSales.toFixed(2)}`);
  console.log(`Marketing-Driven Sales: $${uberMarketingDrivenSales.toFixed(2)}`);
  console.log(`Marketing Spend: $${uberMarketingSpend.toFixed(2)}`);
  console.log(`Orders with Marketing: ${uberOrdersWithMarketing}`);
  console.log(`ROAS: ${uberRoas.toFixed(2)}x`);
  
  // Get DoorDash data
  console.log("\n=== DOORDASH ===");
  const doorTxns = await db.select().from(doordashTransactions)
    .where(and(
      eq(doordashTransactions.clientId, client.id),
      gte(doordashTransactions.transactionDate, "2025-10-06"),
      lte(doordashTransactions.transactionDate, "2025-10-12"),
      eq(doordashTransactions.channel, "Marketplace"),
      sql`order_status IN ('Delivered', 'Picked Up')`
    ));
  
  const ddMetrics = calculateDoorDashMetrics(doorTxns);
  const ddTotalMarketing = ddMetrics.adSpend + ddMetrics.offerDiscountValue;
  const ddRoas = ddTotalMarketing > 0 ? ddMetrics.marketingDrivenSales / ddTotalMarketing : 0;
  
  console.log(`Orders: ${ddMetrics.totalOrders}`);
  console.log(`Sales: $${ddMetrics.totalSales.toFixed(2)}`);
  console.log(`Marketing-Driven Sales: $${ddMetrics.marketingDrivenSales.toFixed(2)}`);
  console.log(`Ad Spend: $${ddMetrics.adSpend.toFixed(2)}`);
  console.log(`Offer Discounts: $${ddMetrics.offerDiscountValue.toFixed(2)}`);
  console.log(`Total Marketing: $${ddTotalMarketing.toFixed(2)}`);
  console.log(`Orders with Marketing: ${ddMetrics.ordersFromMarketing}`);
  console.log(`ROAS: ${ddRoas.toFixed(2)}x`);
  
  // Get Grubhub data
  console.log("\n=== GRUBHUB ===");
  const grubTxns = await db.select().from(grubhubTransactions)
    .where(and(
      eq(grubhubTransactions.clientId, client.id),
      gte(grubhubTransactions.orderDate, "2025-10-06"),
      lte(grubhubTransactions.orderDate, "2025-10-12")
    ));
  
  const grubPrepaidOnly = grubTxns.filter(t => !t.transactionType || t.transactionType === "Prepaid Order");
  const grubOrders = grubPrepaidOnly.length;
  const grubSales = grubPrepaidOnly.reduce((sum, t) => sum + (t.subtotal + t.subtotalSalesTax), 0);
  const grubPromos = grubTxns.reduce((sum, t) => sum + Math.abs(t.merchantFundedPromotion || 0), 0);
  const grubOrdersWithPromos = grubPrepaidOnly.filter(t => (t.merchantFundedPromotion || 0) !== 0).length;
  const grubMarketingDrivenSales = grubPrepaidOnly
    .filter(t => (t.merchantFundedPromotion || 0) !== 0)
    .reduce((sum, t) => sum + (t.subtotal + t.subtotalSalesTax), 0);
  const grubRoas = grubPromos > 0 ? grubMarketingDrivenSales / grubPromos : 0;
  
  console.log(`Total Transactions: ${grubTxns.length}`);
  console.log(`Prepaid Orders: ${grubOrders}`);
  console.log(`Sales (Prepaid): $${grubSales.toFixed(2)}`);
  console.log(`Marketing-Driven Sales: $${grubMarketingDrivenSales.toFixed(2)}`);
  console.log(`Promos (absolute): $${grubPromos.toFixed(2)}`);
  console.log(`Orders with Promos: ${grubOrdersWithPromos}`);
  console.log(`ROAS: ${grubRoas.toFixed(2)}x`);
  
  process.exit(0);
}

main().catch((error) => {
  console.error("Diagnostic failed:", error);
  process.exit(1);
});
