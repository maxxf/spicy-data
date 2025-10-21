import { google } from 'googleapis';

const SPREADSHEET_ID = '1S7SwW92F1Z17wAMTzYt1FnO54YkhMox77rYNLnD8zXs';
const SHEET_GID = '430331116';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
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

async function main() {
  console.log("=== Fetching UberEats Ad Spend from Google Sheets ===\n");
  console.log(`Spreadsheet ID: ${SPREADSHEET_ID}`);
  console.log(`Sheet GID: ${SHEET_GID}\n`);
  
  const sheets = await getUncachableGoogleSheetClient();
  
  // Get spreadsheet metadata to find the sheet name by GID
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
  });
  
  console.log(`Spreadsheet Title: ${spreadsheet.data.properties?.title}`);
  console.log(`\nAvailable sheets:`);
  spreadsheet.data.sheets?.forEach(sheet => {
    console.log(`  - ${sheet.properties?.title} (GID: ${sheet.properties?.sheetId})`);
  });
  
  // Find the sheet with matching GID
  const targetSheet = spreadsheet.data.sheets?.find(
    sheet => sheet.properties?.sheetId === parseInt(SHEET_GID)
  );
  
  if (!targetSheet) {
    console.error(`\nSheet with GID ${SHEET_GID} not found!`);
    return;
  }
  
  const sheetName = targetSheet.properties?.title;
  console.log(`\nTarget sheet: ${sheetName}`);
  
  // Read the data from the sheet
  const range = `${sheetName}!A1:Z1000`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
  });
  
  const rows = response.data.values;
  
  if (!rows || rows.length === 0) {
    console.log('No data found.');
    return;
  }
  
  console.log(`\nFirst 10 rows of data:`);
  rows.slice(0, 10).forEach((row, i) => {
    console.log(`Row ${i + 1}:`, row.join(' | '));
  });
  
  // Look for UberEats ad spend data
  console.log(`\n\nSearching for UberEats ad spend for week 9/8/2025...`);
  
  // The expected value is $5,253
  console.log(`Expected: $5,253`);
}

main().catch(console.error);
