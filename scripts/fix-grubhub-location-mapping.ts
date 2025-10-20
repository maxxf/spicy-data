import { db } from "../server/db";
import { grubhubTransactions, locations } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("🔧 Fixing Grubhub Location Mapping\n");
  
  const clientId = "83506705-b408-4f0a-a9b0-e5b585db3b7d"; // Capriotti's

  // Step 1: Delete all existing Grubhub transactions
  console.log("🗑️  Deleting all existing Grubhub transactions...");
  const deleted = await db
    .delete(grubhubTransactions)
    .where(eq(grubhubTransactions.clientId, clientId));
  
  console.log(`✅ Deleted Grubhub transactions`);
  
  console.log("\n✨ Grubhub transactions cleared!");
  console.log("📤 Please re-upload all Grubhub CSV files through the Upload Data page");
  console.log("   The fixed matching logic will now correctly map transactions to locations");
  console.log("   based on street_address (primary) or store_number (fallback).\n");
  
  process.exit(0);
}

main().catch(console.error);
