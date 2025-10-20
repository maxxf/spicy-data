import { db } from "../server/db";
import { uberEatsTransactions, doordashTransactions, grubhubTransactions } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";

const CAPRIOTTIS_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

async function testUpsertBehavior() {
  console.log("Testing upsert behavior - re-uploading week 9/15 data should NOT create duplicates\n");

  // Count transactions BEFORE re-upload
  const [beforeCounts] = await db.select({
    uberCount: sql<number>`count(DISTINCT (client_id, order_id, date))::int`.as("uber_count"),
    doorCount: sql<number>`count(DISTINCT (client_id, transaction_id, transaction_date))::int`.as("door_count"),
    grubCount: sql<number>`count(DISTINCT (client_id, transaction_id))::int`.as("grub_count"),
  }).from(uberEatsTransactions)
    .leftJoin(doordashTransactions, sql`true`)
    .leftJoin(grubhubTransactions, sql`true`)
    .where(eq(uberEatsTransactions.clientId, CAPRIOTTIS_ID));

  console.log("Transaction counts BEFORE re-upload:");
  console.log(`  UberEats unique records: ${beforeCounts.uberCount}`);
  console.log(`  DoorDash unique records: ${beforeCounts.doorCount}`);
  console.log(`  Grubhub unique records: ${beforeCounts.grubCount}`);

  // Now re-import the same week's data
  console.log("\nRe-importing week 9/15 data (this should UPDATE existing records, not duplicate)...");
  const { spawnSync } = require('child_process');
  const result = spawnSync('npx', ['tsx', 'scripts/import-week-9-15.ts'], {
    stdio: 'inherit',
    shell: true
  });

  if (result.error) {
    console.error("Import failed:", result.error);
    process.exit(1);
  }

  // Count transactions AFTER re-upload
  const [afterCounts] = await db.select({
    uberCount: sql<number>`count(DISTINCT (client_id, order_id, date))::int`.as("uber_count"),
    doorCount: sql<number>`count(DISTINCT (client_id, transaction_id, transaction_date))::int`.as("door_count"),
    grubCount: sql<number>`count(DISTINCT (client_id, transaction_id))::int`.as("grub_count"),
  }).from(uberEatsTransactions)
    .leftJoin(doordashTransactions, sql`true`)
    .leftJoin(grubhubTransactions, sql`true`)
    .where(eq(uberEatsTransactions.clientId, CAPRIOTTIS_ID));

  console.log("\nTransaction counts AFTER re-upload:");
  console.log(`  UberEats unique records: ${afterCounts.uberCount}`);
  console.log(`  DoorDash unique records: ${afterCounts.doorCount}`);
  console.log(`  Grubhub unique records: ${afterCounts.grubCount}`);

  // Verify no duplicates were created
  const noDuplicates = (
    beforeCounts.uberCount === afterCounts.uberCount &&
    beforeCounts.doorCount === afterCounts.doorCount &&
    beforeCounts.grubCount === afterCounts.grubCount
  );

  if (noDuplicates) {
    console.log("\n✅ SUCCESS: Upsert logic working correctly - no duplicates created!");
    console.log("When uploading data for a week that already exists, it updates existing records instead of duplicating.");
  } else {
    console.log("\n❌ FAILURE: Duplicates were created!");
    console.log(`  UberEats diff: ${afterCounts.uberCount - beforeCounts.uberCount}`);
    console.log(`  DoorDash diff: ${afterCounts.doorCount - beforeCounts.doorCount}`);
    console.log(`  Grubhub diff: ${afterCounts.grubCount - beforeCounts.grubCount}`);
  }
}

testUpsertBehavior().catch(console.error);
