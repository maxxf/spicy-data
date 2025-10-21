import { google } from 'googleapis';
import { db } from './server/db';
import { doordashTransactions } from './shared/schema';
import { sql } from 'drizzle-orm';

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

async function getGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

async function verifyMarketingData() {
  console.log('=== DoorDash Marketing Data Verification ===\n');

  // Read Google Sheet data
  const sheets = await getGoogleSheetClient();
  const spreadsheetId = '1S7SwW92F1Z17wAMTzYt1FnO54YkhMox77rYNLnD8zXs';
  
  // First get the sheet metadata to find sheet names
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  console.log('Available sheets:');
  metadata.data.sheets?.forEach((sheet) => {
    console.log(`  - ${sheet.properties?.title} (gid: ${sheet.properties?.sheetId})`);
  });

  // Find the sheet with gid 430331116
  const targetSheet = metadata.data.sheets?.find(s => s.properties?.sheetId === 430331116);
  const sheetName = targetSheet?.properties?.title || metadata.data.sheets?.[0]?.properties?.title || 'Sheet1';
  
  console.log(`\nUsing sheet: ${sheetName}\n`);
  
  // Get data from the sheet
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    console.log('No data found in Google Sheet.');
    return;
  }

  console.log('Google Sheet Headers (Row 3):');
  console.log(rows[3]);
  console.log('\nSearching for DoorDash rows...\n');
  
  // Find DoorDash marketing data
  let doordashRows: any[] = [];
  let inDoordashSection = false;
  
  rows.forEach((row, idx) => {
    if (row[0] === 'DOORDASH' || row[0] === 'DoorDash') {
      inDoordashSection = true;
    }
    if (inDoordashSection && row[0] === '') {
      // DoorDash metric rows start with empty platform column
      doordashRows.push({ idx, data: row });
    }
    if (inDoordashSection && row[0] && row[0] !== 'DOORDASH' && row[0] !== 'DoorDash' && row[0] !== '') {
      // Next platform section started
      inDoordashSection = false;
    }
  });

  console.log(`Found ${doordashRows.length} DoorDash metric rows:\n`);
  doordashRows.forEach(({ idx, data }) => {
    console.log(`Row ${idx}: ${data[1]} => [${data.slice(2, 11).join(', ')}]`);
  });
  
  // Look for specific marketing metrics
  const offersRow = doordashRows.find(r => r.data[1]?.toLowerCase().includes('offer'));
  const adsRow = doordashRows.find(r => r.data[1]?.toLowerCase().includes('ad') || r.data[1]?.toLowerCase().includes('marketing'));
  const marketingSpendRow = doordashRows.find(r => r.data[1]?.toLowerCase().includes('marketing spend') || r.data[1]?.toLowerCase().includes('promo'));
  
  console.log('\n=== Google Sheet DoorDash Marketing Data ===');
  if (offersRow) {
    console.log(`\nOffers Row (${offersRow.idx}): ${offersRow.data[1]}`);
    console.log('  Week values:', offersRow.data.slice(2, 11));
  }
  if (adsRow) {
    console.log(`\nAds Row (${adsRow.idx}): ${adsRow.data[1]}`);
    console.log('  Week values:', adsRow.data.slice(2, 11));
  }
  if (marketingSpendRow) {
    console.log(`\nMarketing Spend Row (${marketingSpendRow.idx}): ${marketingSpendRow.data[1]}`);
    console.log('  Week values:', marketingSpendRow.data.slice(2, 11));
  }

  // Query our database for DoorDash marketing by week
  const dbResults = await db.execute(sql`
    SELECT 
      DATE_TRUNC('week', TO_DATE(transaction_date, 'YYYY-MM-DD'))::date as week_start,
      COUNT(*) as transactions,
      ROUND(SUM(COALESCE(marketing_spend, 0))::numeric, 2) as marketing_spend,
      ROUND(SUM(COALESCE(other_payments, 0))::numeric, 2) as other_payments,
      ROUND(SUM(COALESCE(offers_on_items, 0))::numeric, 2) as offers,
      ROUND(SUM(COALESCE(delivery_offer_redemptions, 0))::numeric, 2) as delivery_redemptions,
      ROUND(SUM(COALESCE(marketing_credits, 0))::numeric, 2) as marketing_credits,
      ROUND(SUM(COALESCE(third_party_contribution, 0))::numeric, 2) as third_party_contribution
    FROM doordash_transactions
    WHERE channel = 'Marketplace'
      AND transaction_date >= '2025-09-08'
    GROUP BY DATE_TRUNC('week', TO_DATE(transaction_date, 'YYYY-MM-DD'))
    ORDER BY week_start;
  `);

  console.log('\n\nDatabase Marketing Spend by Week:');
  console.log('=====================================');
  for (const row of dbResults.rows) {
    console.log(`\nWeek: ${row.week_start}`);
    console.log(`  Transactions: ${row.transactions}`);
    console.log(`  Total Marketing: $${row.marketing_spend}`);
    console.log(`  Breakdown:`);
    console.log(`    Other Payments: $${row.other_payments}`);
    console.log(`    Offers: $${row.offers}`);
    console.log(`    Delivery Redemptions: $${row.delivery_redemptions}`);
    console.log(`    Marketing Credits: $${row.marketing_credits}`);
    console.log(`    Third Party: $${row.third_party_contribution}`);
  }

  console.log('\n\n=== Total Summary ===');
  const total = dbResults.rows.reduce((acc, row) => ({
    transactions: acc.transactions + parseInt(row.transactions),
    marketing_spend: acc.marketing_spend + parseFloat(row.marketing_spend),
    other_payments: acc.other_payments + parseFloat(row.other_payments),
    offers: acc.offers + parseFloat(row.offers),
    delivery_redemptions: acc.delivery_redemptions + parseFloat(row.delivery_redemptions),
    marketing_credits: acc.marketing_credits + parseFloat(row.marketing_credits),
    third_party_contribution: acc.third_party_contribution + parseFloat(row.third_party_contribution)
  }), {
    transactions: 0,
    marketing_spend: 0,
    other_payments: 0,
    offers: 0,
    delivery_redemptions: 0,
    marketing_credits: 0,
    third_party_contribution: 0
  });

  console.log(`Total Transactions: ${total.transactions}`);
  console.log(`Total Marketing Spend: $${total.marketing_spend.toFixed(2)}`);
  console.log(`  Other Payments: $${total.other_payments.toFixed(2)}`);
  console.log(`  Offers: $${total.offers.toFixed(2)}`);
  console.log(`  Delivery Redemptions: $${total.delivery_redemptions.toFixed(2)}`);
  console.log(`  Marketing Credits: $${total.marketing_credits.toFixed(2)}`);
  console.log(`  Third Party: $${total.third_party_contribution.toFixed(2)}`);
}

verifyMarketingData().catch(console.error);
