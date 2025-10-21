import { storage } from "./storage";
import type { DoordashTransaction, Location } from "@shared/schema";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { doordashTransactions } from "@shared/schema";
import { eq } from "drizzle-orm";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Normalize location name for matching
function normalizeLocationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')  // Collapse multiple spaces
    .replace(/[,._]/g, '') // Remove punctuation (except dashes for now)
    .replace(/\b(inc|llc|corp|corporation|co)\b/g, '') // Remove corporate suffixes
    .replace(/\bof\b/g, '') // Remove "of"
    .replace(/\b(street|road|avenue|boulevard|highway|drive|lane|parkway)\b/g, '') // Remove full street type words only
    .trim();
}

function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeLocationName(str1);
  const s2 = normalizeLocationName(str2);

  if (s1 === s2) return 1.0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const editDistance = (s1: string, s2: string): number => {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  };

  const distance = editDistance(shorter, longer);
  return (longer.length - distance) / longer.length;
}

async function findLocationMatch(locationName: string, allLocations: Location[]): Promise<{ locationId: string; matchType: string } | null> {
  // 1. Try exact normalized match on doordashName
  const normalizedInput = normalizeLocationName(locationName);
  const exactNameMatch = allLocations.find((loc: Location) => {
    if (!loc.doordashName) return false;
    return normalizeLocationName(loc.doordashName) === normalizedInput;
  });
  
  if (exactNameMatch) {
    return { locationId: exactNameMatch.id, matchType: "exact-doordashName" };
  }

  // 2. Try exact normalized match on canonicalName
  const canonicalMatch = allLocations.find((loc: Location) => {
    if (!loc.canonicalName) return false;
    return normalizeLocationName(loc.canonicalName) === normalizedInput;
  });
  
  if (canonicalMatch) {
    return { locationId: canonicalMatch.id, matchType: "exact-canonicalName" };
  }

  // 3. Try fuzzy match as fallback
  const fuzzyMatch = allLocations.find((loc: Location) => {
    if (!loc.doordashName && !loc.canonicalName) return false;
    const nameToCheck = loc.doordashName || loc.canonicalName;
    const similarity = calculateStringSimilarity(nameToCheck, locationName);
    return similarity >= 0.90;
  });
  
  if (fuzzyMatch) {
    return { locationId: fuzzyMatch.id, matchType: "fuzzy-match" };
  }

  return null;
}

async function backfillDoorDashLocations() {
  console.log("🔄 Starting DoorDash location backfill...\n");

  const clientId = "83506705-b408-4f0a-a9b0-e5b585db3b7d"; // Capriotti's
  
  // Get all DoorDash transactions
  const allTxns = await storage.getDoordashTransactionsByClient(clientId);
  console.log(`Found ${allTxns.length} total DoorDash transactions`);

  // Filter unmapped transactions
  const unmappedTxns = allTxns.filter((txn: DoordashTransaction) => !txn.locationId);
  console.log(`Found ${unmappedTxns.length} unmapped transactions\n`);

  if (unmappedTxns.length === 0) {
    console.log("✅ No unmapped transactions found. Backfill complete!");
    return;
  }

  // Get unique store locations from unmapped transactions
  const uniqueStoreLocations = Array.from(new Set(
    unmappedTxns.map((txn: DoordashTransaction) => txn.storeLocation).filter(Boolean)
  ));
  console.log(`Found ${uniqueStoreLocations.length} unique unmapped store locations\n`);

  // Get all locations for the client
  const allLocations = await storage.getLocationsByClient(clientId);
  console.log(`Found ${allLocations.length} locations in database\n`);

  let totalMatched = 0;
  let totalUnmatched = 0;
  const updates: Array<{ storeLocation: string; locationId: string; matchType: string }> = [];
  const unmatchedLocations: string[] = [];

  for (const storeLocation of uniqueStoreLocations) {
    if (!storeLocation || storeLocation.trim() === "") {
      unmatchedLocations.push("(empty)");
      totalUnmatched++;
      continue;
    }

    const match = await findLocationMatch(storeLocation, allLocations);

    if (match) {
      updates.push({ storeLocation, locationId: match.locationId, matchType: match.matchType });
      totalMatched++;
    } else {
      unmatchedLocations.push(storeLocation);
      totalUnmatched++;
    }
  }

  console.log(`\n📊 Matching Results:`);
  console.log(`  ✅ Matched: ${totalMatched}`);
  console.log(`  ❌ Unmatched: ${totalUnmatched}\n`);

  if (unmatchedLocations.length > 0) {
    console.log(`❌ Unmatched locations:`);
    unmatchedLocations.slice(0, 20).forEach(name => console.log(`   - ${name}`));
    if (unmatchedLocations.length > 20) {
      console.log(`   ... and ${unmatchedLocations.length - 20} more`);
    }
    console.log("");
  }

  // Update transactions
  if (updates.length > 0) {
    console.log(`🔄 Updating transactions with matched locations...\n`);
    
    let totalUpdated = 0;
    for (const update of updates) {
      // Update all transactions for this store location using database
      const result = await db
        .update(doordashTransactions)
        .set({ locationId: update.locationId })
        .where(eq(doordashTransactions.storeLocation, update.storeLocation));
      
      const count = result.rowCount || 0;
      totalUpdated += count;
      console.log(`  ✓ Updated ${count} transactions for "${update.storeLocation}" (${update.matchType})`);
    }

    console.log(`\n✅ Total transactions updated: ${totalUpdated}`);
  }

  // Verify results
  const updatedTxns = await storage.getDoordashTransactionsByClient(clientId);
  const stillUnmapped = updatedTxns.filter((txn: DoordashTransaction) => !txn.locationId);

  console.log(`\n📈 Final Status:`);
  console.log(`  Unmapped transactions remaining: ${stillUnmapped.length}`);
  console.log(`\n✅ Backfill complete!`);
  
  await pool.end();
}

// Run the backfill
backfillDoorDashLocations()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error during backfill:", error);
    process.exit(1);
  });
