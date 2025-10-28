import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { locations, uberEatsTransactions, doordashTransactions, grubhubTransactions } from '../shared/schema';

// Helper to parse UberEats date (M/D/YY format) and check if in range
function isUberEatsDateInRange(dateStr: string, weekStart: string, weekEnd: string): boolean {
  const parts = dateStr.split('/');
  if (parts.length !== 3) return false;
  
  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
  const normalized = `${year}-${month}-${day}`;
  
  return normalized >= weekStart && normalized <= weekEnd;
}

async function debugLocationSales() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log('🔍 LOCATION SALES DEBUG REPORT');
  console.log('=' .repeat(80));
  console.log();

  // Get the three locations we're debugging
  const locationNames = [
    'Caps - NV067 Reno Meadows',
    'Caps - AZ900482 Tucson Broadway',
    'Caps - NV036 Las Vegas Silverado'
  ];

  const locs = await db.select().from(locations).where(
    inArray(locations.canonicalName, locationNames)
  );

  console.log('📍 Target Locations:');
  locs.forEach(loc => {
    console.log(`  - ${loc.canonicalName} (ID: ${loc.id}, Tag: ${loc.locationTag})`);
  });
  console.log();

  // Get available weeks
  const allDates: Date[] = [];
  
  // Collect dates from Uber Eats
  const uberTxns = await db.select({ date: uberEatsTransactions.date })
    .from(uberEatsTransactions);
  uberTxns.forEach(t => {
    const parts = t.date.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
      const date = new Date(`${year}-${month}-${day}`);
      if (!isNaN(date.getTime())) {
        allDates.push(date);
      }
    }
  });

  // Collect dates from DoorDash
  const ddTxns = await db.select({ date: doordashTransactions.transactionDate })
    .from(doordashTransactions);
  ddTxns.forEach(t => {
    const date = new Date(t.date);
    if (!isNaN(date.getTime())) {
      allDates.push(date);
    }
  });

  // Collect dates from Grubhub
  const ghTxns = await db.select({ date: grubhubTransactions.orderDate })
    .from(grubhubTransactions);
  ghTxns.forEach(t => {
    const date = new Date(t.date);
    if (!isNaN(date.getTime())) {
      allDates.push(date);
    }
  });

  // Get unique weeks (Monday to Sunday)
  const weekMap = new Map<string, { weekStart: string; weekEnd: string }>();
  
  allDates.forEach(date => {
    const dayOfWeek = date.getUTCDay();
    const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    
    const weekStart = monday.toISOString().split('T')[0];
    const weekEnd = sunday.toISOString().split('T')[0];
    weekMap.set(weekStart, { weekStart, weekEnd });
  });

  const weeks = Array.from(weekMap.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const last8Weeks = weeks.slice(0, 8);

  console.log(`📅 Analyzing Last 8 Weeks:`);
  last8Weeks.forEach((w, i) => {
    console.log(`  ${i + 1}. ${w.weekStart} to ${w.weekEnd}`);
  });
  console.log();
  console.log('=' .repeat(80));
  console.log();

  // For each week, calculate sales for each location
  for (const week of last8Weeks) {
    console.log(`\n📊 WEEK: ${week.weekStart} to ${week.weekEnd}`);
    console.log('-'.repeat(80));

    for (const loc of locs) {
      console.log(`\n  Location: ${loc.canonicalName}`);
      
      // Calculate Uber Eats sales
      const uberData = await db.select()
        .from(uberEatsTransactions)
        .where(eq(uberEatsTransactions.locationId, loc.id));
      
      const uberFiltered = uberData.filter(t => 
        isUberEatsDateInRange(t.date, week.weekStart, week.weekEnd) &&
        t.orderStatus === 'Completed'
      );
      
      const uberSales = uberFiltered.reduce((sum, t) => sum + (t.salesExclTax || t.subtotal || 0), 0);
      const uberOrders = uberFiltered.length;

      // Calculate DoorDash sales
      const ddData = await db.select()
        .from(doordashTransactions)
        .where(
          and(
            eq(doordashTransactions.locationId, loc.id),
            sql`CAST(${doordashTransactions.transactionDate} AS DATE) >= ${week.weekStart}`,
            sql`CAST(${doordashTransactions.transactionDate} AS DATE) <= ${week.weekEnd}`
          )
        );
      
      const ddFiltered = ddData.filter(t =>
        (t.channel === 'Marketplace' || t.channel === null) &&
        (t.transactionType === 'Order' || t.transactionType === null || t.transactionType === '')
      );
      
      const ddSales = ddFiltered.reduce((sum, t) => sum + (t.salesExclTax || t.orderSubtotal || 0), 0);
      const ddOrders = ddFiltered.length;

      // Calculate Grubhub sales
      const ghData = await db.select()
        .from(grubhubTransactions)
        .where(
          and(
            eq(grubhubTransactions.locationId, loc.id),
            sql`${grubhubTransactions.orderDate} >= ${week.weekStart}`,
            sql`${grubhubTransactions.orderDate} <= ${week.weekEnd}`
          )
        );
      
      const ghFiltered = ghData.filter(t => t.transactionType === 'Prepaid Order');
      const ghSales = ghFiltered.reduce((sum, t) => sum + (t.saleAmount || 0), 0);
      const ghOrders = ghFiltered.length;

      const totalSales = uberSales + ddSales + ghSales;
      const totalOrders = uberOrders + ddOrders + ghOrders;

      console.log(`    Uber Eats:  ${uberOrders} orders, $${uberSales.toFixed(2)}`);
      console.log(`    DoorDash:   ${ddOrders} orders, $${ddSales.toFixed(2)}`);
      console.log(`    Grubhub:    ${ghOrders} orders, $${ghSales.toFixed(2)}`);
      console.log(`    📈 TOTAL:   ${totalOrders} orders, $${totalSales.toFixed(2)}`);

      // Fetch from API to compare
      try {
        const clientId = '83506705-b408-4f0a-a9b0-e5b585db3b7d';
        const apiUrl = `http://localhost:5000/api/analytics/locations/consolidated?clientId=${clientId}&weekStart=${week.weekStart}&weekEnd=${week.weekEnd}`;
        
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          const apiLocation = data.find((d: any) => d.canonicalName === loc.canonicalName);
          
          if (apiLocation) {
            const diff = Math.abs(apiLocation.totalSales - totalSales);
            const percentDiff = totalSales > 0 ? (diff / totalSales) * 100 : 0;
            
            console.log(`    🌐 API:     ${apiLocation.totalOrders} orders, $${apiLocation.totalSales.toFixed(2)}`);
            
            if (diff > 0.01) {
              console.log(`    ⚠️  DISCREPANCY: $${diff.toFixed(2)} (${percentDiff.toFixed(1)}% difference)`);
            } else {
              console.log(`    ✅ Match!`);
            }
          } else {
            console.log(`    ⚠️  Not found in API response`);
          }
        }
      } catch (error: any) {
        console.log(`    ❌ API Error: ${error.message}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('🏁 Debug complete');
  
  await pool.end();
}

debugLocationSales().catch(console.error);
