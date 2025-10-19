import { getUncachableGoogleSheetClient } from "../server/google-sheets";
import { storage } from "../server/storage";

const SPREADSHEET_ID = "1S7SwW92F1Z17wAMTzYt1FnO54YkhMox77rYNLnD8zXs";
const SHEET_NAME = "Weekly Tracker";

interface WeeklyMetrics {
  weekStart: string; // Monday in YYYY-MM-DD format
  weekEnd: string;   // Sunday in YYYY-MM-DD format
  platform: "overview" | "ubereats" | "doordash" | "grubhub";
  totalSales: number;
  marketingSales: number;
  organicSales: number;
  totalOrders: number;
  marketingOrders: number;
  organicOrders: number;
  aov: number;
  adSpend: number;
  offersDiscounts: number;
  totalMarketingSpend: number;
  marketingSpendPercent: number;
  marketingRoas: number;
  netPayout: number;
  netPayoutPercent: number;
  payoutWithCogs: number;
}

function parseMoneyValue(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  // Remove $, commas, and parse
  const cleaned = value.toString().replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parsePercentValue(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  // Remove % and parse
  const cleaned = value.toString().replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num / 100; // Convert to decimal
}

function parseRoasValue(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  // Remove 'x' suffix and parse
  const cleaned = value.toString().replace(/x/gi, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseNumberValue(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  
  // Remove commas and parse
  const cleaned = value.toString().replace(/[,$]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// Convert date from M/D/YYYY to YYYY-MM-DD format and calculate Monday-Sunday week
function convertToWeekRange(dateStr: string): { weekStart: string; weekEnd: string } {
  // Parse M/D/YYYY format
  const parts = dateStr.split('/');
  const month = parseInt(parts[0]);
  const day = parseInt(parts[1]);
  const year = parseInt(parts[2]);
  
  // Create date (this should be a Monday based on the sheet structure)
  const monday = new Date(year, month - 1, day);
  
  // Calculate Sunday (6 days later)
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  
  const formatDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  return {
    weekStart: formatDate(monday),
    weekEnd: formatDate(sunday)
  };
}

async function main() {
  console.log("🚀 Importing weekly data from Google Sheet...\n");
  
  try {
    const sheets = await getUncachableGoogleSheetClient();
    
    // Fetch the data from the sheet
    console.log("📊 Fetching data from Google Sheet...");
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A1:O100`, // Fetch first 100 rows, columns A-O
    });
    
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.log("No data found in sheet");
      return;
    }
    
    // Row 4 (index 3) contains the week dates as column headers
    const headerRow = rows[3];
    console.log("📅 Found week headers:", headerRow.slice(2, 10));
    
    // Extract week date columns (starting from column index 2)
    const weekColumns: { weekStart: string; weekEnd: string; colIndex: number }[] = [];
    for (let i = 2; i < headerRow.length; i++) {
      const dateStr = headerRow[i];
      if (dateStr && dateStr.match(/^\d+\/\d+\/\d+$/)) {
        const { weekStart, weekEnd } = convertToWeekRange(dateStr);
        weekColumns.push({ weekStart, weekEnd, colIndex: i });
        console.log(`   Week ${i - 1}: ${weekStart} to ${weekEnd} (${dateStr})`);
      }
    }
    
    console.log(`\n✅ Found ${weekColumns.length} weeks of data\n`);
    
    // Get Capriotti's client
    const clients = await storage.getAllClients();
    const capriottis = clients.find(c => c.id === "capriottis" || c.name.toLowerCase().includes("capriotti"));
    if (!capriottis) {
      console.error("❌ Capriotti's client not found");
      return;
    }
    
    // Parse metrics by platform
    const platforms: { name: string; platform: "overview" | "ubereats" | "doordash" | "grubhub"; startRow: number }[] = [
      { name: "OVERVIEW", platform: "overview", startRow: 4 },
      { name: "UBER EATS", platform: "ubereats", startRow: 22 },
      { name: "DOORDASH", platform: "doordash", startRow: 39 },
      { name: "GRUBHUB", platform: "grubhub", startRow: 56 },
    ];
    
    const allMetrics: WeeklyMetrics[] = [];
    
    for (const { name, platform, startRow } of platforms) {
      console.log(`\n📈 Processing ${name} metrics...`);
      
      // Map of metric name to row offset from platform start
      const metricRows: { [key: string]: number } = {
        "Net Sales": 0,
        "Sales (Marketing Driven)": 1,
        "Organic Sales": 2,
        "Total Orders": 3,
        "Orders (Marketing Driven)": 4,
        "Organic Orders": 5,
        "AOV": 6,
        "Ad Spend": 7,
        "Offers/Discounts": 8,
        "Total Marketing Spend": 9,
        "Marketing Investment / Sales %": 10,
        "ROAS": 11,
        "Net Payout": 12,
        "Net Payout %": 13,
        "Net Payout w/ COGS": 14,
      };
      
      for (const { weekStart, weekEnd, colIndex } of weekColumns) {
        const metrics: WeeklyMetrics = {
          weekStart,
          weekEnd,
          platform,
          totalSales: parseMoneyValue(rows[startRow + metricRows["Net Sales"]]?.[colIndex]),
          marketingSales: parseMoneyValue(rows[startRow + metricRows["Sales (Marketing Driven)"]]?.[colIndex]),
          organicSales: parseMoneyValue(rows[startRow + metricRows["Organic Sales"]]?.[colIndex]),
          totalOrders: parseNumberValue(rows[startRow + metricRows["Total Orders"]]?.[colIndex]),
          marketingOrders: parseNumberValue(rows[startRow + metricRows["Orders (Marketing Driven)"]]?.[colIndex]),
          organicOrders: parseNumberValue(rows[startRow + metricRows["Organic Orders"]]?.[colIndex]),
          aov: parseMoneyValue(rows[startRow + metricRows["AOV"]]?.[colIndex]),
          adSpend: parseMoneyValue(rows[startRow + metricRows["Ad Spend"]]?.[colIndex]),
          offersDiscounts: parseMoneyValue(rows[startRow + metricRows["Offers/Discounts"]]?.[colIndex]),
          totalMarketingSpend: parseMoneyValue(rows[startRow + metricRows["Total Marketing Spend"]]?.[colIndex]),
          marketingSpendPercent: parsePercentValue(rows[startRow + metricRows["Marketing Investment / Sales %"]]?.[colIndex]),
          marketingRoas: parseRoasValue(rows[startRow + metricRows["ROAS"]]?.[colIndex]),
          netPayout: parseMoneyValue(rows[startRow + metricRows["Net Payout"]]?.[colIndex]),
          netPayoutPercent: parsePercentValue(rows[startRow + metricRows["Net Payout %"]]?.[colIndex]),
          payoutWithCogs: parseMoneyValue(rows[startRow + metricRows["Net Payout w/ COGS"]]?.[colIndex]),
        };
        
        allMetrics.push(metrics);
        
        console.log(`   ${weekStart}: Sales $${metrics.totalSales.toLocaleString()}, ROAS ${metrics.marketingRoas.toFixed(2)}x`);
      }
    }
    
    console.log(`\n✅ Parsed ${allMetrics.length} weekly metric records`);
    console.log("\n📊 Sample metrics for most recent week (10/6):");
    const sampleWeek = allMetrics.filter(m => m.weekStart.includes("2025-10-06"));
    sampleWeek.forEach(m => {
      console.log(`   ${m.platform.toUpperCase()}: Sales $${m.totalSales.toLocaleString()}, Marketing $${m.totalMarketingSpend.toLocaleString()}, ROAS ${m.marketingRoas.toFixed(2)}x`);
    });
    
    // TODO: Store these metrics in the database
    // This would require creating a weekly_platform_metrics table or similar
    console.log("\n⚠️  Note: Metrics parsed but not yet stored in database");
    console.log("   Need to create storage schema for weekly platform-level metrics");
    
  } catch (error: any) {
    console.error("❌ Error importing data:", error.message);
    console.error(error);
  }
}

main();
