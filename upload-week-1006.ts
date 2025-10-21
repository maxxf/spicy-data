import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = 'http://localhost:5000';
const CLIENT_ID = '83506705-b408-4f0a-a9b0-e5b585db3b7d'; // Capriotti's

async function uploadInBatches<T>(
  records: T[],
  batchSize: number,
  uploadFn: (batch: T[]) => Promise<void>,
  label: string
) {
  console.log(`\n📦 Uploading ${records.length} ${label} in batches of ${batchSize}...`);
  
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(records.length / batchSize);
    
    console.log(`  Batch ${batchNum}/${totalBatches}: Uploading ${batch.length} records...`);
    
    try {
      await uploadFn(batch);
      console.log(`  ✓ Batch ${batchNum}/${totalBatches} completed`);
    } catch (error: any) {
      console.error(`  ✗ Batch ${batchNum}/${totalBatches} failed:`, error.message);
      throw error;
    }
  }
  
  console.log(`✅ All ${label} uploaded successfully!`);
}

async function uploadUberEats() {
  const csvPath = path.join(__dirname, 'attached_assets/abd32c28-5d15-462f-ac47-1e80348c0bd8-united_states (1)_1761020000931.csv');
  const fileBuffer = fs.readFileSync(csvPath);

  console.log(`\n🚀 Uber Eats: Uploading file...`);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'text/csv' });
  
  formData.append('file', blob, 'uber_eats.csv');
  formData.append('platform', 'ubereats');
  formData.append('clientId', CLIENT_ID);

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  
  const result = await response.json();
  console.log(`✅ Uber Eats upload completed: ${JSON.stringify(result)}`);
}

async function uploadDoorDash() {
  const csvPath = path.join(__dirname, 'attached_assets/financials_simplified_transactions_us_2025-10-06_2025-10-12_n9mP1_2025-10-21T04-12-40Z_1761020000932.csv');
  const fileBuffer = fs.readFileSync(csvPath);

  console.log(`\n🚀 DoorDash: Uploading file...`);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'text/csv' });
  
  formData.append('file', blob, 'doordash.csv');
  formData.append('platform', 'doordash');
  formData.append('clientId', CLIENT_ID);

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  
  const result = await response.json();
  console.log(`✅ DoorDash upload completed: ${JSON.stringify(result)}`);
}

async function uploadGrubhub() {
  const csvPath = path.join(__dirname, 'attached_assets/Grubhub_Payments_-_Last_week__1761020000932.csv');
  const fileBuffer = fs.readFileSync(csvPath);

  console.log(`\n🚀 Grubhub: Uploading file...`);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'text/csv' });
  
  formData.append('file', blob, 'grubhub.csv');
  formData.append('platform', 'grubhub');
  formData.append('clientId', CLIENT_ID);

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }
  
  const result = await response.json();
  console.log(`✅ Grubhub upload completed: ${JSON.stringify(result)}`);
}

async function main() {
  console.log('🎯 Starting Week 10/6-10/12 Upload Process...\n');
  console.log('=' .repeat(60));
  
  try {
    await uploadUberEats();
    await uploadDoorDash();
    await uploadGrubhub();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Week 10/6-10/12 upload completed successfully!');
    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('\n❌ Upload failed:', error);
    process.exit(1);
  }
}

main();
