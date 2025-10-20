import { storage } from "../server/storage";

const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

async function checkDates() {
  const grubTransactions = await storage.getGrubhubTransactionsByClient(CAPRIOTTIS_ID);
  
  // Get unique dates
  const dates = new Set<string>();
  for (const t of grubTransactions) {
    const dateStr = typeof t.orderDate === 'string' 
      ? t.orderDate.split('T')[0]
      : t.orderDate instanceof Date && !isNaN(t.orderDate.getTime())
      ? t.orderDate.toISOString().split('T')[0]
      : 'invalid';
    dates.add(dateStr);
  }
  
  console.log("Grubhub transaction dates:");
  const sortedDates = Array.from(dates).sort();
  sortedDates.forEach(date => {
    const count = grubTransactions.filter(t => {
      const dateStr = typeof t.orderDate === 'string' 
        ? t.orderDate.split('T')[0]
        : t.orderDate instanceof Date && !isNaN(t.orderDate.getTime())
        ? t.orderDate.toISOString().split('T')[0]
        : 'invalid';
      return dateStr === date;
    }).length;
    console.log(`  ${date}: ${count} transactions`);
  });
}

checkDates().catch(console.error);
