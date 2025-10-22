import { db } from './db';
import { 
  locations, 
  uberEatsTransactions, 
  doordashTransactions, 
  grubhubTransactions 
} from '../shared/schema';
import { sql, eq, and, isNull } from 'drizzle-orm';

interface LocationCoverage {
  locationId: string;
  storeId: string;
  canonicalName: string;
  hasUberEats: boolean;
  hasDoorDash: boolean;
  hasGrubhub: boolean;
  uberEatsCount: number;
  doorDashCount: number;
  grubhubCount: number;
  uberEatsDateRange: string;
  doorDashDateRange: string;
  grubhubDateRange: string;
}

interface WeeklyCoverage {
  weekStart: string;
  weekEnd: string;
  uberEatsLocations: number;
  doorDashLocations: number;
  grubhubLocations: number;
  uberEatsTxns: number;
  doorDashTxns: number;
  grubhubTxns: number;
}

interface UnmappedAnalysis {
  platform: string;
  totalUnmapped: number;
  sampleLocations: string[];
  sampleStoreCodes: string[];
}

interface DiagnosticReport {
  overview: {
    totalLocations: number;
    locationsWithAllPlatforms: number;
    locationsWithTwoPlatforms: number;
    locationsWithOnePlatform: number;
    locationsWithZeroPlatforms: number;
  };
  platformCoverage: {
    ubereats: { locations: number; transactions: number; mapped: number; unmapped: number };
    doordash: { locations: number; transactions: number; mapped: number; unmapped: number };
    grubhub: { locations: number; transactions: number; mapped: number; unmapped: number };
  };
  unmappedAnalysis: UnmappedAnalysis[];
  locationCoverage: LocationCoverage[];
  weeklyCoverage: WeeklyCoverage[];
  criticalIssues: string[];
  recommendations: string[];
}

async function runComprehensiveDiagnostic(): Promise<DiagnosticReport> {
  console.log('🔍 Starting Comprehensive Data Diagnostic...\n');

  // Get all locations
  const allLocations = await db.select().from(locations);
  console.log(`Total Locations in Database: ${allLocations.length}`);

  // Platform coverage analysis
  const uberEatsStats = await db.execute(sql`
    SELECT 
      COUNT(DISTINCT location_id) FILTER (WHERE location_id IS NOT NULL) as mapped_locations,
      COUNT(*) FILTER (WHERE location_id IS NOT NULL) as mapped_txns,
      COUNT(*) FILTER (WHERE location_id IS NULL) as unmapped_txns,
      COUNT(*) as total_txns
    FROM uber_eats_transactions
  `);

  const doorDashStats = await db.execute(sql`
    SELECT 
      COUNT(DISTINCT location_id) FILTER (WHERE location_id IS NOT NULL) as mapped_locations,
      COUNT(*) FILTER (WHERE location_id IS NOT NULL AND (channel = 'Marketplace' OR channel IS NULL)) as mapped_txns,
      COUNT(*) FILTER (WHERE location_id IS NULL AND (channel = 'Marketplace' OR channel IS NULL)) as unmapped_txns,
      COUNT(*) FILTER (WHERE (channel = 'Marketplace' OR channel IS NULL)) as total_txns
    FROM doordash_transactions
  `);

  const grubhubStats = await db.execute(sql`
    SELECT 
      COUNT(DISTINCT location_id) FILTER (WHERE location_id IS NOT NULL) as mapped_locations,
      COUNT(*) FILTER (WHERE location_id IS NOT NULL) as mapped_txns,
      COUNT(*) FILTER (WHERE location_id IS NULL) as unmapped_txns,
      COUNT(*) as total_txns
    FROM grubhub_transactions
  `);

  const uberStats = uberEatsStats.rows[0] as any;
  const doorStats = doorDashStats.rows[0] as any;
  const grubStats = grubhubStats.rows[0] as any;

  // Unmapped transaction analysis
  const unmappedUber = await db.execute(sql`
    SELECT DISTINCT restaurant_name, store_label
    FROM uber_eats_transactions
    WHERE location_id IS NULL AND restaurant_name IS NOT NULL
    LIMIT 50
  `);

  const unmappedDoor = await db.execute(sql`
    SELECT DISTINCT location_name
    FROM doordash_transactions
    WHERE location_id IS NULL AND (channel = 'Marketplace' OR channel IS NULL)
    LIMIT 50
  `);

  const unmappedGrub = await db.execute(sql`
    SELECT DISTINCT restaurant_name, store_number
    FROM grubhub_transactions
    WHERE location_id IS NULL
    LIMIT 50
  `);

  // Location-by-location coverage
  const locationCoverage: LocationCoverage[] = [];
  
  for (const loc of allLocations) {
    const uberCount = await db.execute(sql`
      SELECT COUNT(*) as count, MIN(date) as min_date, MAX(date) as max_date
      FROM uber_eats_transactions
      WHERE location_id = ${loc.id}
    `);
    
    const doorCount = await db.execute(sql`
      SELECT COUNT(*) as count, MIN(transaction_date::date) as min_date, MAX(transaction_date::date) as max_date
      FROM doordash_transactions
      WHERE location_id = ${loc.id} AND (channel = 'Marketplace' OR channel IS NULL)
    `);
    
    const grubCount = await db.execute(sql`
      SELECT COUNT(*) as count, MIN(order_date) as min_date, MAX(order_date) as max_date
      FROM grubhub_transactions
      WHERE location_id = ${loc.id}
    `);

    const uber = uberCount.rows[0] as any;
    const door = doorCount.rows[0] as any;
    const grub = grubCount.rows[0] as any;

    locationCoverage.push({
      locationId: loc.id,
      storeId: loc.storeId,
      canonicalName: loc.canonicalName,
      hasUberEats: Number(uber.count) > 0,
      hasDoorDash: Number(door.count) > 0,
      hasGrubhub: Number(grub.count) > 0,
      uberEatsCount: Number(uber.count),
      doorDashCount: Number(door.count),
      grubhubCount: Number(grub.count),
      uberEatsDateRange: uber.min_date && uber.max_date ? `${uber.min_date} to ${uber.max_date}` : 'No data',
      doorDashDateRange: door.min_date && door.max_date ? `${door.min_date} to ${door.max_date}` : 'No data',
      grubhubDateRange: grub.min_date && grub.max_date ? `${grub.min_date} to ${grub.max_date}` : 'No data',
    });
  }

  // Weekly coverage analysis
  const weeklyData = await db.execute(sql`
    WITH weeks AS (
      SELECT DISTINCT 
        DATE_TRUNC('week', transaction_date::date) as week_start,
        DATE_TRUNC('week', transaction_date::date) + INTERVAL '6 days' as week_end
      FROM doordash_transactions
      WHERE transaction_date IS NOT NULL
      UNION
      SELECT DISTINCT 
        DATE_TRUNC('week', order_date) as week_start,
        DATE_TRUNC('week', order_date) + INTERVAL '6 days' as week_end
      FROM grubhub_transactions
      WHERE order_date IS NOT NULL
    )
    SELECT 
      week_start::date as week_start,
      week_end::date as week_end,
      (SELECT COUNT(DISTINCT location_id) FROM doordash_transactions 
       WHERE transaction_date::date BETWEEN week_start AND week_end 
       AND location_id IS NOT NULL AND (channel = 'Marketplace' OR channel IS NULL)) as doordash_locations,
      (SELECT COUNT(DISTINCT location_id) FROM grubhub_transactions 
       WHERE order_date BETWEEN week_start AND week_end 
       AND location_id IS NOT NULL) as grubhub_locations,
      (SELECT COUNT(*) FROM doordash_transactions 
       WHERE transaction_date::date BETWEEN week_start AND week_end 
       AND (channel = 'Marketplace' OR channel IS NULL)) as doordash_txns,
      (SELECT COUNT(*) FROM grubhub_transactions 
       WHERE order_date BETWEEN week_start AND week_end) as grubhub_txns
    FROM weeks
    ORDER BY week_start DESC
    LIMIT 20
  `);

  // Calculate overview stats
  const with3Platforms = locationCoverage.filter(l => l.hasUberEats && l.hasDoorDash && l.hasGrubhub).length;
  const with2Platforms = locationCoverage.filter(l => 
    (l.hasUberEats && l.hasDoorDash && !l.hasGrubhub) ||
    (l.hasUberEats && !l.hasDoorDash && l.hasGrubhub) ||
    (!l.hasUberEats && l.hasDoorDash && l.hasGrubhub)
  ).length;
  const with1Platform = locationCoverage.filter(l => 
    (l.hasUberEats && !l.hasDoorDash && !l.hasGrubhub) ||
    (!l.hasUberEats && l.hasDoorDash && !l.hasGrubhub) ||
    (!l.hasUberEats && !l.hasDoorDash && l.hasGrubhub)
  ).length;
  const with0Platforms = locationCoverage.filter(l => !l.hasUberEats && !l.hasDoorDash && !l.hasGrubhub).length;

  // Identify critical issues
  const criticalIssues: string[] = [];
  const recommendations: string[] = [];

  if (Number(uberStats.unmapped_txns) > 10000) {
    criticalIssues.push(`⚠️ ${uberStats.unmapped_txns} unmapped Uber Eats transactions (${((Number(uberStats.unmapped_txns) / Number(uberStats.total_txns)) * 100).toFixed(1)}%)`);
    recommendations.push('Re-import Uber Eats data with correct location mapping or fix location master sheet');
  }

  if (Number(doorStats.unmapped_txns) > 100) {
    criticalIssues.push(`⚠️ ${doorStats.unmapped_txns} unmapped DoorDash transactions`);
    recommendations.push('Review DoorDash location mapping');
  }

  if (Number(grubStats.unmapped_txns) > 100) {
    criticalIssues.push(`⚠️ ${grubStats.unmapped_txns} unmapped Grubhub transactions`);
    recommendations.push('Review Grubhub location mapping');
  }

  if (with0Platforms > 50) {
    criticalIssues.push(`⚠️ ${with0Platforms} locations have ZERO transactions across all platforms`);
    recommendations.push('These locations may be inactive or data imports are missing');
  }

  const locationsWithoutUber = locationCoverage.filter(l => !l.hasUberEats).length;
  if (locationsWithoutUber > 100) {
    criticalIssues.push(`⚠️ ${locationsWithoutUber} locations missing Uber Eats data`);
    recommendations.push('Import Uber Eats payment reports for missing locations');
  }

  return {
    overview: {
      totalLocations: allLocations.length,
      locationsWithAllPlatforms: with3Platforms,
      locationsWithTwoPlatforms: with2Platforms,
      locationsWithOnePlatform: with1Platform,
      locationsWithZeroPlatforms: with0Platforms,
    },
    platformCoverage: {
      ubereats: {
        locations: Number(uberStats.mapped_locations),
        transactions: Number(uberStats.total_txns),
        mapped: Number(uberStats.mapped_txns),
        unmapped: Number(uberStats.unmapped_txns),
      },
      doordash: {
        locations: Number(doorStats.mapped_locations),
        transactions: Number(doorStats.total_txns),
        mapped: Number(doorStats.mapped_txns),
        unmapped: Number(doorStats.unmapped_txns),
      },
      grubhub: {
        locations: Number(grubStats.mapped_locations),
        transactions: Number(grubStats.total_txns),
        mapped: Number(grubStats.mapped_txns),
        unmapped: Number(grubStats.unmapped_txns),
      },
    },
    unmappedAnalysis: [
      {
        platform: 'Uber Eats',
        totalUnmapped: Number(uberStats.unmapped_txns),
        sampleLocations: unmappedUber.rows.map((r: any) => r.restaurant_name).filter(Boolean).slice(0, 10),
        sampleStoreCodes: unmappedUber.rows.map((r: any) => r.store_label).filter(Boolean).slice(0, 10),
      },
      {
        platform: 'DoorDash',
        totalUnmapped: Number(doorStats.unmapped_txns),
        sampleLocations: unmappedDoor.rows.map((r: any) => r.location_name).filter(Boolean).slice(0, 10),
        sampleStoreCodes: [],
      },
      {
        platform: 'Grubhub',
        totalUnmapped: Number(grubStats.unmapped_txns),
        sampleLocations: unmappedGrub.rows.map((r: any) => r.restaurant_name).filter(Boolean).slice(0, 10),
        sampleStoreCodes: unmappedGrub.rows.map((r: any) => r.store_number).filter(Boolean).slice(0, 10),
      },
    ],
    locationCoverage,
    weeklyCoverage: weeklyData.rows.map((r: any) => ({
      weekStart: r.week_start,
      weekEnd: r.week_end,
      uberEatsLocations: 0, // Uber Eats date format makes this complex
      doorDashLocations: Number(r.doordash_locations),
      grubhubLocations: Number(r.grubhub_locations),
      uberEatsTxns: 0,
      doorDashTxns: Number(r.doordash_txns),
      grubhubTxns: Number(r.grubhub_txns),
    })),
    criticalIssues,
    recommendations,
  };
}

async function printDiagnosticReport(report: DiagnosticReport) {
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE DATA DIAGNOSTIC REPORT');
  console.log('='.repeat(80) + '\n');

  // Overview
  console.log('📍 LOCATION OVERVIEW');
  console.log(`   Total Locations: ${report.overview.totalLocations}`);
  console.log(`   ✅ All 3 Platforms: ${report.overview.locationsWithAllPlatforms} (${((report.overview.locationsWithAllPlatforms / report.overview.totalLocations) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  2 Platforms: ${report.overview.locationsWithTwoPlatforms} (${((report.overview.locationsWithTwoPlatforms / report.overview.totalLocations) * 100).toFixed(1)}%)`);
  console.log(`   ⚠️  1 Platform: ${report.overview.locationsWithOnePlatform} (${((report.overview.locationsWithOnePlatform / report.overview.totalLocations) * 100).toFixed(1)}%)`);
  console.log(`   ❌ 0 Platforms: ${report.overview.locationsWithZeroPlatforms} (${((report.overview.locationsWithZeroPlatforms / report.overview.totalLocations) * 100).toFixed(1)}%)`);

  // Platform coverage
  console.log('\n📦 PLATFORM COVERAGE');
  for (const [platform, data] of Object.entries(report.platformCoverage)) {
    const mappingRate = data.transactions > 0 ? (data.mapped / data.transactions) * 100 : 0;
    const icon = mappingRate > 95 ? '✅' : mappingRate > 75 ? '⚠️' : '❌';
    console.log(`\n   ${icon} ${platform.toUpperCase()}`);
    console.log(`      Locations: ${data.locations}`);
    console.log(`      Total Transactions: ${data.transactions.toLocaleString()}`);
    console.log(`      Mapped: ${data.mapped.toLocaleString()} (${mappingRate.toFixed(1)}%)`);
    console.log(`      Unmapped: ${data.unmapped.toLocaleString()}`);
  }

  // Critical issues
  if (report.criticalIssues.length > 0) {
    console.log('\n🚨 CRITICAL ISSUES');
    report.criticalIssues.forEach(issue => console.log(`   ${issue}`));
  }

  // Unmapped samples
  console.log('\n🔍 UNMAPPED TRANSACTION SAMPLES');
  for (const analysis of report.unmappedAnalysis) {
    if (analysis.totalUnmapped > 0) {
      console.log(`\n   ${analysis.platform}: ${analysis.totalUnmapped.toLocaleString()} unmapped`);
      if (analysis.sampleLocations.length > 0) {
        console.log(`      Sample locations: ${analysis.sampleLocations.slice(0, 5).join(', ')}`);
      }
      if (analysis.sampleStoreCodes.length > 0) {
        console.log(`      Sample store codes: ${analysis.sampleStoreCodes.slice(0, 5).join(', ')}`);
      }
    }
  }

  // Weekly coverage
  console.log('\n📅 RECENT WEEKLY COVERAGE (Last 10 weeks)');
  console.log('   Week Start    | DoorDash Locs | Grubhub Locs | DD Txns | GH Txns');
  console.log('   ' + '-'.repeat(70));
  report.weeklyCoverage.slice(0, 10).forEach(week => {
    console.log(`   ${week.weekStart} | ${String(week.doorDashLocations).padStart(13)} | ${String(week.grubhubLocations).padStart(12)} | ${String(week.doorDashTxns).padStart(7)} | ${String(week.grubhubTxns).padStart(7)}`);
  });

  // Locations with issues
  const locationsWithIssues = report.locationCoverage.filter(l => 
    !l.hasUberEats || !l.hasDoorDash || !l.hasGrubhub
  );
  
  if (locationsWithIssues.length > 0) {
    console.log(`\n⚠️  LOCATIONS WITH INCOMPLETE DATA (${locationsWithIssues.length} total, showing first 20)`);
    console.log('   Store ID | Location | Uber | DD | GH');
    console.log('   ' + '-'.repeat(60));
    locationsWithIssues.slice(0, 20).forEach(loc => {
      const uber = loc.hasUberEats ? '✓' : '✗';
      const door = loc.hasDoorDash ? '✓' : '✗';
      const grub = loc.hasGrubhub ? '✓' : '✗';
      console.log(`   ${loc.storeId.padEnd(8)} | ${loc.canonicalName.slice(0, 25).padEnd(25)} | ${uber.padEnd(4)} | ${door.padEnd(2)} | ${grub}`);
    });
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    console.log('\n💡 RECOMMENDATIONS');
    report.recommendations.forEach((rec, i) => console.log(`   ${i + 1}. ${rec}`));
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Diagnostic Complete');
  console.log('='.repeat(80) + '\n');
}

// Run diagnostic
runComprehensiveDiagnostic()
  .then(printDiagnosticReport)
  .catch(console.error);
