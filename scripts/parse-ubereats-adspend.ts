import { google } from 'googleapis';

const SPREADSHEET_ID = '1S7SwW92F1Z17wAMTzYt1FnO54YkhMox77rYNLnD8zXs';
const WEEK_9_8_COLUMN = 5; // 0-indexed: 0=Platform, 1=Metric, 2=8/18, 3=8/25, 4=9/1, 5=9/8

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPLIT_IDENTITY 
    ? 'repl ' + process.env.REPLIT_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Google Sheet not connected');
  }
  return accessToken;
}

async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

function parseCurrency(value: string): number {
  if (!value) return 0;
  return parseFloat(value.replace(/[$,]/g, ''));
}

async function main() {
  console.log("=== Parsing UberEats Ad Spend for Week 9/8/2025 ===\n");
  
  const sheets = await getUncachableGoogleSheetClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Weekly Tracker!A1:Z200',
  });
  
  const rows = response.data.values;
  
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return;
  }
  
  console.log(`Searching for UberEats ad spend data...\n`);
  
  // Find all rows that contain "Uber" (case insensitive)
  const uberRows = rows.filter((row, index) => {
    const platform = (row[0] || '').toString().toLowerCase();
    return platform.includes('uber');
  });
  
  console.log(`Found ${uberRows.length} rows with "Uber" in platform column:`);
  uberRows.forEach((row, i) => {
    const platform = row[0] || '';
    const metric = row[1] || '';
    const value = row[WEEK_9_8_COLUMN] || '';
    console.log(`  ${i + 1}. ${platform} | ${metric} | Week 9/8: ${value}`);
  });
  
  console.log(`\n\nLooking for marketing/ad spend metrics...`);
  
  // Find rows with marketing-related metrics
  const marketingKeywords = ['marketing', 'spend', 'ad', 'promo', 'offer', 'discount'];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const platform = (row[0] || '').toString().toLowerCase();
    const metric = (row[1] || '').toString().toLowerCase();
    const value = row[WEEK_9_8_COLUMN] || '';
    
    if (platform.includes('uber') && marketingKeywords.some(keyword => metric.includes(keyword))) {
      console.log(`  Row ${i + 1}: ${row[0]} | ${row[1]} | ${value}`);
    }
  }
  
  // Calculate expected total
  console.log(`\n\n=== SUMMARY ===`);
  console.log(`Expected UberEats ad spend for week 9/8: $5,253`);
  console.log(`\nNeed to find this value in the spreadsheet and import into platform_ad_spend table.`);
}

main().catch(console.error);
