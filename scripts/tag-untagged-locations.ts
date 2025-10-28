import { db } from "../server/db";
import { locations } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

async function tagUntaggedLocations() {
  console.log("🏷️  TAGGING UNTAGGED LOCATIONS WITH TRANSACTIONS");
  console.log("=" .repeat(80));
  console.log();
  
  // Get all untagged locations
  const untaggedLocations = await db.select().from(locations).where(
    sql`${locations.locationTag} IS NULL OR ${locations.locationTag} = ''`
  );
  
  console.log(`Found ${untaggedLocations.length} untagged locations`);
  console.log();
  
  let tagged = 0;
  
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
    
    if (count > 0) {
      // Tag this location as master
      await db.update(locations)
        .set({ locationTag: "master" })
        .where(eq(locations.id, loc.id));
      
      console.log(`   ✅ Tagged "${loc.canonicalName}" as master (${count} transactions)`);
      tagged++;
    }
  }
  
  console.log();
  console.log(`✅ Tagged ${tagged} locations as master`);
  console.log();
  
  // Report final state
  const finalState = await db.execute(sql`
    SELECT 
      location_tag,
      COUNT(*) as count
    FROM locations
    GROUP BY location_tag
    ORDER BY count DESC
  `);
  
  console.log("📊 Final location breakdown:");
  for (const row of finalState.rows) {
    const tag = row.location_tag || "(untagged)";
    console.log(`   - ${tag}: ${row.count}`);
  }
  console.log();
  
  return { tagged };
}

tagUntaggedLocations()
  .then((result) => {
    console.log("✅ Tagging complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Tagging failed:", error);
    process.exit(1);
  });
