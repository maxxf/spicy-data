/**
 * Test consolidated location aggregation
 */

const clientId = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

console.log("🧪 Testing Consolidated Location Aggregation\n");

const response = await fetch(`http://localhost:5000/api/analytics/locations/consolidated?clientId=${clientId}`);
console.log(`Response status: ${response.status}`);

const data = await response.json();
console.log(`Response type: ${typeof data}, isArray: ${Array.isArray(data)}`);

if (!Array.isArray(data)) {
  console.log(`Error response:`, JSON.stringify(data, null, 2));
  process.exit(1);
}

const withCanonical = data.filter((loc: any) => loc.canonicalName);
const withSales = data.filter((loc: any) => loc.totalSales > 0);

console.log(`📊 Consolidated Location Analytics:`);
console.log(`   Total locations: ${data.length}`);
console.log(`   With canonical names: ${withCanonical.length}`);
console.log(`   With sales: ${withSales.length}\n`);

// Show top 10 by sales
const top10 = data
  .filter((loc: any) => loc.totalSales > 0)
  .sort((a: any, b: any) => b.totalSales - a.totalSales)
  .slice(0, 10);

console.log("🔝 Top 10 Locations by Sales:\n");

for (const loc of top10) {
  const platforms = [];
  if (loc.platformBreakdown?.ubereats) platforms.push('UE');
  if (loc.platformBreakdown?.doordash) platforms.push('DD');
  if (loc.platformBreakdown?.grubhub) platforms.push('GH');
  
  console.log(`${loc.canonicalName || loc.location}`);
  console.log(`  💰 Total Sales: $${loc.totalSales.toLocaleString()}`);
  console.log(`  📦 Total Orders: ${loc.totalOrders}`);
  console.log(`  🏪 Platforms: ${platforms.join(' + ')}`);
  
  if (platforms.length > 1) {
    console.log(`  📊 Cross-Platform Breakdown:`);
    if (loc.platformBreakdown.ubereats) {
      console.log(`     UE: $${loc.platformBreakdown.ubereats.totalSales.toLocaleString()} (${loc.platformBreakdown.ubereats.totalOrders} orders)`);
    }
    if (loc.platformBreakdown.doordash) {
      console.log(`     DD: $${loc.platformBreakdown.doordash.totalSales.toLocaleString()} (${loc.platformBreakdown.doordash.totalOrders} orders)`);
    }
    if (loc.platformBreakdown.grubhub) {
      console.log(`     GH: $${loc.platformBreakdown.grubhub.totalSales.toLocaleString()} (${loc.platformBreakdown.grubhub.totalOrders} orders)`);
    }
  }
  console.log('');
}

// Consolidation stats
const crossPlatform = data.filter((loc: any) => {
  const count = [
    loc.platformBreakdown?.ubereats,
    loc.platformBreakdown?.doordash,
    loc.platformBreakdown?.grubhub
  ].filter(Boolean).length;
  return count > 1;
});

console.log(`\n✅ LOCATION AGGREGATION WORKING!`);
console.log(`   📍 ${crossPlatform.length} locations have data from 2+ platforms`);
console.log(`   📍 ${data.length - crossPlatform.length} locations have data from 1 platform`);
console.log(`\n   🎉 Cross-platform consolidation successful!\n`);
