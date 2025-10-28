import { db } from "../server/db";
import { locations } from "../shared/schema";
import { eq, sql } from "drizzle-orm";

interface LocationGroup {
  key: string;
  locations: any[];
  totalTransactions: number;
}

async function identifyDuplicates() {
  console.log("🔍 IDENTIFYING DUPLICATE LOCATIONS");
  console.log("=" .repeat(80));
  console.log();
  
  // Get all master locations
  const masterLocations = await db.select().from(locations).where(
    eq(locations.locationTag, "master")
  );
  
  console.log(`Total master locations: ${masterLocations.length}`);
  console.log();
  
  // Group locations by platform store identifiers
  const groups = new Map<string, LocationGroup>();
  
  for (const loc of masterLocations) {
    // Create a grouping key based on platform identifiers
    const keys: string[] = [];
    
    if (loc.uberEatsStoreLabel) {
      // Extract code from parentheses (e.g., "Capriotti's Sandwich Shop (NV008)" → "NV008")
      const match = loc.uberEatsStoreLabel.match(/\(([^)]+)\)/);
      if (match) {
        keys.push(`UE:${match[1]}`);
      }
    }
    
    if (loc.doorDashStoreKey) {
      keys.push(`DD:${loc.doorDashStoreKey}`);
    }
    
    // Use canonical name as fallback
    if (keys.length === 0 && loc.canonicalName) {
      keys.push(`NAME:${loc.canonicalName}`);
    }
    
    // Group by each key
    for (const key of keys) {
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          locations: [],
          totalTransactions: 0,
        });
      }
      groups.get(key)!.locations.push(loc);
    }
  }
  
  // Find groups with multiple locations (duplicates)
  const duplicateGroups: LocationGroup[] = [];
  
  for (const [key, group] of groups) {
    if (group.locations.length > 1) {
      // Count transactions for each location in the group
      for (const loc of group.locations) {
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
        (loc as any).transactionCount = count;
        group.totalTransactions += count;
      }
      
      duplicateGroups.push(group);
    }
  }
  
  // Sort by total transactions (descending)
  duplicateGroups.sort((a, b) => b.totalTransactions - a.totalTransactions);
  
  console.log(`Found ${duplicateGroups.length} groups with duplicate locations`);
  console.log();
  
  // Display duplicate groups
  let totalDuplicates = 0;
  
  for (const group of duplicateGroups) {
    console.log(`Group: ${group.key} (${group.locations.length} locations, ${group.totalTransactions} total transactions)`);
    
    // Sort locations in group by transaction count
    group.locations.sort((a: any, b: any) => b.transactionCount - a.transactionCount);
    
    for (let i = 0; i < group.locations.length; i++) {
      const loc = group.locations[i] as any;
      const marker = i === 0 ? "✅ KEEP" : "❌ DELETE";
      console.log(`   ${marker} "${loc.canonicalName}" (${loc.transactionCount} txns)`);
      console.log(`       Uber: ${loc.uberEatsStoreLabel || "N/A"}`);
      console.log(`       DoorDash: ${loc.doorDashStoreKey || "N/A"}`);
      
      if (i > 0) {
        totalDuplicates++;
      }
    }
    console.log();
  }
  
  console.log("📊 SUMMARY:");
  console.log("=" .repeat(80));
  console.log();
  console.log(`   Total master locations: ${masterLocations.length}`);
  console.log(`   Duplicate groups found: ${duplicateGroups.length}`);
  console.log(`   Locations to remove: ${totalDuplicates}`);
  console.log(`   Final count after cleanup: ${masterLocations.length - totalDuplicates}`);
  console.log();
  console.log(`   Target: 160 master locations`);
  console.log(`   Current excess: ${(masterLocations.length - totalDuplicates) - 160}`);
  console.log();
  
  return {
    totalMaster: masterLocations.length,
    duplicateGroups: duplicateGroups.length,
    toRemove: totalDuplicates,
    finalCount: masterLocations.length - totalDuplicates,
  };
}

identifyDuplicates()
  .then((result) => {
    console.log("✅ Analysis complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  });
