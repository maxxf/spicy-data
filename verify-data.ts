import { fetchSheetData } from './server/google-sheets';

async function verifyData() {
  try {
    // Fetch weekly tracker data from Google Sheets
    // The gid=430331116 indicates a specific tab
    const spreadsheetId = '1S7SwW92F1Z17wAMTzYt1FnO54YkhMox77rYNLnD8zXs';
    
    // Try to fetch data from the sheet
    // We'll need to find the correct tab name or range
    console.log('Fetching weekly tracker data from Google Sheets...\n');
    
    // First, let's try to get sheet metadata to find the tab name
    const { google } = await import('googleapis');
    const { getUncachableGoogleSheetClient } = await import('./server/google-sheets');
    
    const sheets = await getUncachableGoogleSheetClient();
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    
    console.log('Available sheets:');
    metadata.data.sheets?.forEach(sheet => {
      console.log(`  - ${sheet.properties?.title} (ID: ${sheet.properties?.sheetId})`);
    });
    
    // Find the tab with gid 430331116
    const targetSheet = metadata.data.sheets?.find(
      sheet => sheet.properties?.sheetId === 430331116
    );
    
    if (!targetSheet) {
      console.log('\nCould not find tab with gid 430331116');
      return;
    }
    
    const sheetName = targetSheet.properties?.title;
    console.log(`\nTarget sheet: "${sheetName}"\n`);
    
    // Fetch the data from this sheet
    const data = await fetchSheetData(spreadsheetId, `${sheetName}!A1:Z1000`);
    
    if (data.length === 0) {
      console.log('No data found in sheet');
      return;
    }
    
    // Display the header row
    console.log('Header row:', data[0]);
    console.log(`\nTotal rows: ${data.length}`);
    console.log('\nFirst few data rows:');
    data.slice(1, 6).forEach((row, idx) => {
      console.log(`Row ${idx + 1}:`, row);
    });
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

verifyData();
