import { readFileSync } from "fs";
import { db } from "../server/db";
import { 
  clients, locations, uberEatsTransactions, doordashTransactions, 
  grubhubTransactions, platformAdSpend 
} from "../shared/schema";
import { sql } from "drizzle-orm";
import crypto from "crypto";

interface ExportManifest {
  exportDate: string;
  version: string;
  counts: Record<string, number>;
  checksums: Record<string, string>;
}

function calculateChecksum(data: any[]): string {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(data));
  return hash.digest("hex");
}

async function importProductionData() {
  console.log("📥 IMPORTING PRODUCTION DATA");
  console.log("=" .repeat(80));
  console.log();
  
  const exportDir = "production-export";
  
  // Load manifest
  console.log("Step 1: Loading and verifying manifest...");
  const manifestPath = `${exportDir}/manifest.json`;
  const manifest: ExportManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  
  console.log(`   Export date: ${manifest.exportDate}`);
  console.log(`   Version: ${manifest.version}`);
  console.log();
  
  // Verify checksums
  console.log("Step 2: Verifying data integrity...");
  
  const clientsData = JSON.parse(readFileSync(`${exportDir}/clients.json`, "utf-8"));
  const clientsChecksum = calculateChecksum(clientsData);
  if (clientsChecksum !== manifest.checksums.clients) {
    throw new Error("Clients checksum mismatch!");
  }
  console.log(`   ✅ Clients checksum verified`);
  
  const locationsData = JSON.parse(readFileSync(`${exportDir}/locations.json`, "utf-8"));
  const locationsChecksum = calculateChecksum(locationsData);
  if (locationsChecksum !== manifest.checksums.locations) {
    throw new Error("Locations checksum mismatch!");
  }
  console.log(`   ✅ Locations checksum verified`);
  
  const uberData = JSON.parse(readFileSync(`${exportDir}/uber-eats-transactions.json`, "utf-8"));
  const uberChecksum = calculateChecksum(uberData);
  if (uberChecksum !== manifest.checksums.uberEatsTransactions) {
    throw new Error("Uber Eats transactions checksum mismatch!");
  }
  console.log(`   ✅ Uber Eats transactions checksum verified`);
  
  const doordashData = JSON.parse(readFileSync(`${exportDir}/doordash-transactions.json`, "utf-8"));
  const doordashChecksum = calculateChecksum(doordashData);
  if (doordashChecksum !== manifest.checksums.doordashTransactions) {
    throw new Error("DoorDash transactions checksum mismatch!");
  }
  console.log(`   ✅ DoorDash transactions checksum verified`);
  
  const grubhubData = JSON.parse(readFileSync(`${exportDir}/grubhub-transactions.json`, "utf-8"));
  const grubhubChecksum = calculateChecksum(grubhubData);
  if (grubhubChecksum !== manifest.checksums.grubhubTransactions) {
    throw new Error("Grubhub transactions checksum mismatch!");
  }
  console.log(`   ✅ Grubhub transactions checksum verified`);
  
  const adSpendData = JSON.parse(readFileSync(`${exportDir}/platform-ad-spend.json`, "utf-8"));
  const adSpendChecksum = calculateChecksum(adSpendData);
  if (adSpendChecksum !== manifest.checksums.platformAdSpend) {
    throw new Error("Platform ad spend checksum mismatch!");
  }
  console.log(`   ✅ Platform ad spend checksum verified`);
  console.log();
  
  // Import data
  console.log("Step 3: Importing clients...");
  await db.insert(clients).values(clientsData).onConflictDoNothing();
  console.log(`   ✅ Imported ${clientsData.length} clients`);
  console.log();
  
  console.log("Step 4: Importing locations...");
  await db.insert(locations).values(locationsData).onConflictDoNothing();
  console.log(`   ✅ Imported ${locationsData.length} locations`);
  console.log();
  
  console.log("Step 5: Importing Uber Eats transactions...");
  const uberBatchSize = 1000;
  for (let i = 0; i < uberData.length; i += uberBatchSize) {
    const batch = uberData.slice(i, i + uberBatchSize);
    await db.insert(uberEatsTransactions).values(batch).onConflictDoNothing();
    console.log(`   Progress: ${Math.min(i + uberBatchSize, uberData.length)}/${uberData.length}`);
  }
  console.log(`   ✅ Imported ${uberData.length} Uber Eats transactions`);
  console.log();
  
  console.log("Step 6: Importing DoorDash transactions...");
  const doordashBatchSize = 1000;
  for (let i = 0; i < doordashData.length; i += doordashBatchSize) {
    const batch = doordashData.slice(i, i + doordashBatchSize);
    await db.insert(doordashTransactions).values(batch).onConflictDoNothing();
    console.log(`   Progress: ${Math.min(i + doordashBatchSize, doordashData.length)}/${doordashData.length}`);
  }
  console.log(`   ✅ Imported ${doordashData.length} DoorDash transactions`);
  console.log();
  
  console.log("Step 7: Importing Grubhub transactions...");
  const grubhubBatchSize = 1000;
  for (let i = 0; i < grubhubData.length; i += grubhubBatchSize) {
    const batch = grubhubData.slice(i, i + grubhubBatchSize);
    await db.insert(grubhubTransactions).values(batch).onConflictDoNothing();
    console.log(`   Progress: ${Math.min(i + grubhubBatchSize, grubhubData.length)}/${grubhubData.length}`);
  }
  console.log(`   ✅ Imported ${grubhubData.length} Grubhub transactions`);
  console.log();
  
  console.log("Step 8: Importing platform ad spend...");
  await db.insert(platformAdSpend).values(adSpendData).onConflictDoNothing();
  console.log(`   ✅ Imported ${adSpendData.length} ad spend records`);
  console.log();
  
  // Verify import
  console.log("Step 9: Verifying import...");
  const verificationResult = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM clients) as clients,
      (SELECT COUNT(*) FROM locations) as locations,
      (SELECT COUNT(*) FROM uber_eats_transactions) as uber_eats,
      (SELECT COUNT(*) FROM doordash_transactions) as doordash,
      (SELECT COUNT(*) FROM grubhub_transactions) as grubhub,
      (SELECT COUNT(*) FROM platform_ad_spend) as ad_spend
  `);
  
  const counts = verificationResult.rows[0];
  console.log();
  console.log("   Verification:");
  console.log(`   - Clients: ${counts.clients} (expected: ${manifest.counts.clients})`);
  console.log(`   - Locations: ${counts.locations} (expected: ${manifest.counts.locations})`);
  console.log(`   - Uber Eats: ${counts.uber_eats} (expected: ${manifest.counts.uberEatsTransactions})`);
  console.log(`   - DoorDash: ${counts.doordash} (expected: ${manifest.counts.doordashTransactions})`);
  console.log(`   - Grubhub: ${counts.grubhub} (expected: ${manifest.counts.grubhubTransactions})`);
  console.log(`   - Ad Spend: ${counts.ad_spend} (expected: ${manifest.counts.platformAdSpend})`);
  console.log();
  
  return {
    manifest,
    imported: counts,
  };
}

importProductionData()
  .then((result) => {
    console.log("✅ Import complete!");
    console.log();
    console.log("Next steps:");
    console.log("1. Verify the dashboard displays data correctly");
    console.log("2. Test filtering and analytics features");
    console.log("3. Perform end-to-end testing");
    console.log();
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Import failed:", error);
    console.error();
    console.error("RECOVERY INSTRUCTIONS:");
    console.error("1. Stop the application");
    console.error("2. In Replit Console: Drop and recreate production database");
    console.error("3. Run schema migration: npm run db:push");
    console.error("4. Fix the error and retry import");
    console.error("5. Verify data after successful import");
    console.error();
    process.exit(1);
  });
