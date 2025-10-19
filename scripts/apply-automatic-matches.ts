import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { db } from "../server/db";
import { locations, clients } from "../shared/schema";
import { eq } from "drizzle-orm";

interface MasterLocation {
  storeId: string;
  shopName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

async function main() {
  console.log("🚀 Applying automatic Store ID matches...\n");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }

  // Parse master location list
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

  const masterLocations: MasterLocation[] = masterRows
    .filter((row: any) => row["Store ID"] && row["Status"] === "Active")
    .map((row: any) => ({
      storeId: row["Store ID"],
      shopName: row["Shop IDs Owned"],
      address: row["Shop Address"],
      city: row["City"],
      state: row["State"],
      zip: row["Zip"],
    }));

  console.log(`Loaded ${masterLocations.length} master locations\n`);

  // Get all database locations
  const dbLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));

  let updatedCount = 0;

  // Find and apply Store ID matches
  for (const loc of dbLocations) {
    let updated = false;
    let updates: any = {};

    // Check UberEats name
    if (loc.uberEatsName) {
      const match = loc.uberEatsName.match(/\(([A-Z]{2}\d+)\)/i);
      if (match) {
        const storeId = match[1].toUpperCase();
        const masterLoc = masterLocations.find((m) => m.storeId === storeId);
        
        if (masterLoc) {
          console.log(`✅ [UberEats] "${loc.uberEatsName}" → "${masterLoc.shopName}" (${storeId})`);
          updates.canonicalName = masterLoc.shopName;
          updates.address = masterLoc.address;
          updates.city = masterLoc.city;
          updates.state = masterLoc.state;
          updates.zip = masterLoc.zip;
          updates.isVerified = true;
          updated = true;
        }
      }
    }

    // Check DoorDash name
    if (loc.doordashName && !updated) {
      const match = loc.doordashName.match(/\(([A-Z]{2}\d+)\)/i);
      if (match) {
        const storeId = match[1].toUpperCase();
        const masterLoc = masterLocations.find((m) => m.storeId === storeId);
        
        if (masterLoc) {
          console.log(`✅ [DoorDash] "${loc.doordashName}" → "${masterLoc.shopName}" (${storeId})`);
          updates.canonicalName = masterLoc.shopName;
          updates.address = masterLoc.address;
          updates.city = masterLoc.city;
          updates.state = masterLoc.state;
          updates.zip = masterLoc.zip;
          updates.isVerified = true;
          updated = true;
        }
      }
    }

    // Check Grubhub name
    if (loc.grubhubName && !updated) {
      const match = loc.grubhubName.match(/\(([A-Z]{2}\d+)\)/i);
      if (match) {
        const storeId = match[1].toUpperCase();
        const masterLoc = masterLocations.find((m) => m.storeId === storeId);
        
        if (masterLoc) {
          console.log(`✅ [Grubhub] "${loc.grubhubName}" → "${masterLoc.shopName}" (${storeId})`);
          updates.canonicalName = masterLoc.shopName;
          updates.address = masterLoc.address;
          updates.city = masterLoc.city;
          updates.state = masterLoc.state;
          updates.zip = masterLoc.zip;
          updates.isVerified = true;
          updated = true;
        }
      }
    }

    if (updated) {
      await db.update(locations).set(updates).where(eq(locations.id, loc.id));
      updatedCount++;
    }
  }

  console.log(`\n✅ Applied ${updatedCount} automatic matches`);
  console.log("\n📝 Next: Fill in manual-location-mapping.csv for remaining locations");
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});
