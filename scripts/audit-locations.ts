import { readFileSync } from "fs";
import { db } from "../server/db";
import { locations } from "../shared/schema";
import { eq } from "drizzle-orm";

interface MasterLocationRow {
  storeId: string;
  shopNumber: string;
  shopName: string;
  status: string;
}

function parseMasterFile(filePath: string): MasterLocationRow[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter(line => line.trim());
  
  // Skip header line
  const dataLines = lines.slice(1);
  
  const masterLocations: MasterLocationRow[] = [];
  
  for (const line of dataLines) {
    const columns = line.split("\t");
    if (columns.length < 5) continue;
    
    const status = columns[0]?.trim();
    const shopName = columns[2]?.trim(); // "Shop IDs Owned" column (e.g., "AL100443 Madison Hwy 72")
    const shopNumber = columns[3]?.trim(); // "SHOP #" column (e.g., "443")
    const storeId = columns[4]?.trim(); // "Store ID" column (e.g., "AL100443")
    
    if (status === "Active" && storeId && shopNumber) {
      masterLocations.push({
        storeId,
        shopNumber,
        shopName,
        status
      });
    }
  }
  
  return masterLocations;
}

async function auditLocations() {
  console.log("🔍 LOCATION AUDIT REPORT");
  console.log("=" .repeat(80));
  console.log();
  
  // Load master file
  const masterFilePath = "attached_assets/Pasted-Status-Open-Date-Shop-IDs-Owned-SHOP-Store-ID-Franchisee-Group-Shop-Address-City-State-Zip-Public--1760895435341_1760895435342.txt";
  const masterLocations = parseMasterFile(masterFilePath);
  
  console.log(`📄 Master File Analysis:`);
  console.log(`   Total Active Locations: ${masterLocations.length}`);
  console.log();
  
  // Get all database locations
  const dbLocations = await db.select().from(locations);
  
  console.log(`💾 Database Analysis:`);
  console.log(`   Total Locations: ${dbLocations.length}`);
  console.log(`   Master Tagged: ${dbLocations.filter(l => l.locationTag === "master").length}`);
  console.log(`   Untagged: ${dbLocations.filter(l => !l.locationTag || l.locationTag === "").length}`);
  console.log(`   Unmapped Bucket: ${dbLocations.filter(l => l.locationTag === "unmapped_bucket").length}`);
  console.log();
  
  // Check for locations in DB but not in master file
  const masterStoreIds = new Set(masterLocations.map(m => m.storeId));
  const masterShopNumbers = new Set(masterLocations.map(m => m.shopNumber));
  
  const dbMasterLocations = dbLocations.filter(l => l.locationTag === "master");
  
  console.log(`🔎 Location Matching Analysis:`);
  console.log();
  
  const unmatchedDbLocations: any[] = [];
  const matchedLocations: any[] = [];
  
  for (const dbLoc of dbMasterLocations) {
    // Try to match by various fields
    let matched = false;
    let matchMethod = "";
    
    // Extract potential codes from location fields
    const codes = [
      dbLoc.doordashStoreId,
      dbLoc.grubhubStoreCode,
      dbLoc.uberEatsStoreLabel,
    ].filter(Boolean);
    
    for (const code of codes) {
      if (masterStoreIds.has(code as string)) {
        matched = true;
        matchMethod = `Store ID: ${code}`;
        break;
      }
      
      // Try extracting number from code (e.g., "443" from "AL100443")
      const numMatch = (code as string).match(/\d+$/);
      if (numMatch && masterShopNumbers.has(numMatch[0])) {
        matched = true;
        matchMethod = `Shop Number: ${numMatch[0]}`;
        break;
      }
    }
    
    if (matched) {
      matchedLocations.push({ dbLoc, matchMethod });
    } else {
      unmatchedDbLocations.push(dbLoc);
    }
  }
  
  console.log(`   ✅ Matched DB locations: ${matchedLocations.length}`);
  console.log(`   ❌ Unmatched DB locations: ${unmatchedDbLocations.length}`);
  console.log();
  
  if (unmatchedDbLocations.length > 0) {
    console.log(`📋 Unmatched Master Locations in Database:`);
    console.log(`   (These ${unmatchedDbLocations.length} locations are tagged 'master' but don't match master file)`);
    console.log();
    
    for (const loc of unmatchedDbLocations.slice(0, 10)) {
      console.log(`   - ${loc.canonicalName || "(no name)"}`);
      console.log(`     DoorDash: ${loc.doordashStoreId || "N/A"}`);
      console.log(`     Uber: ${loc.uberEatsStoreLabel || "N/A"}`);
      console.log(`     Grubhub: ${loc.grubhubStoreCode || "N/A"}`);
      console.log();
    }
    
    if (unmatchedDbLocations.length > 10) {
      console.log(`   ... and ${unmatchedDbLocations.length - 10} more`);
      console.log();
    }
  }
  
  // Check for locations in master file but not in DB
  console.log(`📋 Master File Locations Not in Database:`);
  const dbStoreCodes = new Set([
    ...dbMasterLocations.map(l => l.doordashStoreId),
    ...dbMasterLocations.map(l => l.grubhubStoreCode),
    ...dbMasterLocations.map(l => l.uberEatsStoreLabel),
  ].filter(Boolean));
  
  const missingFromDb: MasterLocationRow[] = [];
  
  for (const master of masterLocations) {
    if (!dbStoreCodes.has(master.storeId)) {
      missingFromDb.push(master);
    }
  }
  
  console.log(`   Missing from DB: ${missingFromDb.length} locations`);
  
  if (missingFromDb.length > 0) {
    console.log();
    for (const missing of missingFromDb.slice(0, 10)) {
      console.log(`   - ${missing.shopName} (${missing.storeId})`);
    }
    if (missingFromDb.length > 10) {
      console.log(`   ... and ${missingFromDb.length - 10} more`);
    }
  }
  console.log();
  
  // Check untagged locations for transaction counts
  console.log(`📊 Untagged Location Analysis:`);
  const untaggedLocations = dbLocations.filter(l => !l.locationTag || l.locationTag === "");
  
  if (untaggedLocations.length > 0) {
    console.log(`   Total untagged: ${untaggedLocations.length}`);
    console.log(`   Sample untagged locations:`);
    for (const loc of untaggedLocations.slice(0, 5)) {
      console.log(`   - ${loc.canonicalName || "(no name)"} (ID: ${loc.id})`);
    }
    if (untaggedLocations.length > 5) {
      console.log(`   ... and ${untaggedLocations.length - 5} more`);
    }
  }
  console.log();
  
  // Summary and recommendations
  console.log(`📝 RECOMMENDATIONS:`);
  console.log("=" .repeat(80));
  console.log();
  console.log(`1. Expected state: 160 master locations + 1 unmapped bucket = 161 total`);
  console.log(`2. Current state: ${dbMasterLocations.length} master + ${untaggedLocations.length} untagged + 1 bucket = ${dbLocations.length} total`);
  console.log();
  console.log(`3. Actions needed:`);
  console.log(`   - Verify ${unmatchedDbLocations.length} unmatched 'master' locations`);
  console.log(`   - Remove or retag ${untaggedLocations.length} untagged locations`);
  console.log(`   - Add ${missingFromDb.length} missing master file locations (if they have data)`);
  console.log();
  
  return {
    masterFileCount: masterLocations.length,
    dbTotalCount: dbLocations.length,
    dbMasterCount: dbMasterLocations.length,
    dbUntaggedCount: untaggedLocations.length,
    matchedCount: matchedLocations.length,
    unmatchedCount: unmatchedDbLocations.length,
    missingFromDbCount: missingFromDb.length,
  };
}

auditLocations()
  .then((summary) => {
    console.log("✅ Audit complete!");
    console.log();
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Audit failed:", error);
    process.exit(1);
  });
