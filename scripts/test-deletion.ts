import { storage } from "../server/storage";

const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";
const WEEK_START = "2025-09-29";
const WEEK_END = "2025-10-05";

async function testDeletion() {
  console.log("Testing deletion methods...\n");

  // Check counts before
  const uberBefore = await storage.getUberEatsTransactionsByClient(CAPRIOTTIS_ID);
  const doorBefore = await storage.getDoordashTransactionsByClient(CAPRIOTTIS_ID);
  const grubBefore = await storage.getGrubhubTransactionsByClient(CAPRIOTTIS_ID);

  console.log("Before deletion:");
  console.log(`  Uber Eats: ${uberBefore.length}`);
  console.log(`  DoorDash: ${doorBefore.length}`);
  console.log(`  Grubhub: ${grubBefore.length}`);

  // Test Grubhub deletion (we know there are 1498 transactions in that date range)
  console.log(`\nTesting Grubhub deletion for date range ${WEEK_START} to ${WEEK_END}...`);
  
  // Check if the method exists
  if (typeof storage.deleteGrubhubTransactionsByDateRange === 'function') {
    console.log("✓ Method exists");
    
    const deleted = await storage.deleteGrubhubTransactionsByDateRange(
      CAPRIOTTIS_ID,
      WEEK_START,
      WEEK_END
    );
    console.log(`Deleted ${deleted} Grubhub transactions`);
  } else {
    console.log("✗ Method does not exist on storage object");
    console.log("Available methods:", Object.keys(storage).filter(k => k.includes('delete')));
  }

  // Check counts after
  const grubAfter = await storage.getGrubhubTransactionsByClient(CAPRIOTTIS_ID);
  console.log(`\nAfter deletion:`);
  console.log(`  Grubhub: ${grubAfter.length}`);
}

testDeletion().catch(console.error);
