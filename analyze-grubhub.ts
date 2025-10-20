import { fetchSheetData } from './server/google-sheets';

async function analyzeGrubhub() {
  try {
    const spreadsheetId = '1S7SwW92F1Z17wAMTzYt1FnO54YkhMox77rYNLnD8zXs';
    const sheetName = 'Weekly Tracker';
    
    console.log('=== GRUBHUB GOOGLE SHEET ANALYSIS ===\n');
    
    const data = await fetchSheetData(spreadsheetId, `${sheetName}!A1:Z200`);
    
    // Find all Grubhub-related rows
    console.log('All Grubhub-related metrics in the sheet:\n');
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      const platform = row[0];
      const metric = row[1];
      
      if (platform && platform.toLowerCase().includes('grub')) {
        console.log(`Row ${i + 1}: Platform="${platform}", Metric="${metric}"`);
        console.log(`  Full row:`, row.slice(0, 15)); // Show first 15 columns
        console.log('');
      }
    }
    
    // Check if there are any formulas or notes about Grubhub
    console.log('\n=== CHECKING FOR CALCULATION NOTES ===\n');
    
    for (let i = 0; i < Math.min(data.length, 150); i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      
      const rowText = row.join(' ').toLowerCase();
      if (rowText.includes('grub') && (rowText.includes('formula') || rowText.includes('calc') || rowText.includes('note') || rowText.includes('adjust'))) {
        console.log(`Row ${i + 1}:`, row);
      }
    }
    
  } catch (error: any) {
    console.error('Error:', error.message);
  }
}

analyzeGrubhub();
