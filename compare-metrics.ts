import { fetchSheetData } from './server/google-sheets';
import { storage } from './server/storage';

async function compareMetrics() {
  try {
    const spreadsheetId = '1S7SwW92F1Z17wAMTzYt1FnO54YkhMox77rYNLnD8zXs';
    const sheetName = 'Weekly Tracker';
    
    console.log('=== WEEKLY TRACKER COMPARISON ===\n');
    console.log('Fetching data from Google Sheets...\n');
    
    const data = await fetchSheetData(spreadsheetId, `${sheetName}!A1:Z200`);
    
    // Find the 10/6/2025 column
    const headerRow = data[3]; // Row 4 (0-indexed row 3)
    const dateIndex = headerRow.findIndex((cell: string) => cell === '10/6/2025');
    
    if (dateIndex === -1) {
      console.log('Could not find 10/6/2025 column');
      return;
    }
    
    console.log(`Found 10/6/2025 in column ${dateIndex + 1}\n`);
    
    // Parse metrics from Google Sheets
    const sheetMetrics: Record<string, any> = {};
    
    for (let i = 4; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      const platform = row[0];
      const metric = row[1];
      const value = row[dateIndex];
      
      if (platform && metric && value) {
        const key = `${platform}|${metric}`;
        sheetMetrics[key] = value;
      }
    }
    
    console.log('=== GOOGLE SHEETS METRICS (Week of 10/6/2025) ===\n');
    Object.entries(sheetMetrics).forEach(([key, value]) => {
      console.log(`${key}: ${value}`);
    });
    
    // Now fetch database metrics for the same week
    console.log('\n=== DATABASE METRICS ===\n');
    
    const clients = await storage.getAllClients();
    const clientId = clients[0]?.id;
    
    if (!clientId) {
      console.log('No clients found in database');
      return;
    }
    
    // Fetch all platform transactions
    const uberTransactions = await storage.getUberEatsTransactionsByClient(clientId);
    const doordashTransactions = await storage.getDoordashTransactionsByClient(clientId);
    const grubhubTransactions = await storage.getGrubhubTransactionsByClient(clientId);
    
    // Filter to week of 10/6/2025 - 10/12/2025
    const weekStart = new Date('2025-10-06T00:00:00');
    const weekEnd = new Date('2025-10-12T23:59:59');
    
    const filterByWeek = (txns: any[]) => {
      return txns.filter(t => {
        const txDate = new Date(t.orderDate);
        return txDate >= weekStart && txDate <= weekEnd;
      });
    };
    
    const weekUber = filterByWeek(uberTransactions);
    const weekDoorDash = filterByWeek(doordashTransactions);
    const weekGrubhub = filterByWeek(grubhubTransactions);
    
    console.log(`Uber Eats transactions: ${weekUber.length}`);
    console.log(`DoorDash transactions: ${weekDoorDash.length}`);
    console.log(`Grubhub transactions: ${weekGrubhub.length}`);
    console.log(`Total transactions: ${weekUber.length + weekDoorDash.length + weekGrubhub.length}\n`);
    
    // Calculate Uber Eats metrics
    const uberSales = weekUber.reduce((sum, t) => sum + (t.sales || 0), 0);
    const uberNetPayout = weekUber.reduce((sum, t) => sum + (t.netPayout || 0), 0);
    const uberOrders = weekUber.filter(t => t.orderStatus === 'Completed').length;
    const uberMarketingSales = weekUber.filter(t => t.hasMarketing).reduce((sum, t) => sum + (t.sales || 0), 0);
    
    // Calculate DoorDash metrics
    // For DoorDash, only count Marketplace + Completed for sales/orders
    const ddMarketplaceCompleted = weekDoorDash.filter(t => 
      t.channel === 'Marketplace' && t.orderStatus === 'Completed'
    );
    const ddSales = ddMarketplaceCompleted.reduce((sum, t) => sum + (t.sales || 0), 0);
    const ddOrders = ddMarketplaceCompleted.length;
    const ddNetPayout = weekDoorDash.reduce((sum, t) => sum + (t.netPayout || 0), 0);
    const ddMarketingSales = weekDoorDash.filter(t => t.hasMarketing).reduce((sum, t) => sum + (t.sales || 0), 0);
    
    // Calculate Grubhub metrics
    const ghSales = weekGrubhub.reduce((sum, t) => sum + (t.sales || 0), 0);
    const ghNetPayout = weekGrubhub.reduce((sum, t) => sum + (t.netPayout || 0), 0);
    const ghOrders = weekGrubhub.filter(t => t.orderStatus === 'Completed').length;
    const ghMarketingSales = weekGrubhub.filter(t => t.hasMarketing).reduce((sum, t) => sum + (t.sales || 0), 0);
    
    // Totals
    const totalSales = uberSales + ddSales + ghSales;
    const totalOrders = uberOrders + ddOrders + ghOrders;
    const totalNetPayout = uberNetPayout + ddNetPayout + ghNetPayout;
    const totalMarketingSales = uberMarketingSales + ddMarketingSales + ghMarketingSales;
    
    console.log('OVERVIEW:');
    console.log(`  Total Net Sales: $${totalSales.toLocaleString()}`);
    console.log(`  Total Orders: ${totalOrders}`);
    console.log(`  Marketing Driven Sales: $${totalMarketingSales.toLocaleString()}`);
    console.log(`  Total Net Payout: $${totalNetPayout.toLocaleString()}`);
    console.log('');
    
    console.log('UBER EATS:');
    console.log(`  Sales: $${uberSales.toLocaleString()}`);
    console.log(`  Orders: ${uberOrders}`);
    console.log(`  Net Payout: $${uberNetPayout.toLocaleString()}`);
    console.log('');
    
    console.log('DOORDASH:');
    console.log(`  Sales: $${ddSales.toLocaleString()}`);
    console.log(`  Orders: ${ddOrders}`);
    console.log(`  Net Payout: $${ddNetPayout.toLocaleString()}`);
    console.log('');
    
    console.log('GRUBHUB:');
    console.log(`  Sales: $${ghSales.toLocaleString()}`);
    console.log(`  Orders: ${ghOrders}`);
    console.log(`  Net Payout: $${ghNetPayout.toLocaleString()}`);
    
    // Compare
    console.log('\n=== COMPARISON ===\n');
    
    const sheetTotalSales = parseFloat(sheetMetrics['OVERVIEW|Total Net Sales']?.replace(/[$,]/g, '') || '0');
    const sheetUberSales = parseFloat(sheetMetrics['UBER EATS|Uber Eats | Net Sales']?.replace(/[$,]/g, '') || '0');
    const sheetDDSales = parseFloat(sheetMetrics['DOORDASH|DoorDash | Net Sales']?.replace(/[$,]/g, '') || '0');
    const sheetGHSales = parseFloat(sheetMetrics['GRUBHUB|Grubhub | Net Sales']?.replace(/[$,]/g, '') || '0');
    
    const formatComparison = (name: string, sheetValue: number, dbValue: number) => {
      const diff = dbValue - sheetValue;
      const pctDiff = sheetValue !== 0 ? (Math.abs(diff) / sheetValue) * 100 : 0;
      
      console.log(`${name}:`);
      console.log(`  Google Sheet: $${sheetValue.toLocaleString()}`);
      console.log(`  Database:     $${dbValue.toLocaleString()}`);
      console.log(`  Difference:   $${diff.toLocaleString()} (${pctDiff.toFixed(2)}%)`);
      
      if (pctDiff <= 2) {
        console.log(`  ✅ WITHIN 2% TOLERANCE`);
      } else {
        console.log(`  ⚠️  EXCEEDS 2% TOLERANCE`);
      }
      console.log('');
    };
    
    formatComparison('Total Net Sales', sheetTotalSales, totalSales);
    formatComparison('Uber Eats Sales', sheetUberSales, uberSales);
    formatComparison('DoorDash Sales', sheetDDSales, ddSales);
    formatComparison('Grubhub Sales', sheetGHSales, ghSales);
    
  } catch (error: any) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

compareMetrics();
