#!/usr/bin/env tsx
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const CORP_STORE_IDS = [
  'AZ900482', 'NV008', 'NV036', 'NV051', 'NV054', 'NV067', 'NV079',
  'NV103', 'NV111', 'NV121', 'NV126', 'NV151', 'NV152', 'NV191',
  'NV900467', 'NV900478'
];

interface WeekData {
  weekStart: string;
  weekEnd: string;
  storeId: string;
  locationName: string;
  totalSales: number;
  orderCount: number;
  uberSales: number;
  doorSales: number;
  grubSales: number;
}

async function identifyDataGaps() {
  console.log('🔍 CORPORATE LOCATIONS DATA GAP ANALYSIS');
  console.log('='.repeat(100));
  console.log('');
  console.log('This tool identifies weeks and locations that may have incomplete data.');
  console.log('Look for:');
  console.log('  - Weeks with unusually low sales for a location');
  console.log('  - Missing platform data (zero sales from Uber/DoorDash/Grubhub)');
  console.log('  - Abnormal week-over-week changes (>30% drop or spike)');
  console.log('');
  console.log('='.repeat(100));
  console.log('');

  // Get all 16 corporate locations
  const locations = await db.execute<{ id: string; canonical_name: string; store_id: string }>(sql`
    SELECT id, canonical_name, store_id
    FROM locations
    WHERE store_id SIMILAR TO '(AZ900482|NV008|NV036|NV051|NV054|NV067|NV079|NV103|NV111|NV121|NV126|NV151|NV152|NV191|NV900467|NV900478)%'
    ORDER BY store_id
  `);

  if (locations.rows.length !== 16) {
    console.error(`❌ ERROR: Expected 16 locations, found ${locations.rows.length}`);
    process.exit(1);
  }

  console.log(`✅ Found ${locations.rows.length} corporate locations\n`);

  // Get last 8 weeks
  const weeks = await db.execute<{ week_start: string; week_end: string }>(sql`
    WITH all_dates AS (
      SELECT TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') as d
      FROM uber_eats_transactions WHERE date ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$'
      UNION ALL
      SELECT CAST(transaction_date AS DATE) FROM doordash_transactions WHERE transaction_date IS NOT NULL
      UNION ALL
      SELECT CAST(order_date AS DATE) FROM grubhub_transactions WHERE order_date IS NOT NULL
    ),
    weeks AS (
      SELECT DISTINCT
        DATE_TRUNC('week', d)::date + CASE WHEN EXTRACT(DOW FROM DATE_TRUNC('week', d)) = 0 THEN 1 ELSE 0 END as week_start,
        (DATE_TRUNC('week', d)::date + 6 + CASE WHEN EXTRACT(DOW FROM DATE_TRUNC('week', d)) = 0 THEN 1 ELSE 0 END)::date as week_end
      FROM all_dates WHERE d IS NOT NULL
    )
    SELECT week_start::text, week_end::text FROM weeks ORDER BY week_start DESC LIMIT 8
  `);

  console.log(`📅 Analyzing last ${weeks.rows.length} weeks\n`);

  // Collect data for all locations and weeks
  const allData: Map<string, Map<string, WeekData>> = new Map();

  for (const week of weeks.rows) {
    const weekKey = `${week.week_start} to ${week.week_end}`;
    const weekData = new Map<string, WeekData>();

    for (const loc of locations.rows) {
      // Get data for this location and week
      const data = await db.execute<{
        uber_sales: number;
        uber_orders: number;
        door_sales: number;
        door_orders: number;
        grub_sales: number;
        grub_orders: number;
      }>(sql`
        WITH uber AS (
          SELECT 
            COALESCE(SUM(COALESCE(sales_excl_tax, subtotal, 0)), 0) as sales,
            COUNT(*) as orders
          FROM uber_eats_transactions
          WHERE location_id = ${loc.id}
            AND TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') >= ${week.week_start}::date
            AND TO_DATE('20' || SPLIT_PART(date, '/', 3) || '-' || LPAD(SPLIT_PART(date, '/', 1), 2, '0') || '-' || LPAD(SPLIT_PART(date, '/', 2), 2, '0'), 'YYYY-MM-DD') <= ${week.week_end}::date
            AND order_status = 'Completed'
        ),
        door AS (
          SELECT 
            COALESCE(SUM(COALESCE(sales_excl_tax, order_subtotal, 0)), 0) as sales,
            COUNT(*) as orders
          FROM doordash_transactions
          WHERE location_id = ${loc.id}
            AND CAST(transaction_date AS DATE) >= ${week.week_start}::date
            AND CAST(transaction_date AS DATE) <= ${week.week_end}::date
            AND (channel = 'Marketplace' OR channel IS NULL)
            AND (transaction_type = 'Order' OR transaction_type IS NULL OR transaction_type = '')
        ),
        grub AS (
          SELECT 
            COALESCE(SUM(sale_amount), 0) as sales,
            COUNT(*) as orders
          FROM grubhub_transactions
          WHERE location_id = ${loc.id}
            AND order_date >= ${week.week_start}::date
            AND order_date <= ${week.week_end}::date
            AND transaction_type = 'Prepaid Order'
        )
        SELECT 
          u.sales as uber_sales,
          u.orders as uber_orders,
          d.sales as door_sales,
          d.orders as door_orders,
          g.sales as grub_sales,
          g.orders as grub_orders
        FROM uber u, door d, grub g
      `);

      const row = data.rows[0];
      const totalSales = Number(row.uber_sales) + Number(row.door_sales) + Number(row.grub_sales);
      const totalOrders = Number(row.uber_orders) + Number(row.door_orders) + Number(row.grub_orders);

      weekData.set(loc.store_id, {
        weekStart: week.week_start,
        weekEnd: week.week_end,
        storeId: loc.store_id,
        locationName: loc.canonical_name,
        totalSales,
        orderCount: totalOrders,
        uberSales: Number(row.uber_sales),
        doorSales: Number(row.door_sales),
        grubSales: Number(row.grub_sales)
      });
    }

    allData.set(weekKey, weekData);
  }

  // Analyze and report issues
  console.log('📊 POTENTIAL DATA QUALITY ISSUES:\n');
  
  let issueCount = 0;
  const issuesByLocation = new Map<string, number>();

  const weekKeys = Array.from(allData.keys());
  
  for (let i = 0; i < weekKeys.length; i++) {
    const weekKey = weekKeys[i];
    const weekData = allData.get(weekKey)!;
    const prevWeekData = i < weekKeys.length - 1 ? allData.get(weekKeys[i + 1]) : null;

    for (const [storeId, data] of weekData) {
      const issues: string[] = [];

      // Check for missing platform data
      if (data.uberSales === 0 && data.orderCount > 0) {
        issues.push('Missing Uber Eats data');
      }
      if (data.doorSales === 0 && data.orderCount > 0) {
        issues.push('Missing DoorDash data');
      }
      if (data.grubSales === 0 && data.orderCount > 0) {
        issues.push('Missing Grubhub data');
      }

      // Check for abnormally low sales
      if (data.totalSales < 1000 && data.orderCount > 10) {
        issues.push('Abnormally low sales for order count');
      }

      // Check for week-over-week anomalies
      if (prevWeekData) {
        const prevData = prevWeekData.get(storeId);
        if (prevData && prevData.totalSales > 0) {
          const changePercent = ((data.totalSales - prevData.totalSales) / prevData.totalSales) * 100;
          
          if (changePercent < -50) {
            issues.push(`${Math.abs(changePercent).toFixed(0)}% drop from previous week (likely missing data)`);
          } else if (changePercent > 100) {
            issues.push(`${changePercent.toFixed(0)}% spike from previous week (possible duplicate data)`);
          }
        }
      }

      // Report issues
      if (issues.length > 0) {
        issueCount++;
        issuesByLocation.set(storeId, (issuesByLocation.get(storeId) || 0) + 1);
        
        console.log(`⚠️  ${weekKey}`);
        console.log(`   Location: ${data.locationName}`);
        console.log(`   Sales: $${data.totalSales.toFixed(2)} (${data.orderCount} orders)`);
        console.log(`   Platform breakdown: Uber $${data.uberSales.toFixed(2)} | DD $${data.doorSales.toFixed(2)} | GH $${data.grubSales.toFixed(2)}`);
        console.log(`   Issues: ${issues.join(', ')}`);
        console.log('');
      }
    }
  }

  if (issueCount === 0) {
    console.log('✅ No obvious data quality issues detected!\n');
  } else {
    console.log('='.repeat(100));
    console.log(`\n📋 SUMMARY: Found ${issueCount} potential issues across ${issuesByLocation.size} locations\n`);
    console.log('Locations with most issues:');
    
    const sortedIssues = Array.from(issuesByLocation.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    for (const [storeId, count] of sortedIssues) {
      const loc = locations.rows.find(l => l.store_id === storeId);
      console.log(`  ${count}x issues: ${storeId} (${loc?.canonical_name})`);
    }
    console.log('');
  }

  console.log('='.repeat(100));
  console.log('\n💡 NEXT STEPS:\n');
  console.log('1. For each week/location with issues, download the correct CSV from the platform');
  console.log('2. Use the bulk re-import tool: npm run fix-data');
  console.log('3. Or upload manually via the Upload page in the app');
  console.log('');
}

identifyDataGaps()
  .then(() => {
    console.log('✅ Analysis complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  });
