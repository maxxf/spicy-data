import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { db } from "../server/db";
import { locations, clients } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("🚀 Matching Grubhub locations using city + name\n");

  // Load Grubhub export with Store IDs
  const grubhubCsv = readFileSync(
    "attached_assets/locations (1)_1760897523714.csv",
    "utf-8"
  );
  
  const grubhubRows = parse(grubhubCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const grubhubLocations = grubhubRows
    .filter((row: any) => row.store_number)
    .map((row: any) => ({
      storeNumber: row.store_number, // This is the Store ID!
      storeName: row.store_name.trim(),
      city: row.city,
      state: row.state,
    }));

  console.log(`✅ Loaded ${grubhubLocations.length} Grubhub locations\n`);

  // Load master location list for canonical data
  const masterCsv = readFileSync(
    "attached_assets/Pasted-Status-Open-Date-Shop-IDs-Owned-SHOP-Store-ID-Franchisee-Group-Shop-Address-City-State-Zip-Public--1760895435341_1760895435342.txt",
    "utf-8"
  );

  const masterRows = parse(masterCsv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: "\t",
    trim: true,
  });

  const masterLocations = new Map(
    masterRows
      .filter((row: any) => row["Store ID"] && row["Status"] === "Active")
      .map((row: any) => [
        row["Store ID"],
        {
          storeId: row["Store ID"],
          shopName: row["Shop IDs Owned"],
          address: row["Shop Address"],
          city: row["City"],
          state: row["State"],
          zip: row["Zip"],
        },
      ])
  );

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }

  // Get all database locations with Grubhub names
  const dbLocations = await db
    .select()
    .from(locations)
    .where(eq(locations.clientId, client.id));

  const grubhubDbLocations = dbLocations.filter(loc => loc.grubhubName);

  console.log(`📍 Found ${grubhubDbLocations.length} database locations with Grubhub names\n`);

  let matchedCount = 0;
  let errorCount = 0;

  for (const dbLoc of grubhubDbLocations) {
    if (!dbLoc.grubhubName) continue;

    // Try to find matching Grubhub export row using city + name
    const ghLoc = grubhubLocations.find(gh => {
      // Name must match (with some flexibility for trailing spaces)
      const nameMatch = 
        gh.storeName === dbLoc.grubhubName ||
        gh.storeName === dbLoc.grubhubName.trim() ||
        gh.storeName.trim() === dbLoc.grubhubName.trim();
      
      if (!nameMatch) return false;

      // If DB location has city, use it for matching
      if (dbLoc.city) {
        const cityMatch = 
          gh.city.toLowerCase() === dbLoc.city.toLowerCase() ||
          gh.city.toLowerCase().includes(dbLoc.city.toLowerCase()) ||
          dbLoc.city.toLowerCase().includes(gh.city.toLowerCase());
        
        return cityMatch;
      }

      // If no city in DB location, use first match (risky but better than nothing)
      return true;
    });

    if (!ghLoc) {
      console.log(`⚠️  No match: "${dbLoc.grubhubName}" (city: ${dbLoc.city || "unknown"})`);
      errorCount++;
      continue;
    }

    // Get master location data for this Store ID
    const masterLoc = masterLocations.get(ghLoc.storeNumber);
    if (!masterLoc) {
      console.log(`⚠️  Master location not found for Store ID: ${ghLoc.storeNumber}`);
      errorCount++;
      continue;
    }

    // Update the database location with canonical data
    await db
      .update(locations)
      .set({
        canonicalName: masterLoc.shopName,
        address: masterLoc.address,
        city: masterLoc.city,
        state: masterLoc.state,
        zip: masterLoc.zip,
        isVerified: true,
      })
      .where(eq(locations.id, dbLoc.id));

    console.log(
      `✅ "${dbLoc.grubhubName}" (${ghLoc.city}) → ${ghLoc.storeNumber} ${masterLoc.shopName}`
    );
    matchedCount++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Matched: ${matchedCount}`);
  console.log(`   ⚠️  Errors: ${errorCount}`);
  console.log(`   📝 Total Grubhub locations: ${grubhubDbLocations.length}`);
  console.log(`\n✅ Grubhub location matching complete!`);
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});
