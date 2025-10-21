import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const clientId = '83506705-b408-4f0a-a9b0-e5b585db3b7d'; // Capriotti's

async function uploadFile(filePath: string, platform: string) {
  console.log(`\n📤 Uploading ${platform} file: ${filePath}`);
  
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('platform', platform);
  form.append('clientId', clientId);

  try {
    const response = await fetch('http://localhost:5000/api/upload', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log(`✅ ${platform} upload successful:`, data);
    } else {
      console.error(`❌ ${platform} upload failed:`, data);
    }
    
    return data;
  } catch (error) {
    console.error(`❌ ${platform} upload error:`, error);
    throw error;
  }
}

async function main() {
  console.log('Starting 8/25 week data upload...\n');
  
  // Upload Uber Eats
  await uploadFile(
    'attached_assets/f84942b6-9574-44c8-9816-4f7122ee863f-united_states_1761085769632.csv',
    'ubereats'
  );
  
  console.log('\n⏳ Waiting 2 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Upload DoorDash
  await uploadFile(
    'attached_assets/financials_simplified_transactions_us_2025-08-25_2025-08-31_Fe4jx_2025-10-21T21-13-58Z_1761085769632.csv',
    'doordash'
  );
  
  console.log('\n⏳ Waiting 2 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Upload Grubhub
  await uploadFile(
    'attached_assets/caps_-_8_25_1761085769631.csv',
    'grubhub'
  );
  
  console.log('\n✅ All uploads complete!');
}

main().catch(console.error);
