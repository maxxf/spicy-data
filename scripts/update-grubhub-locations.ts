import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { db } from "../server/db";
import { clients, locations } from "../shared/schema";
import { eq, and, or, sql } from "drizzle-orm";

async function main() {
  console.log("Updating Grubhub location mappings...");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }
  console.log(`Found client: ${client.name} (${client.id})`);

  // Read Grubhub location master list
  const grubhubCsv = readFileSync(
    "attached_assets/Pasted-BEGIN-COPY-grubhub-store-id-store-number-store-name-street-address-city-state-postal-code-order-time-1760813128460_1760813128460.txt",
    "utf-8"
  );
  
  const grubhubLocations = parse(grubhubCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    from_line: 2, // Skip "BEGIN COPY" line
    relax_column_count: true, // Allow variable column counts
  });

  console.log(`Loaded ${grubhubLocations.length} Grubhub locations from master list`);

  // Get all existing locations
  const existingLocations = await db
    .select()
    .from(locations)
    .where(eq(locations.clientId, client.id));

  console.log(`Found ${existingLocations.length} existing locations in database`);

  let updated = 0;
  let created = 0;
  let alreadyMapped = 0;

  for (const ghLoc of grubhubLocations) {
    const storeName = ghLoc.store_name?.trim();
    const storeNumber = ghLoc.store_number?.trim();
    const city = ghLoc.city?.trim();
    const state = ghLoc.state?.trim();
    
    if (!storeName) continue;

    // Create a canonical name from city and state
    const canonicalName = city && state ? `${city}, ${state}` : storeName;

    // Try to find existing location by:
    // 1. Exact grubhubName match
    // 2. City/State match
    // 3. Store number in canonical name
    let existingLocation = existingLocations.find(
      (loc) =>
        loc.grubhubName === storeName ||
        (city && state && loc.canonicalName.includes(city) && loc.canonicalName.includes(state)) ||
        (storeNumber && loc.canonicalName.includes(storeNumber))
    );

    if (existingLocation) {
      if (existingLocation.grubhubName === storeName) {
        alreadyMapped++;
        continue;
      }

      // Update with Grubhub name
      await db
        .update(locations)
        .set({
          grubhubName: storeName,
          isVerified: true,
        })
        .where(eq(locations.id, existingLocation.id));

      console.log(`Updated: "${existingLocation.canonicalName}" -> grubhubName: "${storeName}"`);
      updated++;
    } else {
      // Create new location
      const [newLoc] = await db
        .insert(locations)
        .values({
          clientId: client.id,
          canonicalName,
          grubhubName: storeName,
          isVerified: true,
        })
        .returning();

      existingLocations.push(newLoc);
      console.log(`Created: "${canonicalName}" with grubhubName: "${storeName}"`);
      created++;
    }
  }

  console.log("\n✅ Grubhub location mapping complete!");
  console.log(`  Already mapped: ${alreadyMapped}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Created: ${created}`);
  console.log(`  Total locations: ${existingLocations.length}`);

  process.exit(0);
}

main().catch((error) => {
  console.error("Update failed:", error);
  process.exit(1);
});
