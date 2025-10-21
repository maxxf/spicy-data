import { DbStorage } from "../server/db-storage";

const CAPRIOTTIS_CLIENT_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

const DOORDASH_FILES = [
  "attached_assets/financials_simplified_transactions_us_2025-09-08_2025-09-14_Hqdxm_2025-10-21T15-58-24Z_1761063047050.csv",
  "attached_assets/financials_simplified_transactions_us_2025-09-15_2025-09-21_N5yvt_2025-10-21T15-57-40Z_1761063055203.csv",
  "attached_assets/financials_simplified_transactions_us_2025-09-22_2025-09-28_JBp3r_2025-10-21T03-56-20Z_1761063063856.csv",
  "attached_assets/financials_simplified_transactions_us_2025-09-29_2025-10-05_2QIOm_2025-10-21T16-11-32Z_1761063150457.csv",
  "attached_assets/financials_simplified_transactions_us_2025-10-06_2025-10-12_n9mP1_2025-10-21T04-12-40Z_1761063163914.csv",
  "attached_assets/financials_simplified_transactions_us_2025-10-13_2025-10-19_dCiqE_2025-10-21T03-57-54Z_1761063169575.csv",
];

async function uploadDoorDashCSV(storage: DbStorage, filepath: string): Promise<number> {
  console.log(`\nUploading: ${filepath}`);
  
  const formData = new FormData();
  const fs = await import('fs');
  const fileContent = fs.readFileSync(filepath);
  const blob = new Blob([fileContent]);
  
  formData.append('file', blob, filepath);
  formData.append('clientId', CAPRIOTTIS_CLIENT_ID);
  formData.append('platform', 'doordash');
  
  const response = await fetch('http://localhost:5000/api/transactions/upload', {
    method: 'POST',
    body: formData,
  });
  
  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(`Upload failed: ${JSON.stringify(result)}`);
  }
  
  console.log(`  ✓ Uploaded ${result.uploadedCount} transactions`);
  return result.uploadedCount;
}

async function main() {
  const storage = new DbStorage();
  
  console.log("=== Re-uploading DoorDash CSVs with corrected parser ===\n");
  console.log(`Found ${DOORDASH_FILES.length} DoorDash CSV files`);
  
  let totalUploaded = 0;
  
  for (const file of DOORDASH_FILES) {
    try {
      const count = await uploadDoorDashCSV(storage, file);
      totalUploaded += count;
    } catch (error: any) {
      console.error(`  ✗ Error uploading ${file}:`, error.message);
    }
  }
  
  console.log(`\n✅ Re-upload complete!`);
  console.log(`   Total transactions uploaded: ${totalUploaded.toLocaleString()}`);
  
  // Verify the data
  console.log(`\n📊 Verifying week 9/8 data...`);
  const weekData = await fetch(
    `http://localhost:5000/api/analytics/overview?clientId=${CAPRIOTTIS_CLIENT_ID}&weekStart=2025-09-08&weekEnd=2025-09-14`
  );
  const analytics = await weekData.json();
  
  const ddPlatform = analytics.platformBreakdown.find((p: any) => p.platform === 'doordash');
  if (ddPlatform) {
    console.log(`\nDoorDash Week 9/8 Results:`);
    console.log(`  Ad Spend: $${ddPlatform.adSpend.toFixed(2)}`);
    console.log(`  Offers: $${ddPlatform.offerDiscountValue.toFixed(2)}`);
    console.log(`  Total Marketing: $${ddPlatform.totalMarketingInvestment.toFixed(2)}`);
    console.log(`  Expected: $32,821`);
  }
}

main().catch(console.error);
