import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000';

async function uploadMarketingCSV(
  filePath: string,
  platform: string,
  dataType: string,
  clientId: string
) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('platform', platform);
  form.append('dataType', dataType);
  form.append('clientId', clientId);

  const response = await fetch(`${API_BASE}/api/upload/marketing`, {
    method: 'POST',
    body: form,
  });

  const result = await response.json();
  return result;
}

async function main() {
  // Get Capriotti's client ID
  const clientsRes = await fetch(`${API_BASE}/api/clients`);
  const clients = await clientsRes.json();
  const capriottis = clients.find((c: any) => c.name === "Capriotti's");
  
  if (!capriottis) {
    console.error("Capriotti's client not found!");
    return;
  }

  console.log(`Found Capriotti's client: ${capriottis.id}\n`);

  // Upload DoorDash Promotions
  console.log('Uploading DoorDash Promotions...');
  const promosResult = await uploadMarketingCSV(
    'attached_assets/Promotion_Store_4329951a-ad34-43cd-bc23-a66b2fdc6d31_1760747951560.csv',
    'doordash',
    'promotions',
    capriottis.id
  );
  console.log(`✓ Processed ${promosResult.rowsProcessed} promotion rows\n`);

  // Upload DoorDash Paid Ads
  console.log('Uploading DoorDash Paid Ads...');
  const adsResult = await uploadMarketingCSV(
    'attached_assets/Ads_Store_4329951a-ad34-43cd-bc23-a66b2fdc6d31_1760747951560.csv',
    'doordash',
    'ads',
    capriottis.id
  );
  console.log(`✓ Processed ${adsResult.rowsProcessed} ad rows\n`);

  // Upload Uber Offers/Campaigns
  console.log('Uploading Uber Offers/Campaigns...');
  const offersResult = await uploadMarketingCSV(
    'attached_assets/offers-campaigns (15)_1760748043240.csv',
    'uber',
    'offers',
    capriottis.id
  );
  console.log(`✓ Processed ${offersResult.rowsProcessed} offer rows\n`);

  console.log('='.repeat(50));
  console.log('Marketing data ingestion complete!');
  console.log('='.repeat(50));

  // Fetch and display summary
  const promotionsRes = await fetch(`${API_BASE}/api/promotions?clientId=${capriottis.id}`);
  const promotions = await promotionsRes.json();
  console.log(`\nTotal Promotions: ${promotions.length}`);

  const paidAdsRes = await fetch(`${API_BASE}/api/paid-ads?clientId=${capriottis.id}`);
  const paidAds = await paidAdsRes.json();
  console.log(`Total Paid Ad Campaigns: ${paidAds.length}`);

  // Show metrics aggregation
  const metricsRes = await fetch(`${API_BASE}/api/analytics/campaign-location-metrics?clientId=${capriottis.id}`);
  if (metricsRes.ok) {
    const metrics = await metricsRes.json();
    console.log(`\nLocation-Level Metrics Stored: ${metrics.length}`);
    
    // Aggregate totals
    const totals = metrics.reduce((acc: any, m: any) => {
      acc.revenue += m.revenue || 0;
      acc.spend += m.spend || 0;
      acc.orders += m.orders || 0;
      return acc;
    }, { revenue: 0, spend: 0, orders: 0 });
    
    console.log(`\nAggregated Totals:`);
    console.log(`  Total Revenue: $${totals.revenue.toLocaleString()}`);
    console.log(`  Total Spend: $${totals.spend.toLocaleString()}`);
    console.log(`  Total Orders: ${totals.orders.toLocaleString()}`);
    console.log(`  Overall ROAS: ${(totals.revenue / (totals.spend || 1)).toFixed(2)}`);
  }
}

main().catch(console.error);
