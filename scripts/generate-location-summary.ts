import fetch from 'node-fetch';

const API_BASE = 'http://localhost:5000';

async function main() {
  // Get Capriotti's client ID
  const clientsRes = await fetch(`${API_BASE}/api/clients`);
  const clients = await clientsRes.json();
  const capriottis = clients.find((c: any) => c.name === "Capriotti's");
  
  console.log('\n' + '='.repeat(70));
  console.log('CAPRIOTTI\'S MARKETING DATA SUMMARY');
  console.log('='.repeat(70));

  // Get promotions
  const promosRes = await fetch(`${API_BASE}/api/promotions?clientId=${capriottis.id}`);
  const promotions = await promosRes.json();
  
  console.log(`\n📊 PROMOTIONS (${promotions.length} campaigns)`);
  console.log('-'.repeat(70));
  
  // Aggregate promotion metrics
  const promoTotals = promotions.reduce((acc: any, p: any) => {
    acc.revenue += p.revenue || 0;
    acc.orders += p.orders || 0;
    acc.impressions += p.impressions || 0;
    acc.clicks += p.clicks || 0;
    acc.newCustomers += p.newCustomers || 0;
    return acc;
  }, { revenue: 0, orders: 0, impressions: 0, clicks: 0, newCustomers: 0 });
  
  console.log(`Total Revenue:        $${promoTotals.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Total Orders:         ${promoTotals.orders.toLocaleString()}`);
  console.log(`New Customers:        ${promoTotals.newCustomers.toLocaleString()}`);
  
  // Top 5 promotions by revenue
  const topPromos = promotions
    .filter((p: any) => p.revenue > 0)
    .sort((a: any, b: any) => b.revenue - a.revenue)
    .slice(0, 5);
  
  console.log(`\n🏆 Top 5 Promotions by Revenue:`);
  topPromos.forEach((p: any, i: number) => {
    console.log(`  ${i + 1}. ${p.name.substring(0, 50)}`);
    console.log(`     Revenue: $${p.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })} | Orders: ${p.orders} | Platform: ${p.platform}`);
  });

  // Get paid ads
  const adsRes = await fetch(`${API_BASE}/api/paid-ads?clientId=${capriottis.id}`);
  const paidAds = await adsRes.json();
  
  console.log(`\n\n💰 PAID ADVERTISING (${paidAds.length} campaigns)`);
  console.log('-'.repeat(70));
  
  // Aggregate ad metrics
  const adTotals = paidAds.reduce((acc: any, a: any) => {
    acc.spend += a.spend || 0;
    acc.revenue += a.revenue || 0;
    acc.clicks += a.clicks || 0;
    acc.orders += a.orders || 0;
    acc.impressions += a.impressions || 0;
    return acc;
  }, { spend: 0, revenue: 0, clicks: 0, orders: 0, impressions: 0 });
  
  const avgROAS = adTotals.spend > 0 ? adTotals.revenue / adTotals.spend : 0;
  const avgCTR = adTotals.impressions > 0 ? (adTotals.clicks / adTotals.impressions) * 100 : 0;
  
  console.log(`Total Ad Spend:       $${adTotals.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Total Revenue:        $${adTotals.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Total Orders:         ${adTotals.orders.toLocaleString()}`);
  console.log(`Average ROAS:         ${avgROAS.toFixed(2)}x`);
  console.log(`Click-Through Rate:   ${avgCTR.toFixed(2)}%`);
  console.log(`Total Impressions:    ${adTotals.impressions.toLocaleString()}`);
  console.log(`Total Clicks:         ${adTotals.clicks.toLocaleString()}`);
  
  // Top performing ad campaigns
  const topAds = paidAds
    .filter((a: any) => a.revenue > 0)
    .sort((a: any, b: any) => b.roas - a.roas)
    .slice(0, 5);
  
  console.log(`\n🎯 Top 5 Ad Campaigns by ROAS:`);
  topAds.forEach((a: any, i: number) => {
    console.log(`  ${i + 1}. ${a.name.substring(0, 50)}`);
    console.log(`     ROAS: ${a.roas.toFixed(2)}x | Spend: $${a.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })} | Revenue: $${a.revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  });

  // Overall marketing summary
  console.log(`\n\n📈 OVERALL MARKETING PERFORMANCE`);
  console.log('='.repeat(70));
  console.log(`Total Marketing Spend:     $${adTotals.spend.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Total Marketing Revenue:   $${(promoTotals.revenue + adTotals.revenue).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  console.log(`Total Marketing Orders:    ${(promoTotals.orders + adTotals.orders).toLocaleString()}`);
  console.log(`Overall Marketing ROAS:    ${(adTotals.spend > 0 ? (promoTotals.revenue + adTotals.revenue) / adTotals.spend : 0).toFixed(2)}x`);
  console.log(`New Customers Acquired:    ${promoTotals.newCustomers.toLocaleString()}`);
  
  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
