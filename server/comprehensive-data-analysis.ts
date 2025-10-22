import { db } from "./db";
import { uberEatsTransactions, doordashTransactions, grubhubTransactions, locations } from "@shared/schema";
import { sql, isNull, isNotNull } from "drizzle-orm";

async function comprehensiveAnalysis() {
  console.log("📊 COMPREHENSIVE DATA ANALYSIS - ALL LOCATIONS, ALL WEEKS\n");
  console.log("=" .repeat(80));

  // 1. Overall statistics
  console.log("\n1️⃣  OVERALL TRANSACTION COUNTS");
  console.log("─".repeat(80));
  
  const stats = await db.execute(sql`
    SELECT 
      (SELECT COUNT(*) FROM uber_eats_transactions) as ue_total,
      (SELECT COUNT(*) FROM uber_eats_transactions WHERE location_id IS NOT NULL) as ue_mapped,
      (SELECT COUNT(*) FROM doordash_transactions) as dd_total,
      (SELECT COUNT(*) FROM doordash_transactions WHERE location_id IS NOT NULL) as dd_mapped,
      (SELECT COUNT(*) FROM grubhub_transactions) as gh_total,
      (SELECT COUNT(*) FROM grubhub_transactions WHERE location_id IS NOT NULL) as gh_mapped
  `);
  
  const row = stats.rows[0] as any;
  console.log(`Uber Eats:  ${row.ue_total.toLocaleString()} total | ${row.ue_mapped.toLocaleString()} mapped (${((row.ue_mapped/row.ue_total)*100).toFixed(1)}%) | ${(row.ue_total - row.ue_mapped).toLocaleString()} unmapped`);
  console.log(`DoorDash:   ${row.dd_total.toLocaleString()} total | ${row.dd_mapped.toLocaleString()} mapped (${((row.dd_mapped/row.dd_total)*100).toFixed(1)}%) | ${(row.dd_total - row.dd_mapped).toLocaleString()} unmapped`);
  console.log(`Grubhub:    ${row.gh_total.toLocaleString()} total | ${row.gh_mapped.toLocaleString()} mapped (${((row.gh_mapped/row.gh_total)*100).toFixed(1)}%) | ${(row.gh_total - row.gh_mapped).toLocaleString()} unmapped`);
  console.log(`TOTAL:      ${(parseInt(row.ue_total) + parseInt(row.dd_total) + parseInt(row.gh_total)).toLocaleString()} transactions across all platforms`);

  // 2. Location coverage
  console.log("\n\n2️⃣  LOCATION COVERAGE");
  console.log("─".repeat(80));
  
  const locationCoverage = await db.execute(sql`
    SELECT 
      COUNT(DISTINCT l.id) as total_locations,
      COUNT(DISTINCT CASE WHEN EXISTS (
        SELECT 1 FROM uber_eats_transactions ue WHERE ue.location_id = l.id
      ) THEN l.id END) as locations_with_ue,
      COUNT(DISTINCT CASE WHEN EXISTS (
        SELECT 1 FROM doordash_transactions dd WHERE dd.location_id = l.id
      ) THEN l.id END) as locations_with_dd,
      COUNT(DISTINCT CASE WHEN EXISTS (
        SELECT 1 FROM grubhub_transactions gh WHERE gh.location_id = l.id
      ) THEN l.id END) as locations_with_gh,
      COUNT(DISTINCT CASE WHEN 
        EXISTS (SELECT 1 FROM uber_eats_transactions ue WHERE ue.location_id = l.id) AND
        EXISTS (SELECT 1 FROM doordash_transactions dd WHERE dd.location_id = l.id) AND
        EXISTS (SELECT 1 FROM grubhub_transactions gh WHERE gh.location_id = l.id)
      THEN l.id END) as locations_with_all_3
    FROM locations l
  `);
  
  const locRow = locationCoverage.rows[0] as any;
  console.log(`Total locations in database: ${locRow.total_locations}`);
  console.log(`Locations with Uber Eats data:   ${locRow.locations_with_ue} (${((locRow.locations_with_ue/locRow.total_locations)*100).toFixed(1)}%)`);
  console.log(`Locations with DoorDash data:    ${locRow.locations_with_dd} (${((locRow.locations_with_dd/locRow.total_locations)*100).toFixed(1)}%)`);
  console.log(`Locations with Grubhub data:     ${locRow.locations_with_gh} (${((locRow.locations_with_gh/locRow.total_locations)*100).toFixed(1)}%)`);
  console.log(`Locations with all 3 platforms:  ${locRow.locations_with_all_3} (${((locRow.locations_with_all_3/locRow.total_locations)*100).toFixed(1)}%)`);

  // 3. Date range coverage
  console.log("\n\n3️⃣  DATE RANGE COVERAGE");
  console.log("─".repeat(80));
  
  const dateRanges = await db.execute(sql`
    SELECT 'Uber Eats' as platform, 
           MIN(date) as earliest, 
           MAX(date) as latest,
           COUNT(DISTINCT date) as unique_dates
    FROM uber_eats_transactions
    WHERE date IS NOT NULL AND date != '' AND date != 'N/A'
    UNION ALL
    SELECT 'DoorDash' as platform,
           MIN(transaction_date::date)::text as earliest,
           MAX(transaction_date::date)::text as latest,
           COUNT(DISTINCT transaction_date::date) as unique_dates
    FROM doordash_transactions
    UNION ALL
    SELECT 'Grubhub' as platform,
           MIN(order_date)::text as earliest,
           MAX(order_date)::text as latest,
           COUNT(DISTINCT order_date) as unique_dates
    FROM grubhub_transactions
    ORDER BY platform
  `);
  
  for (const dateRow of dateRanges.rows) {
    const dr = dateRow as any;
    console.log(`${dr.platform.padEnd(12)}: ${dr.earliest || 'N/A'} to ${dr.latest || 'N/A'} (${dr.unique_dates} unique dates)`);
  }

  // 4. Top 20 locations by transaction volume
  console.log("\n\n4️⃣  TOP 20 LOCATIONS BY TRANSACTION VOLUME");
  console.log("─".repeat(80));
  
  const topLocations = await db.execute(sql`
    SELECT 
      l.store_id,
      l.canonical_name,
      COUNT(DISTINCT ue.id) as ue_txns,
      COUNT(DISTINCT dd.id) as dd_txns,
      COUNT(DISTINCT gh.id) as gh_txns,
      COUNT(DISTINCT ue.id) + COUNT(DISTINCT dd.id) + COUNT(DISTINCT gh.id) as total_txns
    FROM locations l
    LEFT JOIN uber_eats_transactions ue ON ue.location_id = l.id
    LEFT JOIN doordash_transactions dd ON dd.location_id = l.id
    LEFT JOIN grubhub_transactions gh ON gh.location_id = l.id
    GROUP BY l.store_id, l.canonical_name
    HAVING COUNT(DISTINCT ue.id) + COUNT(DISTINCT dd.id) + COUNT(DISTINCT gh.id) > 0
    ORDER BY total_txns DESC
    LIMIT 20
  `);
  
  console.log("Store ID     Location Name                             UE      DD      GH    Total");
  console.log("─".repeat(80));
  for (const loc of topLocations.rows) {
    const l = loc as any;
    const storeId = (l.store_id || 'N/A').padEnd(12);
    const name = (l.canonical_name || 'Unknown').substring(0, 37).padEnd(37);
    const ue = String(l.ue_txns).padStart(6);
    const dd = String(l.dd_txns).padStart(6);
    const gh = String(l.gh_txns).padStart(6);
    const total = String(l.total_txns).padStart(7);
    console.log(`${storeId} ${name} ${ue}  ${dd}  ${gh}  ${total}`);
  }

  // 5. Locations with zero data across all platforms
  console.log("\n\n5️⃣  LOCATIONS WITH ZERO TRANSACTION DATA");
  console.log("─".repeat(80));
  
  const emptyLocations = await db.execute(sql`
    SELECT 
      l.store_id,
      l.canonical_name
    FROM locations l
    WHERE NOT EXISTS (SELECT 1 FROM uber_eats_transactions ue WHERE ue.location_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM doordash_transactions dd WHERE dd.location_id = l.id)
      AND NOT EXISTS (SELECT 1 FROM grubhub_transactions gh WHERE gh.location_id = l.id)
    ORDER BY l.store_id
  `);
  
  if (emptyLocations.rows.length === 0) {
    console.log("✓ All locations have at least some transaction data!");
  } else {
    console.log(`Found ${emptyLocations.rows.length} locations with no transaction data:`);
    for (const loc of emptyLocations.rows.slice(0, 20)) {
      const l = loc as any;
      console.log(`  • ${l.store_id}: ${l.canonical_name}`);
    }
    if (emptyLocations.rows.length > 20) {
      console.log(`  ... and ${emptyLocations.rows.length - 20} more`);
    }
  }

  // 6. Weekly transaction volume
  console.log("\n\n6️⃣  WEEKLY TRANSACTION VOLUME (Last 8 Weeks)");
  console.log("─".repeat(80));
  
  const weeklyVolume = await db.execute(sql`
    WITH weeks AS (
      SELECT DISTINCT 
        transaction_date::date as week_start
      FROM doordash_transactions
      WHERE transaction_date::date >= CURRENT_DATE - INTERVAL '8 weeks'
      ORDER BY week_start DESC
      LIMIT 8
    )
    SELECT 
      w.week_start,
      (SELECT COUNT(*) FROM uber_eats_transactions ue 
       WHERE ue.date = TO_CHAR(w.week_start, 'MM/DD/YY')) as ue_count,
      (SELECT COUNT(*) FROM doordash_transactions dd 
       WHERE dd.transaction_date::date = w.week_start) as dd_count,
      (SELECT COUNT(*) FROM grubhub_transactions gh 
       WHERE gh.order_date::date = w.week_start) as gh_count
    FROM weeks w
    ORDER BY w.week_start DESC
  `);
  
  console.log("Week Start      UE      DD      GH    Total");
  console.log("─".repeat(80));
  for (const week of weeklyVolume.rows) {
    const w = week as any;
    const date = String(w.week_start).padEnd(15);
    const ue = String(w.ue_count || 0).padStart(6);
    const dd = String(w.dd_count || 0).padStart(6);
    const gh = String(w.gh_count || 0).padStart(6);
    const total = String((parseInt(w.ue_count || 0) + parseInt(w.dd_count || 0) + parseInt(w.gh_count || 0))).padStart(7);
    console.log(`${date} ${ue}  ${dd}  ${gh}  ${total}`);
  }

  console.log("\n" + "=".repeat(80));
  console.log("Analysis complete!\n");
  
  process.exit(0);
}

comprehensiveAnalysis().catch((err) => {
  console.error("Error in comprehensive analysis:", err);
  process.exit(1);
});
