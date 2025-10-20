import { storage } from "../server/storage";

const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

async function verifyImport() {
  console.log("Verifying imported data for week 9/29...\n");

  // Count transactions
  const uberTxns = await storage.getUberEatsTransactionsByClient(CAPRIOTTIS_ID);
  const doorTxns = await storage.getDoordashTransactionsByClient(CAPRIOTTIS_ID);
  const grubTxns = await storage.getGrubhubTransactionsByClient(CAPRIOTTIS_ID);

  console.log("Transaction Counts:");
  console.log(`  UberEats: ${uberTxns.length}`);
  console.log(`  DoorDash: ${doorTxns.length}`);
  console.log(`  Grubhub: ${grubTxns.length}`);
  console.log(`  Total: ${uberTxns.length + doorTxns.length + grubTxns.length}\n`);

  // Calculate sales for week 9/29 (2025-09-29 to 2025-10-05)
  const weekStart = "2025-09-29";
  const weekEnd = "2025-10-05";

  // UberEats uses M/D/YY format
  const uberWeek = uberTxns.filter(t => {
    const dateStr = t.date;
    // Convert M/D/YY to YYYY-MM-DD for comparison
    const parts = dateStr.split('/');
    if (parts.length !== 3) return false;
    const year = '20' + parts[2];
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;
    return isoDate >= weekStart && isoDate <= weekEnd;
  });

  // DoorDash uses YYYY-MM-DD format
  const doorWeek = doorTxns.filter(t => {
    const dateStr = t.transactionDate || '';
    return dateStr >= weekStart && dateStr <= weekEnd;
  });

  // Grubhub uses YYYY-MM-DD format
  const grubWeek = grubTxns.filter(t => {
    const dateStr = t.orderDate || '';
    return dateStr >= weekStart && dateStr <= weekEnd;
  });

  console.log("Week 9/29 (2025-09-29 to 2025-10-05) Transactions:");
  console.log(`  UberEats: ${uberWeek.length}`);
  console.log(`  DoorDash: ${doorWeek.length}`);
  console.log(`  Grubhub: ${grubWeek.length}`);
  console.log(`  Total: ${uberWeek.length + doorWeek.length + grubWeek.length}\n`);

  // Calculate total sales
  const uberSales = uberWeek.reduce((sum, t) => sum + (t.subtotal || 0), 0);
  const doorSales = doorWeek.reduce((sum, t) => sum + (t.salesExclTax || 0), 0);
  const grubSales = grubWeek.reduce((sum, t) => sum + (t.subtotal || 0), 0);

  console.log("Week 9/29 Sales (excl. tax):");
  console.log(`  UberEats: $${uberSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  DoorDash: $${doorSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Grubhub: $${grubSales.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Total: $${(uberSales + doorSales + grubSales).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);

  // Calculate marketing spend for week
  const uberMarketing = uberWeek.reduce((sum, t) => sum + (t.marketingAmount || 0), 0);
  const doorMarketing = doorWeek.reduce((sum, t) => sum + (t.marketingSpend || 0), 0);
  const grubMarketing = grubWeek.reduce((sum, t) => sum + (t.merchantFundedPromotion || 0), 0);

  console.log("Week 9/29 Marketing Spend:");
  console.log(`  UberEats: $${uberMarketing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  DoorDash: $${doorMarketing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Grubhub: $${grubMarketing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  console.log(`  Total: $${(uberMarketing + doorMarketing + grubMarketing).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`);

  console.log("✅ Import verification complete!");
}

verifyImport().catch(console.error);
