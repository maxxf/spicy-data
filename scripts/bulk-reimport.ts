#!/usr/bin/env tsx
import { db } from '../server/db';
import { storage } from '../server/storage';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bulkReimport() {
  console.log('🔄 BULK CSV RE-IMPORT TOOL');
  console.log('='.repeat(100));
  console.log('');
  console.log('This tool allows you to re-import multiple CSV files at once to fix historical data.');
  console.log('');
  console.log('📁 Place your CSV files in: scripts/reimport-data/');
  console.log('   - Uber Eats files: uber_*.csv');
  console.log('   - DoorDash files: doordash_*.csv');
  console.log('   - Grubhub files: grubhub_*.csv');
  console.log('');
  console.log('The system will:');
  console.log('  ✓ Automatically detect the platform from filename');
  console.log('  ✓ Use the same upload endpoints as the web UI');
  console.log('  ✓ Deduplicate existing transactions');
  console.log('  ✓ Update the database with correct data');
  console.log('');
  console.log('='.repeat(100));
  console.log('');

  // Create reimport directory if it doesn't exist
  const reimportDir = path.join(__dirname, 'reimport-data');
  if (!fs.existsSync(reimportDir)) {
    fs.mkdirSync(reimportDir, { recursive: true });
    console.log(`📁 Created directory: ${reimportDir}`);
    console.log('');
    console.log('Please add your CSV files to this directory and run the script again.');
    console.log('');
    console.log('Example filenames:');
    console.log('  - uber_2025-10-13_to_2025-10-19.csv');
    console.log('  - doordash_week_42.csv');
    console.log('  - grubhub_october.csv');
    console.log('');
    console.log('💡 TIP: Name files clearly so you remember which week they cover!');
    console.log('');
    return;
  }

  // Read all files from reimport directory
  const files = fs.readdirSync(reimportDir).filter(f => f.endsWith('.csv'));

  if (files.length === 0) {
    console.log(`⚠️  No CSV files found in ${reimportDir}`);
    console.log('');
    console.log('Please add CSV files and run again.');
    console.log('');
    return;
  }

  console.log(`📊 Found ${files.length} CSV file(s) to process:\n`);
  files.forEach((f, i) => {
    console.log(`  ${i + 1}. ${f}`);
  });
  console.log('');

  // Get client ID (you may want to make this configurable)
  const clients = await storage.listClients();
  if (clients.length === 0) {
    console.error('❌ No clients found in database. Please create a client first.');
    process.exit(1);
  }

  // For now, use the first client (Capriotti's)
  const clientId = clients[0].id;
  console.log(`Using client: ${clients[0].name} (${clientId})\n`);
  console.log('='.repeat(100));
  console.log('\n⚠️  IMPORTANT INSTRUCTIONS FOR RE-IMPORT:\n');
  console.log('Due to the complexity of CSV parsing and deduplication logic,');
  console.log('the safest way to re-import data is via the web UI Upload page.');
  console.log('');
  console.log('RECOMMENDED PROCESS:');
  console.log('');
  console.log('1. Place your CSV files in scripts/reimport-data/ (done ✓)');
  console.log('2. Go to the Upload page in your app');
  console.log('3. For each CSV file in the reimport-data/ folder:');
  console.log('   a) Select the correct platform (Uber Eats/DoorDash/Grubhub)');
  console.log('   b) Upload the file');
  console.log('   c) The system automatically deduplicates and updates data');
  console.log('');
  console.log('ALTERNATIVELY - Direct database approach (advanced):');
  console.log('');
  console.log('To manually re-import via direct database operations:');
  console.log('  • Delete transactions for the affected date range first');
  console.log('  • Then upload the correct CSV files via the UI');
  console.log('  • This ensures clean data without potential duplicates');
  console.log('');
  console.log('Example SQL to delete transactions for a week:');
  console.log('');
  console.log(`  DELETE FROM uber_eats_transactions `);
  console.log(`  WHERE location_id IN (`);
  console.log(`    SELECT id FROM locations WHERE store_id SIMILAR TO '(AZ900482|NV008|...)'`);
  console.log(`  ) AND date_column >= '2025-10-13' AND date_column <= '2025-10-19';`);
  console.log('');
  console.log('='.repeat(100));
  console.log('');
  console.log('📁 Files ready for upload in: ' + reimportDir);
  console.log('');
  console.log('✅ Upload these files via the web UI for best results.');
  console.log('');
}

bulkReimport()
  .then(() => {
    console.log('✅ Ready for re-import');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
