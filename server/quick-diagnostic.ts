import { db } from './db';
import { sql } from 'drizzle-orm';

async function quickDiagnostic() {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 QUICK DATA DIAGNOSTIC - Identifying Missing & Inaccurate Data');
  console.log('='.repeat(80) + '\n');

  // 1. Overall transaction counts by platform
  console.log('📊 OVERALL TRANSACTION COUNTS BY PLATFORM');
  const ubereatsTotal = await db.execute(sql`SELECT COUNT(*) as count FROM uber_eats_transactions`);
  const doordashTotal = await db.execute(sql`SELECT COUNT(*) as count FROM doordash_transactions WHERE (channel = 'Marketplace' OR channel IS NULL)`);
  const grubhubTotal = await db.execute(sql`SELECT COUNT(*) as count FROM grubhub_transactions`);
  
  console.log(`   Uber Eats: ${Number(ubereatsTotal.rows[0].count).toLocaleString()} transactions`);
  console.log(`   DoorDash (Marketplace): ${Number(doordashTotal.rows[0].count).toLocaleString()} transactions`);
  console.log(`   Grubhub: ${Number(grubhubTotal.rows[0].count).toLocaleString()} transactions`);

  // 2. Unmapped transactions
  console.log('\n❌ UNMAPPED TRANSACTIONS (Critical Issue)');
  const unmappedUber = await db.execute(sql`
    SELECT COUNT(*) as count FROM uber_eats_transactions WHERE location_id IS NULL
  `);
  const unmappedDoor = await db.execute(sql`
    SELECT COUNT(*) as count FROM doordash_transactions 
    WHERE location_id IS NULL AND (channel = 'Marketplace' OR channel IS NULL)
  `);
  const unmappedGrub = await db.execute(sql`
    SELECT COUNT(*) as count FROM grubhub_transactions WHERE location_id IS NULL
  `);

  const uberUnmapped = Number(unmappedUber.rows[0].count);
  const doorUnmapped = Number(unmappedDoor.rows[0].count);
  const grubUnmapped = Number(unmappedGrub.rows[0].count);

  console.log(`   Uber Eats: ${uberUnmapped.toLocaleString()} unmapped (${((uberUnmapped / Number(ubereatsTotal.rows[0].count)) * 100).toFixed(1)}%)`);
  console.log(`   DoorDash: ${doorUnmapped.toLocaleString()} unmapped (${((doorUnmapped / Number(doordashTotal.rows[0].count)) * 100).toFixed(1)}%)`);
  console.log(`   Grubhub: ${grubUnmapped.toLocaleString()} unmapped (${((grubUnmapped / Number(grubhubTotal.rows[0].count)) * 100).toFixed(1)}%)`);

  // 3. Sample unmapped locations
  if (uberUnmapped > 0) {
    console.log('\n   🔍 Uber Eats - Sample unmapped locations (first 10):');
    const samples = await db.execute(sql`
      SELECT DISTINCT location, COUNT(*) as txn_count
      FROM uber_eats_transactions 
      WHERE location_id IS NULL AND location IS NOT NULL AND location != ''
      GROUP BY location
      ORDER BY txn_count DESC
      LIMIT 10
    `);
    samples.rows.forEach((row: any) => {
      console.log(`      "${row.location}" (${row.txn_count} transactions)`);
    });
  }

  if (doorUnmapped > 0) {
    console.log('\n   🔍 DoorDash - Sample unmapped locations (first 10):');
    const samples = await db.execute(sql`
      SELECT DISTINCT store_location, COUNT(*) as txn_count
      FROM doordash_transactions 
      WHERE location_id IS NULL AND (channel = 'Marketplace' OR channel IS NULL)
      AND store_location IS NOT NULL AND store_location != ''
      GROUP BY store_location
      ORDER BY txn_count DESC
      LIMIT 10
    `);
    samples.rows.forEach((row: any) => {
      console.log(`      "${row.store_location}" (${row.txn_count} transactions)`);
    });
  }

  if (grubUnmapped > 0) {
    console.log('\n   🔍 Grubhub - Sample unmapped locations (first 10):');
    const samples = await db.execute(sql`
      SELECT DISTINCT restaurant, COUNT(*) as txn_count
      FROM grubhub_transactions 
      WHERE location_id IS NULL
      GROUP BY restaurant
      ORDER BY txn_count DESC
      LIMIT 10
    `);
    samples.rows.forEach((row: any) => {
      console.log(`      "${row.restaurant}" (${row.txn_count} transactions)`);
    });
  }

  // 4. Location coverage by platform
  console.log('\n📍 LOCATION COVERAGE BY PLATFORM');
  const totalLocs = await db.execute(sql`SELECT COUNT(*) as count FROM locations`);
  const uberLocs = await db.execute(sql`SELECT COUNT(DISTINCT location_id) as count FROM uber_eats_transactions WHERE location_id IS NOT NULL`);
  const doorLocs = await db.execute(sql`SELECT COUNT(DISTINCT location_id) as count FROM doordash_transactions WHERE location_id IS NOT NULL AND (channel = 'Marketplace' OR channel IS NULL)`);
  const grubLocs = await db.execute(sql`SELECT COUNT(DISTINCT location_id) as count FROM grubhub_transactions WHERE location_id IS NOT NULL`);

  console.log(`   Total Locations in Database: ${Number(totalLocs.rows[0].count)}`);
  console.log(`   Uber Eats Coverage: ${Number(uberLocs.rows[0].count)} locations (${((Number(uberLocs.rows[0].count) / Number(totalLocs.rows[0].count)) * 100).toFixed(1)}%)`);
  console.log(`   DoorDash Coverage: ${Number(doorLocs.rows[0].count)} locations (${((Number(doorLocs.rows[0].count) / Number(totalLocs.rows[0].count)) * 100).toFixed(1)}%)`);
  console.log(`   Grubhub Coverage: ${Number(grubLocs.rows[0].count)} locations (${((Number(grubLocs.rows[0].count) / Number(totalLocs.rows[0].count)) * 100).toFixed(1)}%)`);

  // 5. Locations with all 3 platforms
  const all3Platforms = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM locations l
    WHERE EXISTS (SELECT 1 FROM uber_eats_transactions WHERE location_id = l.id)
      AND EXISTS (SELECT 1 FROM doordash_transactions WHERE location_id = l.id AND (channel = 'Marketplace' OR channel IS NULL))
      AND EXISTS (SELECT 1 FROM grubhub_transactions WHERE location_id = l.id)
  `);
  console.log(`   Locations with ALL 3 platforms: ${Number(all3Platforms.rows[0].count)} (${((Number(all3Platforms.rows[0].count) / Number(totalLocs.rows[0].count)) * 100).toFixed(1)}%)`);

  // 6. Date ranges by platform
  console.log('\n📅 DATE RANGES BY PLATFORM');
  const uberDates = await db.execute(sql`
    SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT date) as unique_dates
    FROM uber_eats_transactions WHERE location_id IS NOT NULL
  `);
  const doorDates = await db.execute(sql`
    SELECT MIN(transaction_date::date) as min_date, MAX(transaction_date::date) as max_date, 
           COUNT(DISTINCT transaction_date::date) as unique_dates
    FROM doordash_transactions 
    WHERE location_id IS NOT NULL AND (channel = 'Marketplace' OR channel IS NULL)
  `);
  const grubDates = await db.execute(sql`
    SELECT MIN(order_date) as min_date, MAX(order_date) as max_date, COUNT(DISTINCT order_date) as unique_dates
    FROM grubhub_transactions WHERE location_id IS NOT NULL
  `);

  console.log(`   Uber Eats: ${uberDates.rows[0].min_date} to ${uberDates.rows[0].max_date} (${uberDates.rows[0].unique_dates} unique dates)`);
  console.log(`   DoorDash: ${doorDates.rows[0].min_date} to ${doorDates.rows[0].max_date} (${doorDates.rows[0].unique_dates} unique dates)`);
  console.log(`   Grubhub: ${grubDates.rows[0].min_date} to ${grubDates.rows[0].max_date} (${grubDates.rows[0].unique_dates} unique dates)`);

  // 7. Top 20 locations by transaction volume (all platforms combined)
  console.log('\n🏆 TOP 20 LOCATIONS BY TRANSACTION VOLUME');
  const topLocations = await db.execute(sql`
    SELECT 
      l.store_id,
      l.canonical_name,
      (SELECT COUNT(*) FROM uber_eats_transactions WHERE location_id = l.id) as uber_count,
      (SELECT COUNT(*) FROM doordash_transactions WHERE location_id = l.id AND (channel = 'Marketplace' OR channel IS NULL)) as door_count,
      (SELECT COUNT(*) FROM grubhub_transactions WHERE location_id = l.id) as grub_count,
      (SELECT COUNT(*) FROM uber_eats_transactions WHERE location_id = l.id) +
      (SELECT COUNT(*) FROM doordash_transactions WHERE location_id = l.id AND (channel = 'Marketplace' OR channel IS NULL)) +
      (SELECT COUNT(*) FROM grubhub_transactions WHERE location_id = l.id) as total_count
    FROM locations l
    ORDER BY total_count DESC
    LIMIT 20
  `);

  console.log('   Store ID | Location | Uber | DD | GH | Total');
  console.log('   ' + '-'.repeat(70));
  topLocations.rows.forEach((row: any) => {
    const uber = row.uber_count > 0 ? String(row.uber_count).padStart(4) : '  -';
    const door = row.door_count > 0 ? String(row.door_count).padStart(4) : '  -';
    const grub = row.grub_count > 0 ? String(row.grub_count).padStart(4) : '  -';
    const storeId = (row.store_id || 'N/A').padEnd(8);
    const name = (row.canonical_name || 'Unknown').slice(0, 20).padEnd(20);
    console.log(`   ${storeId} | ${name} | ${uber} | ${door} | ${grub} | ${String(row.total_count).padStart(5)}`);
  });

  // 8. Locations with ZERO data
  const zeroDataLocs = await db.execute(sql`
    SELECT l.store_id, l.canonical_name
    FROM locations l
    WHERE NOT EXISTS (SELECT 1 FROM uber_eats_transactions WHERE location_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM doordash_transactions WHERE location_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM grubhub_transactions WHERE location_id = l.id)
    LIMIT 30
  `);

  if (zeroDataLocs.rows.length > 0) {
    console.log(`\n⚠️  LOCATIONS WITH ZERO DATA (${zeroDataLocs.rows.length}+ total, showing first 30)`);
    zeroDataLocs.rows.forEach((row: any) => {
      console.log(`   ${row.store_id} - ${row.canonical_name}`);
    });
  }

  // 9. CRITICAL ISSUES SUMMARY
  console.log('\n' + '='.repeat(80));
  console.log('🚨 CRITICAL ISSUES SUMMARY');
  console.log('='.repeat(80));
  
  const issues: string[] = [];
  
  if (uberUnmapped > 50000) {
    issues.push(`❌ ${uberUnmapped.toLocaleString()} Uber Eats transactions are unmapped (${((uberUnmapped / Number(ubereatsTotal.rows[0].count)) * 100).toFixed(1)}%)`);
  }
  if (doorUnmapped > 100) {
    issues.push(`❌ ${doorUnmapped.toLocaleString()} DoorDash transactions are unmapped`);
  }
  if (grubUnmapped > 100) {
    issues.push(`❌ ${grubUnmapped.toLocaleString()} Grubhub transactions are unmapped`);
  }
  if (Number(uberLocs.rows[0].count) < Number(totalLocs.rows[0].count) * 0.5) {
    issues.push(`⚠️  Only ${((Number(uberLocs.rows[0].count) / Number(totalLocs.rows[0].count)) * 100).toFixed(1)}% of locations have Uber Eats data`);
  }
  if (zeroDataLocs.rows.length > 50) {
    issues.push(`⚠️  ${zeroDataLocs.rows.length}+ locations have ZERO transaction data across all platforms`);
  }

  if (issues.length === 0) {
    console.log('✅ No critical issues detected!');
  } else {
    issues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
  }

  // 10. ACTIONABLE RECOMMENDATIONS
  console.log('\n' + '='.repeat(80));
  console.log('💡 ACTIONABLE RECOMMENDATIONS FOR DATA IMPORT');
  console.log('='.repeat(80));
  
  console.log('\n1️⃣  FIX UNMAPPED UBER EATS TRANSACTIONS');
  console.log('   Problem: Large number of Uber Eats transactions cannot be matched to locations');
  console.log('   Solution:');
  console.log('   a) Export the unmapped location names and store codes from database');
  console.log('   b) Update the Google Sheet master location mapping with missing entries');
  console.log('   c) Re-upload the Uber Eats payment reports');
  console.log('   Alternative: Fix location extraction logic if it\'s a code issue\n');

  console.log('2️⃣  COMPLETE MISSING PLATFORM DATA');
  console.log('   Problem: Many locations missing data from one or more platforms');
  console.log('   Solution:');
  console.log('   a) Identify which locations are active on each platform');
  console.log('   b) Download payment/transaction reports for missing platforms');
  console.log('   c) Upload reports through the dashboard upload page\n');

  console.log('3️⃣  VERIFY DATE RANGES');
  console.log('   Problem: Need to ensure complete data coverage for analysis period');
  console.log('   Solution:');
  console.log('   a) Download reports for full date range needed (e.g., last 3 months)');
  console.log('   b) Upload any missing weeks');
  console.log('   c) Verify no gaps in weekly data\n');

  console.log('\n' + '='.repeat(80));
  console.log('✅ Diagnostic Complete');
  console.log('='.repeat(80) + '\n');
}

quickDiagnostic().catch(console.error);
