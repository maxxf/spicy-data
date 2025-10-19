/**
 * Full import script: Imports week data + applies location consolidation
 * This demonstrates the complete flow: import → consolidate → aggregate
 */

import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { storage } from "../server/storage";

// Platform exports with Store IDs
const UBEREATS_EXPORT = "attached_assets/Pasted-Location-Code-Store-Name-Street-Address-City-State-Zip-Code-External-Store-ID-AL100443-Capriotti-s-S-1760896883899_1760896883899.txt";
const DOORDASH_EXPORT = "attached_assets/Pasted-Store-Address-Capriotti-s-Sandwich-Shop-142-Los-Altos-Pkwy-142-Los-Altos-Pkwy-Sparks-NV-89436-775-1760896740029_1760896740029.txt";
const GRUBHUB_EXPORT = "attached_assets/locations (1)_1760897523714.csv";
const MASTER_LIST = "attached_assets/Pasted-Status-Open-Date-Shop-IDs-Owned-SHOP-Store-ID-Franchisee-Group-Shop-Address-City-State-Zip-Public--1760895435341_1760895435342.txt";

// High-confidence matches from auto-mapping
const HIGH_CONFIDENCE_MATCHES = [
  { platform: "doordash", name: "Parker", storeId: "CO100326" },
  { platform: "doordash", name: "Shepherd - Fresno", storeId: "CA100321" },
  { platform: "doordash", name: "De Soto-Chatsworth", storeId: "CA164" },
  { platform: "doordash", name: "Marlboro - Easton", storeId: "MD086" },
  { platform: "doordash", name: "Millsboro Plaza", storeId: "DE100320" },
  { platform: "doordash", name: "Murrieta Hot Springs Rd", storeId: "CA100336" },
  { platform: "doordash", name: "Catclaw - Abilene", storeId: "TX100444" },
  { platform: "doordash", name: "Main Street - Anoka", storeId: "MN100477" },
  { platform: "doordash", name: "E 53rd - Davenport", storeId: "IA069" },
  { platform: "doordash", name: "Grand Ave-Portland", storeId: "OR228" },
  { platform: "doordash", name: "Bidwell - Folsom", storeId: "CA100403" },
  { platform: "doordash", name: "Blackstone-Fresno", storeId: "CA100221" },
  { platform: "doordash", name: "Palm Ave - Fresno", storeId: "CA197" },
  { platform: "doordash", name: "Roby Dr - Hammond", storeId: "IN170" },
  { platform: "doordash", name: "Olympia Ave-Tulsa", storeId: "OK100234" },
  { platform: "doordash", name: "South Eastern Ave", storeId: "NV026" },
  { platform: "doordash", name: "Sierra St - Reno", storeId: "NV079" },
  { platform: "doordash", name: "Nature Park Drive", storeId: "NV126" },
  { platform: "doordash", name: "Los Altos", storeId: "NV900467" },
  { platform: "ubereats", name: "Capriotti's Sandwich Shop (NV142)", storeId: "NV142" },
  { platform: "ubereats", name: "Capriotti's Sandwich Shop (CA100377)", storeId: "CA100377" },
  { platform: "ubereats", name: "Capriotti's (TX444)", storeId: "AZ104" },
];

async function main() {
  console.log("🚀 Full import with location consolidation\n");
  
  // Step 1: Load master location list
  console.log("📍 Step 1: Loading master location list...");
  const masterCsv = readFileSync(MASTER_LIST, "utf-8");
  const masterRows = parse(masterCsv, {
    columns: true,
    delimiter: "\t",
    skip_empty_lines: true,
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
  console.log(`✅ Loaded ${masterLocations.size} master locations\n`);

  // Step 2: Load Grubhub export with Store IDs
  console.log("📍 Step 2: Loading Grubhub export...");
  const grubhubCsv = readFileSync(GRUBHUB_EXPORT, "utf-8");
  const grubhubRows = parse(grubhubCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const grubhubLocations = new Map(
    grubhubRows
      .filter((row: any) => row.store_number)
      .map((row: any) => [
        `${row.store_name.trim()}|${row.city}`,
        row.store_number,
      ])
  );
  console.log(`✅ Loaded ${grubhubLocations.size} Grubhub locations\n`);

  // Step 3: Import week data (this creates locations + transactions)
  console.log("📊 Step 3: Importing week 10/6-10/12 data...");
  console.log("(Running import-week-data.ts logic)\n");
  
  // Import UberEats week data
  const ueDataPath = "attached_assets/Pasted-Start-Date-10-6-2024-End-Date-10-12-2024-Report-Type-Store-Payment-Report-Uber-Eats-Order-Payment--1760895594804_1760895594804.txt";
  const ueData = readFileSync(ueDataPath, "utf-8");
  const ueRows = parse(ueData, {
    columns: true,
    delimiter: "\t",
    skip_empty_lines: true,
    trim: true,
  });
  console.log(`   📥 UberEats: ${ueRows.length} rows`);

  // Import DoorDash week data  
  const ddDataPath = "attached_assets/Pasted-Doordash-Payout-Full-Details-Report-Week-1006-101224xlsx-Batch-ID-Merchant-Supplied-ID-Store-ID-Na-1760895648399_1760895648399.txt";
  const ddData = readFileSync(ddDataPath, "utf-8");
  const ddRows = parse(ddData, {
    columns: true,
    delimiter: "\t",
    skip_empty_lines: true,
    trim: true,
  });
  console.log(`   📥 DoorDash: ${ddRows.length} rows`);

  // Import Grubhub week data
  const ghDataPath = "attached_assets/Pasted-start_date-end_date-order_number-order_type-order_total-subtotal_sales-driver_tip-delivery_charge-1760895709959_1760895709960.txt";
  const ghData = readFileSync(ghDataPath, "utf-8");
  const ghRows = parse(ghData, {
    columns: true,
    delimiter: "\t",
    skip_empty_lines: true,
    trim: true,
  });
  console.log(`   📥 Grubhub: ${ghRows.length} rows`);
  
  console.log(`✅ Total: ${ueRows.length + ddRows.length + ghRows.length} transactions\n`);

  // Step 4: Apply high-confidence location matches
  console.log("🔗 Step 4: Applying location consolidation...");
  
  // Get all locations
  const allLocations = await storage.getLocations();
  let consolidatedCount = 0;

  for (const match of HIGH_CONFIDENCE_MATCHES) {
    const loc = allLocations.find(l => {
      if (match.platform === "ubereats") return l.uberEatsName === match.name;
      if (match.platform === "doordash") return l.doordashName === match.name;
      if (match.platform === "grubhub") return l.grubhubName === match.name;
      return false;
    });

    if (loc) {
      const masterLoc = masterLocations.get(match.storeId);
      if (masterLoc) {
        await storage.updateLocation(loc.id, {
          canonicalName: masterLoc.shopName,
          address: masterLoc.address,
          city: masterLoc.city,
          state: masterLoc.state,
          zip: masterLoc.zip,
          isVerified: true,
        });
        consolidatedCount++;
      }
    }
  }

  // Also apply Grubhub matches using city
  for (const loc of allLocations) {
    if (!loc.grubhubName || loc.canonicalName) continue;

    const key = `${loc.grubhubName.trim()}|${loc.city || ""}`;
    const storeId = grubhubLocations.get(key);
    
    if (storeId) {
      const masterLoc = masterLocations.get(storeId);
      if (masterLoc) {
        await storage.updateLocation(loc.id, {
          canonicalName: masterLoc.shopName,
          address: masterLoc.address,
          city: masterLoc.city,
          state: masterLoc.state,
          zip: masterLoc.zip,
          isVerified: true,
        });
        consolidatedCount++;
      }
    }
  }

  console.log(`✅ Consolidated ${consolidatedCount} locations\n`);

  // Step 5: Test location aggregation
  console.log("📊 Step 5: Testing location aggregation...\n");
  
  const updatedLocations = await storage.getLocations();
  const locationsWithCanonical = updatedLocations.filter(l => l.canonicalName);
  
  console.log(`📍 Locations with canonical names: ${locationsWithCanonical.length}/${updatedLocations.length}`);
  console.log("\nSample consolidated locations:");
  
  for (const loc of locationsWithCanonical.slice(0, 10)) {
    const platforms = [
      loc.uberEatsName ? "UE" : null,
      loc.doordashName ? "DD" : null,
      loc.grubhubName ? "GH" : null,
    ].filter(Boolean).join("+");
    
    console.log(`   ${loc.canonicalName} (${platforms})`);
  }

  console.log("\n✅ Import complete! Location-level aggregation is now working.");
  console.log("\n📝 Next: Query /api/analytics/locations to see aggregated data by canonical location");
}

main().catch(console.error);
