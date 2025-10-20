import { storage } from "../server/storage";

const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

async function checkCounts() {
  const uber = await storage.getUberEatsTransactionsByClient(CAPRIOTTIS_ID);
  const door = await storage.getDoordashTransactionsByClient(CAPRIOTTIS_ID);
  const grub = await storage.getGrubhubTransactionsByClient(CAPRIOTTIS_ID);
  
  console.log("Transaction counts:");
  console.log(`  Uber Eats: ${uber.length}`);
  console.log(`  DoorDash: ${door.length}`);
  console.log(`  Grubhub: ${grub.length}`);
  console.log(`  Total: ${uber.length + door.length + grub.length}`);
}

checkCounts().catch(console.error);
