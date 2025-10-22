import { db } from "./db";
import { uberEatsTransactions, locations } from "@shared/schema";
import { eq, isNull, sql } from "drizzle-orm";

async function fixUberEatsMapping() {
  console.log("🔧 Fixing Uber Eats location mapping...\n");

  // Get all locations
  const allLocations = await db.select().from(locations);
  console.log(`Found ${allLocations.length} locations in database`);

  // Get all unmapped UE transactions
  const unmappedTxns = await db
    .select({
      id: uberEatsTransactions.id,
      location: uberEatsTransactions.location,
    })
    .from(uberEatsTransactions)
    .where(isNull(uberEatsTransactions.locationId));

  console.log(`Found ${unmappedTxns.length} unmapped Uber Eats transactions\n`);

  let successCount = 0;
  let failCount = 0;
  const failedMappings = new Map<string, number>();

  // Build a mapping of location names to location IDs
  const locationNameToId = new Map<string, string>();
  for (const loc of allLocations) {
    if (loc.uberEatsStoreLabel) {
      locationNameToId.set(loc.uberEatsStoreLabel.trim().toLowerCase(), loc.id);
    }
  }

  // Group transactions by their extracted store code
  const txnsByStoreCode = new Map<string, string[]>();
  for (const txn of unmappedTxns) {
    if (!txn.location || txn.location.trim() === "") {
      failCount++;
      failedMappings.set("(empty location)", (failedMappings.get("(empty location)") || 0) + 1);
      continue;
    }

    // Extract store code from format "Capriotti's Sandwich Shop (STORECODE)"
    const storeCodeMatch = txn.location.match(/\(([^)]+)\)/);
    const storeCode = storeCodeMatch ? storeCodeMatch[1].trim() : txn.location.trim();
    
    if (!txnsByStoreCode.has(storeCode)) {
      txnsByStoreCode.set(storeCode, []);
    }
    txnsByStoreCode.get(storeCode)!.push(txn.id);
  }

  console.log(`Grouped into ${txnsByStoreCode.size} unique location codes\n`);

  // Update in bulk using raw SQL for each store code
  for (const [storeCode, txnIds] of Array.from(txnsByStoreCode.entries())) {
    const locationId = locationNameToId.get(storeCode.toLowerCase());
    
    if (locationId) {
      // Bulk update in chunks to avoid SQL size limits
      const chunkSize = 500;
      for (let i = 0; i < txnIds.length; i += chunkSize) {
        const chunk = txnIds.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => sql.raw('?')).join(', ');
        
        await db.execute(
          sql.raw(`UPDATE uber_eats_transactions 
                   SET location_id = '${locationId}' 
                   WHERE id IN (${chunk.map(id => `'${id}'`).join(', ')})`)
        );
      }
      successCount += txnIds.length;
      console.log(`✓ Mapped ${txnIds.length} transactions for store "${storeCode}"`);
    } else {
      failCount += txnIds.length;
      failedMappings.set(storeCode, txnIds.length);
      console.log(`✗ No match found for store "${storeCode}" (${txnIds.length} transactions)`);
    }
  }

  console.log(`\n✅ Mapping complete!`);
  console.log(`   • Successfully mapped: ${successCount} transactions`);
  console.log(`   • Failed to map: ${failCount} transactions`);

  if (failedMappings.size > 0 && failedMappings.size <= 20) {
    console.log(`\n⚠️  Failed mappings:`);
    const sorted = Array.from(failedMappings.entries()).sort((a, b) => b[1] - a[1]);
    for (const [location, count] of sorted.slice(0, 20)) {
      console.log(`   • "${location}": ${count} transactions`);
    }
  } else if (failedMappings.size > 20) {
    console.log(`\n⚠️  Top 20 failed mappings:`);
    const sorted = Array.from(failedMappings.entries()).sort((a, b) => b[1] - a[1]);
    for (const [location, count] of sorted.slice(0, 20)) {
      console.log(`   • "${location}": ${count} transactions`);
    }
  }

  process.exit(0);
}

fixUberEatsMapping().catch((err) => {
  console.error("Error fixing Uber Eats mapping:", err);
  process.exit(1);
});
