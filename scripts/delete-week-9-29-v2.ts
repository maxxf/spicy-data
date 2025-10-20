import { storage } from "../server/storage";

const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";
const WEEK_START = "2025-09-29";
const WEEK_END = "2025-10-05";

async function deleteWeek929Data() {
  console.log("Deleting all transactions and data for week 9/29 (2025-09-29 to 2025-10-05)...");

  // Delete transactions using the new storage methods
  const uberDeleted = await storage.deleteUberEatsTransactionsByDateRange(
    CAPRIOTTIS_ID,
    WEEK_START,
    WEEK_END
  );
  console.log(`✓ Deleted ${uberDeleted} Uber Eats transactions`);

  const doorDeleted = await storage.deleteDoordashTransactionsByDateRange(
    CAPRIOTTIS_ID,
    WEEK_START,
    WEEK_END
  );
  console.log(`✓ Deleted ${doorDeleted} DoorDash transactions`);

  const grubDeleted = await storage.deleteGrubhubTransactionsByDateRange(
    CAPRIOTTIS_ID,
    WEEK_START,
    WEEK_END
  );
  console.log(`✓ Deleted ${grubDeleted} Grubhub transactions`);

  // Delete weekly financials
  const financialsDeleted = await storage.deleteLocationWeeklyFinancialsByClient(CAPRIOTTIS_ID);
  console.log(`✓ Deleted ${financialsDeleted} weekly financial records`);

  const totalDeleted = uberDeleted + doorDeleted + grubDeleted;
  console.log(`\n✅ Successfully deleted ${totalDeleted} transactions total!`);
  
  // Verify deletion
  const uberRemaining = await storage.getUberEatsTransactionsByClient(CAPRIOTTIS_ID);
  const doorRemaining = await storage.getDoordashTransactionsByClient(CAPRIOTTIS_ID);
  const grubRemaining = await storage.getGrubhubTransactionsByClient(CAPRIOTTIS_ID);
  
  console.log(`\nRemaining transactions for Capriotti's:`);
  console.log(`  Uber Eats: ${uberRemaining.length}`);
  console.log(`  DoorDash: ${doorRemaining.length}`);
  console.log(`  Grubhub: ${grubRemaining.length}`);
  console.log(`  Total: ${uberRemaining.length + doorRemaining.length + grubRemaining.length}`);
}

deleteWeek929Data().catch(console.error);
