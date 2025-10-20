import { db } from "../server/db";
import {
  uberEatsTransactions,
  doordashTransactions,
  grubhubTransactions,
  clients,
} from "../shared/schema";
import { eq, and, sql, gte, lte } from "drizzle-orm";

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║  PLATFORM METRICS DEFINITIONS & DEBUGGING REPORT                  ║");
  console.log("║  Week 10/6-10/12, 2025                                            ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝\n");

  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }

  // ==================== UBER EATS ====================
  console.log("┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ UBER EATS                                                           │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");
  
  console.log("\n📋 DEFINITIONS:");
  console.log("  • Completed Order: Order Status = 'Completed'");
  console.log("  • Sales: Sum of subtotal (includes tax)");
  console.log("  • Marketing Order: Has marketingPromo field populated");
  console.log("  • Marketing Spend: Sum of marketingAmount (absolute value)");
  console.log("  • Marketing-Driven Sales: Sales from orders with marketingPromo");
  
  const uberAll = await db.select().from(uberEatsTransactions)
    .where(and(
      eq(uberEatsTransactions.clientId, client.id),
      sql`date IN ('10/6/25', '10/7/25', '10/8/25', '10/9/25', '10/10/25', '10/11/25', '10/12/25')`
    ));
  
  const uberCompleted = uberAll.filter(t => t.orderStatus === "Completed");
  const uberOtherStatuses = uberAll.filter(t => t.orderStatus !== "Completed");
  
  console.log("\n📊 CURRENT DATA:");
  console.log(`  Total Rows: ${uberAll.length}`);
  console.log(`  ├─ Completed: ${uberCompleted.length}`);
  console.log(`  └─ Other: ${uberOtherStatuses.length} (${uberOtherStatuses.map(t => t.orderStatus).filter((v,i,a)=>a.indexOf(v)===i).join(', ')})`);
  
  const uberSales = uberCompleted.reduce((sum, t) => sum + t.subtotal, 0);
  const uberWithMarketing = uberCompleted.filter(t => t.marketingPromo);
  const uberMarketingSpend = uberCompleted.reduce((sum, t) => sum + t.marketingAmount, 0);
  const uberMarketingDrivenSales = uberWithMarketing.reduce((sum, t) => sum + t.subtotal, 0);
  
  console.log(`\n  Sales (Completed): $${uberSales.toFixed(2)}`);
  console.log(`  Orders with Marketing: ${uberWithMarketing.length} / ${uberCompleted.length} (${(uberWithMarketing.length/uberCompleted.length*100).toFixed(1)}%)`);
  console.log(`  Marketing Spend: $${uberMarketingSpend.toFixed(2)}`);
  console.log(`  Marketing-Driven Sales: $${uberMarketingDrivenSales.toFixed(2)}`);
  console.log(`  ROAS: ${uberMarketingSpend > 0 ? (uberMarketingDrivenSales/uberMarketingSpend).toFixed(2) : 'N/A'}x`);

  // ==================== DOORDASH ====================
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ DOORDASH                                                            │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");
  
  console.log("\n📋 DEFINITIONS:");
  console.log("  • Completed Order: channel='Marketplace' AND status IN ('Delivered','Picked Up')");
  console.log("  • Sales: Sum of orderSubtotal (excl tax)");
  console.log("  • Ad Spend: Sum of otherPayments (when > 0)");
  console.log("  • Offer Discounts: Sum of |offersOnItems| + |deliveryOfferRedemptions| + |marketingCredits| + |thirdPartyContribution|");
  console.log("  • Marketing Order: ANY of the above offer fields != 0");
  console.log("  • Marketing-Driven Sales: Sales from marketing orders");
  
  const doorAll = await db.select().from(doordashTransactions)
    .where(and(
      eq(doordashTransactions.clientId, client.id),
      gte(doordashTransactions.transactionDate, "2025-10-06"),
      lte(doordashTransactions.transactionDate, "2025-10-12")
    ));
  
  const doorMarketplace = doorAll.filter(t => !t.channel || t.channel === "Marketplace");
  const doorStorefront = doorAll.filter(t => t.channel === "Storefront");
  const doorCompleted = doorMarketplace.filter(t => !t.orderStatus || t.orderStatus === "Delivered" || t.orderStatus === "Picked Up");
  const doorOther = doorMarketplace.filter(t => t.orderStatus && t.orderStatus !== "Delivered" && t.orderStatus !== "Picked Up");
  
  console.log("\n📊 CURRENT DATA:");
  console.log(`  Total Rows: ${doorAll.length}`);
  console.log(`  ├─ Marketplace: ${doorMarketplace.length}`);
  console.log(`  │  ├─ Completed: ${doorCompleted.length}`);
  console.log(`  │  └─ Other: ${doorOther.length}`);
  console.log(`  └─ Storefront: ${doorStorefront.length} (EXCLUDED)`);
  
  const doorSales = doorCompleted.reduce((sum, t) => sum + (t.orderSubtotal || 0), 0);
  const doorAdSpend = doorCompleted.filter(t => (t.otherPayments || 0) > 0).reduce((sum, t) => sum + (t.otherPayments || 0), 0);
  const doorWithOffers = doorCompleted.filter(t => {
    const hasOffers = Math.abs(t.offersOnItems || 0) + 
                     Math.abs(t.deliveryOfferRedemptions || 0) + 
                     Math.abs(t.marketingCredits || 0) + 
                     Math.abs(t.thirdPartyContribution || 0) > 0;
    return hasOffers;
  });
  const doorOfferValue = doorCompleted.reduce((sum, t) => 
    sum + Math.abs(t.offersOnItems || 0) + 
          Math.abs(t.deliveryOfferRedemptions || 0) + 
          Math.abs(t.marketingCredits || 0) + 
          Math.abs(t.thirdPartyContribution || 0), 0);
  const doorMarketingDrivenSales = doorWithOffers.reduce((sum, t) => sum + (t.orderSubtotal || 0), 0);
  const doorTotalMarketing = doorAdSpend + doorOfferValue;
  
  console.log(`\n  Sales (Marketplace Completed): $${doorSales.toFixed(2)}`);
  console.log(`  Orders with Offers: ${doorWithOffers.length} / ${doorCompleted.length} (${(doorWithOffers.length/doorCompleted.length*100).toFixed(1)}%)`);
  console.log(`  Ad Spend: $${doorAdSpend.toFixed(2)}`);
  console.log(`  Offer Discounts: $${doorOfferValue.toFixed(2)}`);
  console.log(`  Total Marketing: $${doorTotalMarketing.toFixed(2)}`);
  console.log(`  Marketing-Driven Sales: $${doorMarketingDrivenSales.toFixed(2)}`);
  console.log(`  ROAS: ${doorTotalMarketing > 0 ? (doorMarketingDrivenSales/doorTotalMarketing).toFixed(2) : 'N/A'}x`);

  // ==================== GRUBHUB ====================
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ GRUBHUB                                                             │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");
  
  console.log("\n📋 DEFINITIONS:");
  console.log("  • Completed Order: transactionType = 'Prepaid Order' (or NULL)");
  console.log("  • Sales: Sum of (subtotal + subtotalSalesTax) for Prepaid Orders only");
  console.log("  • Net Payout: Sum of merchantNetTotal for ALL transaction types");
  console.log("  • Marketing Spend: |merchantFundedPromotion| (stored as NEGATIVE)");
  console.log("  • Marketing Order: merchantFundedPromotion != 0");
  console.log("  • Marketing-Driven Sales: Sales from orders with promos");
  
  const grubAll = await db.select().from(grubhubTransactions)
    .where(and(
      eq(grubhubTransactions.clientId, client.id),
      gte(grubhubTransactions.orderDate, "2025-10-06"),
      lte(grubhubTransactions.orderDate, "2025-10-12")
    ));
  
  const grubPrepaid = grubAll.filter(t => !t.transactionType || t.transactionType === "Prepaid Order");
  const grubAdjustments = grubAll.filter(t => t.transactionType && t.transactionType !== "Prepaid Order");
  
  console.log("\n📊 CURRENT DATA:");
  console.log(`  Total Rows: ${grubAll.length}`);
  console.log(`  ├─ Prepaid Order: ${grubPrepaid.length}`);
  console.log(`  └─ Adjustments: ${grubAdjustments.length} (${grubAdjustments.map(t => t.transactionType).filter((v,i,a)=>a.indexOf(v)===i).join(', ')})`);
  
  const grubSales = grubPrepaid.reduce((sum, t) => sum + (t.subtotal + t.subtotalSalesTax), 0);
  const grubWithPromos = grubPrepaid.filter(t => (t.merchantFundedPromotion || 0) !== 0);
  const grubPromoSpend = grubPrepaid.reduce((sum, t) => sum + Math.abs(t.merchantFundedPromotion || 0), 0);
  const grubMarketingDrivenSales = grubWithPromos.reduce((sum, t) => sum + (t.subtotal + t.subtotalSalesTax), 0);
  const grubNetPayout = grubAll.reduce((sum, t) => sum + (t.merchantNetTotal || 0), 0);
  
  console.log(`\n  Sales (Prepaid Only): $${grubSales.toFixed(2)}`);
  console.log(`  Orders with Promos: ${grubWithPromos.length} / ${grubPrepaid.length} (${(grubWithPromos.length/grubPrepaid.length*100).toFixed(1)}%)`);
  console.log(`  Marketing Spend: $${grubPromoSpend.toFixed(2)}`);
  console.log(`  Marketing-Driven Sales: $${grubMarketingDrivenSales.toFixed(2)}`);
  console.log(`  ROAS: ${grubPromoSpend > 0 ? (grubMarketingDrivenSales/grubPromoSpend).toFixed(2) : 'N/A'}x`);
  console.log(`  Net Payout (All Types): $${grubNetPayout.toFixed(2)}`);
  console.log(`  Net Payout %: ${(grubNetPayout/grubSales*100).toFixed(2)}%`);

  // ==================== SUMMARY ====================
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ COMBINED SUMMARY                                                    │");
  console.log("└─────────────────────────────────────────────────────────────────────┘\n");
  
  const totalOrders = uberCompleted.length + doorCompleted.length + grubPrepaid.length;
  const totalSales = uberSales + doorSales + grubSales;
  const totalMarketing = uberMarketingSpend + doorTotalMarketing + grubPromoSpend;
  const totalMarketingDrivenSales = uberMarketingDrivenSales + doorMarketingDrivenSales + grubMarketingDrivenSales;
  const totalNetPayout = uberCompleted.reduce((sum, t) => sum + t.netPayout, 0) + 
                         doorCompleted.reduce((sum, t) => sum + (t.totalPayout || 0), 0) + 
                         grubNetPayout;
  
  console.log(`  Total Orders: ${totalOrders.toLocaleString()}`);
  console.log(`  Total Sales: $${totalSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`  Total Marketing: $${totalMarketing.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`  Marketing-Driven Sales: $${totalMarketingDrivenSales.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`  Blended ROAS: ${totalMarketing > 0 ? (totalMarketingDrivenSales/totalMarketing).toFixed(2) : 'N/A'}x`);
  console.log(`  Total Net Payout: $${totalNetPayout.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  console.log(`  Net Payout %: ${(totalNetPayout/totalSales*100).toFixed(2)}%`);
  
  console.log("\n✅ Report Complete!\n");
  
  process.exit(0);
}

main().catch((error) => {
  console.error("Report failed:", error);
  process.exit(1);
});
