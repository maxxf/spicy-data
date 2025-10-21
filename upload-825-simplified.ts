import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

async function uploadFile(filePath: string, clientId: string, platform: string) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('clientId', clientId);
  form.append('platform', platform);

  const response = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: form,
    headers: form.getHeaders(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Upload failed: ${response.status} ${response.statusText}\n${errorText}`);
  }

  return response.json();
}

async function main() {
  const clientId = '83506705-b408-4f0a-a9b0-e5b585db3b7d'; // Capriotti's

  console.log('🚀 Starting Aug 25 week upload (simplified format)...\n');

  try {
    // Upload DoorDash simplified transactions
    console.log('📦 Uploading DoorDash simplified transactions...');
    const doordashFile = path.join(
      process.cwd(),
      'attached_assets',
      'financials_simplified_transactions_us_2025-08-25_2025-08-31_Fe4jx_2025-10-21T21-13-58Z_1761087211322.csv'
    );
    
    if (!fs.existsSync(doordashFile)) {
      throw new Error(`DoorDash file not found: ${doordashFile}`);
    }

    const doordashResult = await uploadFile(doordashFile, clientId, 'doordash');
    console.log('✅ DoorDash upload complete:', JSON.stringify(doordashResult, null, 2));
    console.log();

  } catch (error) {
    console.error('❌ Error during upload:', error);
    process.exit(1);
  }

  console.log('✅ All uploads complete!');
}

main();
