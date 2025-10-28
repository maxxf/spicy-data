import { writeFileSync } from "fs";
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
  counts: {
    clients: number;
    locations: number;
    uberEatsTransactions: number;
    doordashTransactions: number;
    grubhubTransactions: number;
    platformAdSpend: number;
  };
  checksums: {
    clients: string;
    locations: string;
    uberEatsTransactions: string;
    doordashTransactions: string;
    grubhubTransactions: string;
    platformAdSpend: string;
  };
}

function calculateChecksum(data: any[]): string {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(data));
  return hash.digest("hex");
}

async function exportProductionData() {
  console.log("📦 EXPORTING PRODUCTION DATA");
  console.log("=" .repeat(80));
  console.log();
  
  const exportDir = "production-export";
  
  // Create export directory
  try {
    await import("fs/promises").then(fs => fs.mkdir(exportDir, { recursive: true }));
  } catch (error) {
    // Directory may already exist
  }
  
  console.log("Step 1: Exporting clients...");
  const clientsData = await db.select().from(clients);
  const clientsPath = `${exportDir}/clients.json`;
  writeFileSync(clientsPath, JSON.stringify(clientsData, null, 2));
  console.log(`   ✅ Exported ${clientsData.length} clients to ${clientsPath}`);
  console.log();
  
  console.log("Step 2: Exporting locations...");
  const locationsData = await db.select().from(locations);
  const locationsPath = `${exportDir}/locations.json`;
  writeFileSync(locationsPath, JSON.stringify(locationsData, null, 2));
  console.log(`   ✅ Exported ${locationsData.length} locations to ${locationsPath}`);
  console.log();
  
  console.log("Step 3: Exporting Uber Eats transactions...");
  const uberData = await db.select().from(uberEatsTransactions);
  const uberPath = `${exportDir}/uber-eats-transactions.json`;
  writeFileSync(uberPath, JSON.stringify(uberData, null, 2));
  console.log(`   ✅ Exported ${uberData.length} transactions to ${uberPath}`);
  console.log();
  
  console.log("Step 4: Exporting DoorDash transactions...");
  const doordashData = await db.select().from(doordashTransactions);
  const doordashPath = `${exportDir}/doordash-transactions.json`;
  writeFileSync(doordashPath, JSON.stringify(doordashData, null, 2));
  console.log(`   ✅ Exported ${doordashData.length} transactions to ${doordashPath}`);
  console.log();
  
  console.log("Step 5: Exporting Grubhub transactions...");
  const grubhubData = await db.select().from(grubhubTransactions);
  const grubhubPath = `${exportDir}/grubhub-transactions.json`;
  writeFileSync(grubhubPath, JSON.stringify(grubhubData, null, 2));
  console.log(`   ✅ Exported ${grubhubData.length} transactions to ${grubhubPath}`);
  console.log();
  
  console.log("Step 6: Exporting platform ad spend...");
  const adSpendData = await db.select().from(platformAdSpend);
  const adSpendPath = `${exportDir}/platform-ad-spend.json`;
  writeFileSync(adSpendPath, JSON.stringify(adSpendData, null, 2));
  console.log(`   ✅ Exported ${adSpendData.length} ad spend records to ${adSpendPath}`);
  console.log();
  
  console.log("Step 7: Generating manifest and checksums...");
  const manifest: ExportManifest = {
    exportDate: new Date().toISOString(),
    version: "1.0.0",
    counts: {
      clients: clientsData.length,
      locations: locationsData.length,
      uberEatsTransactions: uberData.length,
      doordashTransactions: doordashData.length,
      grubhubTransactions: grubhubData.length,
      platformAdSpend: adSpendData.length,
    },
    checksums: {
      clients: calculateChecksum(clientsData),
      locations: calculateChecksum(locationsData),
      uberEatsTransactions: calculateChecksum(uberData),
      doordashTransactions: calculateChecksum(doordashData),
      grubhubTransactions: calculateChecksum(grubhubData),
      platformAdSpend: calculateChecksum(adSpendData),
    },
  };
  
  const manifestPath = `${exportDir}/manifest.json`;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`   ✅ Generated manifest: ${manifestPath}`);
  console.log();
  
  console.log("📊 EXPORT SUMMARY:");
  console.log("=" .repeat(80));
  console.log();
  console.log(`   Export directory: ${exportDir}/`);
  console.log(`   Export date: ${manifest.exportDate}`);
  console.log();
  console.log("   Data counts:");
  console.log(`   - Clients: ${manifest.counts.clients}`);
  console.log(`   - Locations: ${manifest.counts.locations}`);
  console.log(`   - Uber Eats transactions: ${manifest.counts.uberEatsTransactions.toLocaleString()}`);
  console.log(`   - DoorDash transactions: ${manifest.counts.doordashTransactions.toLocaleString()}`);
  console.log(`   - Grubhub transactions: ${manifest.counts.grubhubTransactions.toLocaleString()}`);
  console.log(`   - Platform ad spend: ${manifest.counts.platformAdSpend}`);
  console.log();
  console.log("   Total transactions: " + (
    manifest.counts.uberEatsTransactions +
    manifest.counts.doordashTransactions +
    manifest.counts.grubhubTransactions
  ).toLocaleString());
  console.log();
  
  // Additional statistics
  console.log("📈 DATA QUALITY METRICS:");
  console.log("=" .repeat(80));
  
  const mappingStats = await db.execute(sql`
    SELECT 
      'Uber Eats' as platform,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE l.location_tag = 'master') as mapped_to_master,
      ROUND(100.0 * COUNT(*) FILTER (WHERE l.location_tag = 'master') / COUNT(*), 2) as pct_master
    FROM uber_eats_transactions ue
    LEFT JOIN locations l ON ue.location_id = l.id
    
    UNION ALL
    
    SELECT 
      'DoorDash',
      COUNT(*),
      COUNT(*) FILTER (WHERE l.location_tag = 'master'),
      ROUND(100.0 * COUNT(*) FILTER (WHERE l.location_tag = 'master') / COUNT(*), 2)
    FROM doordash_transactions dd
    LEFT JOIN locations l ON dd.location_id = l.id
    
    UNION ALL
    
    SELECT 
      'Grubhub',
      COUNT(*),
      COUNT(*) FILTER (WHERE l.location_tag = 'master'),
      ROUND(100.0 * COUNT(*) FILTER (WHERE l.location_tag = 'master') / COUNT(*), 2)
    FROM grubhub_transactions gh
    LEFT JOIN locations l ON gh.location_id = l.id
  `);
  
  console.log();
  console.log("   Transaction mapping rates:");
  for (const row of mappingStats.rows) {
    console.log(`   - ${row.platform}: ${row.pct_master}% mapped to master locations`);
  }
  console.log();
  
  return {
    exportDir,
    manifest,
  };
}

exportProductionData()
  .then((result) => {
    console.log("✅ Export complete!");
    console.log();
    console.log("Next steps:");
    console.log(`1. Review the exported data in ${result.exportDir}/`);
    console.log("2. Verify checksums match expected values");
    console.log("3. Use the import script to load data into production database");
    console.log();
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Export failed:", error);
    process.exit(1);
  });
