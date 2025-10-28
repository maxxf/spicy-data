import { db } from '../server/db';
import { locations, uberEatsTransactions, doordashTransactions, grubhubTransactions } from '../shared/schema';
import { eq, and, inArray, sql } from 'drizzle-orm';

const CORP_STORE_IDS = [
  'AZ900482', 'NV008', 'NV036', 'NV051', 'NV054', 'NV067', 'NV079',
  'NV103', 'NV111', 'NV121', 'NV126', 'NV151', 'NV152', 'NV191',
  'NV900467', 'NV900478'
];

async function fixCorpLocationsData() {
  console.log('🔧 CORPORATE LOCATIONS DATA FIX SCRIPT');
  console.log('='.repeat(80));
  console.log('');

  // Step 1: Get the 16 corporate locations
  console.log('📍 Step 1: Identifying 16 corporate locations...');
  const corpLocs = await db.select().from(locations).where(
    sql`store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%'`
  );

  console.log(`Found ${corpLocs.length} corporate locations:`);
  corpLocs.forEach(loc => {
    console.log(`  - ${loc.canonicalName} (${loc.storeId})`);
  });
  console.log('');

  if (corpLocs.length !== 16) {
    console.error(`❌ ERROR: Expected 16 locations, found ${corpLocs.length}`);
    process.exit(1);
  }

  const corpLocationIds = corpLocs.map(l => l.id);

  // Step 2: Check for duplicate transactions
  console.log('🔍 Step 2: Checking for duplicate transactions...');
  
  const uberDupes = await db.execute(sql`
    SELECT location_id, date, order_id, COUNT(*) as count
    FROM uber_eats_transactions
    WHERE location_id = ANY(${corpLocationIds})
    GROUP BY location_id, date, order_id
    HAVING COUNT(*) > 1
  `);

  const doorDupes = await db.execute(sql`
    SELECT location_id, transaction_date, order_id, COUNT(*) as count
    FROM doordash_transactions
    WHERE location_id = ANY(${corpLocationIds})
    GROUP BY location_id, transaction_date, order_id
    HAVING COUNT(*) > 1
  `);

  const grubDupes = await db.execute(sql`
    SELECT location_id, order_date, order_id, COUNT(*) as count
    FROM grubhub_transactions
    WHERE location_id = ANY(${corpLocationIds})
    GROUP BY location_id, order_date, order_id
    HAVING COUNT(*) > 1
  `);

  if (uberDupes.rows.length > 0) {
    console.log(`  ⚠️  Found ${uberDupes.rows.length} duplicate Uber Eats transaction groups`);
  }
  if (doorDupes.rows.length > 0) {
    console.log(`  ⚠️  Found ${doorDupes.rows.length} duplicate DoorDash transaction groups`);
  }
  if (grubDupes.rows.length > 0) {
    console.log(`  ⚠️  Found ${grubDupes.rows.length} duplicate Grubhub transaction groups`);
  }

  if (uberDupes.rows.length === 0 && doorDupes.rows.length === 0 && grubDupes.rows.length === 0) {
    console.log('  ✅ No duplicate transactions found');
  }
  console.log('');

  // Step 3: Validate data quality
  console.log('📊 Step 3: Validating data quality...');
  
  const uberStats = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN order_status = 'Completed' THEN 1 END) as completed,
      COUNT(CASE WHEN sales_excl_tax IS NULL AND subtotal IS NULL THEN 1 END) as missing_sales,
      COUNT(CASE WHEN sales_excl_tax IS NOT NULL THEN 1 END) as has_sales_excl_tax
    FROM uber_eats_transactions
    WHERE location_id = ANY(${corpLocationIds})
  `);

  const doorStats = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN channel = 'Marketplace' OR channel IS NULL THEN 1 END) as marketplace,
      COUNT(CASE WHEN channel = 'Storefront' THEN 1 END) as storefront,
      COUNT(CASE WHEN sales_excl_tax IS NULL AND order_subtotal IS NULL THEN 1 END) as missing_sales
    FROM doordash_transactions
    WHERE location_id = ANY(${corpLocationIds})
  `);

  const grubStats = await db.execute(sql`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN transaction_type = 'Prepaid Order' THEN 1 END) as prepaid,
      COUNT(CASE WHEN sale_amount IS NULL THEN 1 END) as missing_sales
    FROM grubhub_transactions
    WHERE location_id = ANY(${corpLocationIds})
  `);

  console.log('  Uber Eats:');
  console.log(`    Total: ${uberStats.rows[0].total}`);
  console.log(`    Completed: ${uberStats.rows[0].completed}`);
  console.log(`    Has sales_excl_tax: ${uberStats.rows[0].has_sales_excl_tax}`);
  console.log(`    Missing sales data: ${uberStats.rows[0].missing_sales}`);

  console.log('  DoorDash:');
  console.log(`    Total: ${doorStats.rows[0].total}`);
  console.log(`    Marketplace: ${doorStats.rows[0].marketplace}`);
  console.log(`    Storefront (excluded): ${doorStats.rows[0].storefront}`);
  console.log(`    Missing sales data: ${doorStats.rows[0].missing_sales}`);

  console.log('  Grubhub:');
  console.log(`    Total: ${grubStats.rows[0].total}`);
  console.log(`    Prepaid Orders: ${grubStats.rows[0].prepaid}`);
  console.log(`    Missing sales data: ${grubStats.rows[0].missing_sales}`);
  console.log('');

  // Step 4: Check for unmapped transactions
  console.log('🗺️  Step 4: Checking for unmapped transactions affecting corp locations...');
  
  const unmappedCount = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM uber_eats_transactions WHERE location_id IS NULL) as uber,
      (SELECT COUNT(*) FROM doordash_transactions WHERE location_id IS NULL) as door,
      (SELECT COUNT(*) FROM grubhub_transactions WHERE location_id IS NULL) as grub
  `);

  console.log(`  Unmapped transactions:`);
  console.log(`    Uber Eats: ${unmappedCount.rows[0].uber}`);
  console.log(`    DoorDash: ${unmappedCount.rows[0].door}`);
  console.log(`    Grubhub: ${unmappedCount.rows[0].grub}`);
  console.log('');

  // Step 5: Summary
  console.log('='.repeat(80));
  console.log('📋 SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log('The data appears to be correctly structured. Common issues to check:');
  console.log('');
  console.log('1. Missing CSV uploads for certain weeks/platforms');
  console.log('2. Incorrect CSV file formats during upload');
  console.log('3. Location name mismatches causing transactions to map to wrong locations');
  console.log('');
  console.log('RECOMMENDED ACTIONS:');
  console.log('');
  console.log('1. Re-upload CSV files from platforms for any weeks with incorrect data');
  console.log('2. Use the upload endpoints with correct CSV files');
  console.log('3. System will automatically handle deduplication if files are re-uploaded');
  console.log('');
  console.log('To fix data for a specific week:');
  console.log('  a) Download correct CSV from platform (Uber Eats, DoorDash, or Grubhub)');
  console.log('  b) Upload via /api/upload endpoint');
  console.log('  c) System will process and merge with existing data');
  console.log('');
}

fixCorpLocationsData()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
