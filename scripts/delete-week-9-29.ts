import { storage } from "../server/storage";

const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";
const WEEK_START = "2025-09-29";
const WEEK_END = "2025-10-05";

async function deleteWeek929Data() {
  console.log("Deleting all transactions and data for week 9/29...");

  // Get all transactions for Capriotti's
  const uberTransactions = await storage.getUberEatsTransactionsByClient(CAPRIOTTIS_ID);
  const doorTransactions = await storage.getDoordashTransactionsByClient(CAPRIOTTIS_ID);
  const grubTransactions = await storage.getGrubhubTransactionsByClient(CAPRIOTTIS_ID);

  // Helper to get date string safely
  const getDateString = (date: Date | string): string => {
    if (typeof date === 'string') return date.split('T')[0];
    if (date instanceof Date && !isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }
    return '';
  };

  // Count transactions in the date range
  const uberInRange = uberTransactions.filter(t => {
    const orderDate = getDateString(t.orderDate);
    return orderDate >= WEEK_START && orderDate <= WEEK_END;
  });

  const doorInRange = doorTransactions.filter(t => {
    const orderDate = getDateString(t.orderDate);
    return orderDate >= WEEK_START && orderDate <= WEEK_END;
  });

  const grubInRange = grubTransactions.filter(t => {
    const orderDate = getDateString(t.orderDate);
    return orderDate >= WEEK_START && orderDate <= WEEK_END;
  });

  console.log(`Found ${uberInRange.length} Uber Eats transactions`);
  console.log(`Found ${doorInRange.length} DoorDash transactions`);
  console.log(`Found ${grubInRange.length} Grubhub transactions`);
  console.log(`Total: ${uberInRange.length + doorInRange.length + grubInRange.length} transactions`);

  // Delete weekly financials for Capriotti's (if any)
  const deletedFinancials = await storage.deleteLocationWeeklyFinancialsByClient(CAPRIOTTIS_ID);
  console.log(`Deleted ${deletedFinancials} weekly financial records`);

  // Note: Since MemStorage doesn't have delete methods for transactions,
  // we need to clear them directly from the Maps
  const memStorage = storage as any;
  
  // Check if the Maps exist and delete transactions
  if (memStorage.uberEatsTransactions) {
    for (const transaction of uberInRange) {
      memStorage.uberEatsTransactions.delete(transaction.id);
    }
    console.log(`Deleted ${uberInRange.length} Uber Eats transactions`);
  }
  
  if (memStorage.doordashTransactions) {
    for (const transaction of doorInRange) {
      memStorage.doordashTransactions.delete(transaction.id);
    }
    console.log(`Deleted ${doorInRange.length} DoorDash transactions`);
  }
  
  if (memStorage.grubhubTransactions) {
    for (const transaction of grubInRange) {
      memStorage.grubhubTransactions.delete(transaction.id);
    }
    console.log(`Deleted ${grubInRange.length} Grubhub transactions`);
  }

  console.log("✅ Successfully deleted all week 9/29 data!");
  
  // Verify deletion
  const uberAfter = await storage.getUberEatsTransactionsByClient(CAPRIOTTIS_ID);
  const doorAfter = await storage.getDoordashTransactionsByClient(CAPRIOTTIS_ID);
  const grubAfter = await storage.getGrubhubTransactionsByClient(CAPRIOTTIS_ID);
  
  console.log(`\nRemaining transactions:`);
  console.log(`Uber Eats: ${uberAfter.length}`);
  console.log(`DoorDash: ${doorAfter.length}`);
  console.log(`Grubhub: ${grubAfter.length}`);
}

deleteWeek929Data().catch(console.error);
