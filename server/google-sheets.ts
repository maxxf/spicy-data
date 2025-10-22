import { google } from 'googleapis';

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

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
// Always call this function again to get a fresh client.
export async function getUncachableGoogleSheetClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

export async function fetchSheetData(spreadsheetId: string, range: string) {
  const sheets = await getUncachableGoogleSheetClient();
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values || [];
}

// Master location list structure from Google Sheet
export interface MasterLocation {
  storeId: string;              // Store ID (e.g., "NV008")
  shopName: string;             // Shop IDs Owned (canonical name, e.g., "NV008 Las Vegas Sahara")
  address: string;              // Shop Address
  city: string;                 // City
  state: string;                // State (e.g., "NV", "AZ")
  zip: string;                  // Zip code
  status: string;               // Status (e.g., "Active")
  uberEatsStoreLabel?: string;  // Uber Eats store code mapping
  doorDashStoreKey?: string;    // DoorDash merchant store ID mapping
  grubhubAddress?: string;      // Grubhub address mapping
}

// Capriotti's master location spreadsheet ID
const MASTER_LOCATIONS_SPREADSHEET_ID = '1H-qG7iMx52CTC7HDwsHwTV8YdS60syK6V9V-RKQc5GA';

/**
 * Fetch master location list from Google Sheet
 * Returns all active locations with platform mapping fields
 */
export async function fetchMasterLocations(): Promise<MasterLocation[]> {
  try {
    // Try different possible sheet tab names
    const possibleSheetNames = [
      'Master List',
      'Active Locations',
      'Locations',
      'Master Locations',
      'Sheet1',
      'Form Responses 1',
    ];
    
    let rows: any[] = [];
    let sheetName = '';
    
    // Try each sheet name until one works
    for (const name of possibleSheetNames) {
      try {
        rows = await fetchSheetData(MASTER_LOCATIONS_SPREADSHEET_ID, `${name}!A2:M1000`);
        sheetName = name;
        console.log(`[Google Sheets] Successfully accessed sheet tab: "${name}"`);
        break;
      } catch (error: any) {
        // Continue to next sheet name
        continue;
      }
    }
    
    if (rows.length === 0) {
      console.error('[Google Sheets] Could not find valid sheet tab in workbook');
      throw new Error('Could not access master locations sheet - please check tab name');
    }
    
    const locations: MasterLocation[] = [];
    
    for (const row of rows) {
      // Skip empty rows or rows without Store ID
      if (!row[3] || row[0] !== 'Active') continue;
      
      // Parse row based on column structure:
      // A: Status, B: Open Date, C: Shop IDs Owned, D: SHOP/Store ID, 
      // E: Franchisee/Group, F: Shop Address, G: City, H: State, I: Zip, J: Public
      const location: MasterLocation = {
        status: row[0] || '',
        shopName: row[2] || '',
        storeId: row[3] || '',
        address: row[5] || '',
        city: row[6] || '',
        state: row[7] || '',
        zip: row[8] || '',
        // Platform mappings (if available in additional columns)
        uberEatsStoreLabel: row[10] || undefined,
        doorDashStoreKey: row[11] || undefined,
        grubhubAddress: row[12] || undefined,
      };
      
      locations.push(location);
    }
    
    console.log(`[Google Sheets] Fetched ${locations.length} active master locations`);
    return locations;
  } catch (error) {
    console.error('[Google Sheets] Error fetching master locations:', error);
    throw new Error('Failed to fetch master locations from Google Sheet');
  }
}

/**
 * Fetch corp locations (Nevada + Arizona stores only)
 */
export async function fetchCorpLocations(): Promise<MasterLocation[]> {
  const allLocations = await fetchMasterLocations();
  const corpLocations = allLocations.filter(loc => 
    loc.state === 'NV' || loc.state === 'AZ'
  );
  
  console.log(`[Google Sheets] Filtered ${corpLocations.length} corp locations (NV + AZ) from ${allLocations.length} total`);
  return corpLocations;
}
