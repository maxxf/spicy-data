import { db } from "../server/db";
import { grubhubTransactions, locations } from "../shared/schema";
import { eq, sql, isNotNull } from "drizzle-orm";

async function main() {
  console.log("🔍 Diagnosing Grubhub Location Matching\n");

  const clientId = "83506705-b408-4f0a-a9b0-e5b585db3b7d"; // Capriotti's

  // Get all Grubhub transactions
  const allTxns = await db
    .select()
    .from(grubhubTransactions)
    .where(eq(grubhubTransactions.clientId, clientId))
    .limit(20);

  console.log("📊 Sample of first 20 Grubhub transactions:");
  console.log("orderId | restaurant | locationId");
  console.log("".padEnd(80, "-"));
  allTxns.forEach((txn) => {
    console.log(
      `${(txn.orderId || "null").padEnd(15)} | ${txn.restaurant.padEnd(30)} | ${txn.locationId?.substring(0, 8) || "NULL"}`
    );
  });

  // Get location distribution
  const distribution = await db
    .select({
      locationId: grubhubTransactions.locationId,
      count: sql<number>`count(*)`,
    })
    .from(grubhubTransactions)
    .where(eq(grubhubTransactions.clientId, clientId))
    .groupBy(grubhubTransactions.locationId)
    .orderBy(sql`count(*) DESC`);

  console.log("\n📍 Location Distribution:");
  for (const row of distribution) {
    if (row.locationId) {
      const [loc] = await db
        .select()
        .from(locations)
        .where(eq(locations.id, row.locationId))
        .limit(1);
      console.log(
        `  ${loc?.canonicalName?.padEnd(40) || "Unknown"} → ${row.count} txns`
      );
      console.log(
        `    Address: ${loc?.address || "NULL"}, Grubhub Name: ${loc?.grubhubName || "NULL"}`
      );
    } else {
      console.log(`  NULL (unmapped) → ${row.count} txns`);
    }
  }

  // Check locations with addresses
  const locsWithAddress = await db
    .select()
    .from(locations)
    .where(
      sql`${locations.clientId} = ${clientId} AND ${locations.address} IS NOT NULL`
    );

  console.log(`\n🏢 Total locations with addresses: ${locsWithAddress.length}`);
  console.log("\nSample addresses:");
  locsWithAddress.slice(0, 10).forEach((loc) => {
    console.log(`  ${loc.canonicalName}: "${loc.address}"`);
  });

  process.exit(0);
}

main().catch(console.error);
