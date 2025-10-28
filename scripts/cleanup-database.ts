import { db } from "../server/db";
import { locations } from "../shared/schema";
import { eq, sql, inArray } from "drizzle-orm";

async function cleanupDatabase() {
  console.log("🧹 DATABASE CLEANUP SCRIPT");
  console.log("=" .repeat(80));
  console.log();
  
  // Step 1: Identify untagged locations with zero transactions
  console.log("Step 1: Identifying untagged locations with no transactions...");
  
  const untaggedLocations = await db.select().from(locations).where(
    sql`${locations.locationTag} IS NULL OR ${locations.locationTag} = ''`
  );
  
  console.log(`   Found ${untaggedLocations.length} untagged locations`);
  
  const locationsToDelete: string[] = [];
  const locationsWithTransactions: string[] = [];
  
  for (const loc of untaggedLocations) {
    // Check if location has any transactions
    const txnCount = await db.execute(sql`
      SELECT COUNT(*) as count FROM (
        SELECT location_id FROM uber_eats_transactions WHERE location_id = ${loc.id}
        UNION ALL
        SELECT location_id FROM doordash_transactions WHERE location_id = ${loc.id}
        UNION ALL
        SELECT location_id FROM grubhub_transactions WHERE location_id = ${loc.id}
      ) t
    `);
    
    const count = parseInt(txnCount.rows[0]?.count || "0");
    
    if (count === 0) {
      locationsToDelete.push(loc.id);
    } else {
      locationsWithTransactions.push(loc.id);
      console.log(`   ⚠️  Location "${loc.canonicalName}" has ${count} transactions but is untagged`);
    }
  }
  
  console.log();
  console.log(`   Locations with 0 transactions (safe to delete): ${locationsToDelete.length}`);
  console.log(`   Locations with transactions (need review): ${locationsWithTransactions.length}`);
  console.log();
  
  // Step 2: Delete locations with zero transactions
  if (locationsToDelete.length > 0) {
    console.log("Step 2: Deleting untagged locations with no transactions...");
    
    const result = await db.delete(locations).where(
      inArray(locations.id, locationsToDelete)
    );
    
    console.log(`   ✅ Deleted ${locationsToDelete.length} locations`);
  } else {
    console.log("Step 2: No locations to delete (all untagged locations have transactions)");
  }
  console.log();
  
  // Step 3: Report current state
  console.log("Step 3: Current database state after cleanup...");
  
  const finalState = await db.execute(sql`
    SELECT 
      location_tag,
      COUNT(*) as count
    FROM locations
    GROUP BY location_tag
    ORDER BY count DESC
  `);
  
  console.log();
  console.log("   Location breakdown:");
  for (const row of finalState.rows) {
    const tag = row.location_tag || "(untagged)";
    console.log(`   - ${tag}: ${row.count}`);
  }
  console.log();
  
  // Step 4: Summary and next steps
  console.log("📝 SUMMARY:");
  console.log("=" .repeat(80));
  console.log();
  console.log(`   ✅ Deleted ${locationsToDelete.length} untagged locations with no transactions`);
  console.log(`   ⚠️  ${locationsWithTransactions.length} untagged locations have transactions and need manual review`);
  console.log();
  
  if (locationsWithTransactions.length > 0) {
    console.log("   Next steps:");
    console.log("   1. Review the untagged locations with transactions");
    console.log("   2. Match them against the master file");
    console.log("   3. Tag them as 'master' or merge them into existing master locations");
  }
  console.log();
  
  return {
    deleted: locationsToDelete.length,
    withTransactions: locationsWithTransactions.length,
    finalState: finalState.rows,
  };
}

cleanupDatabase()
  .then((result) => {
    console.log("✅ Cleanup complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  });
