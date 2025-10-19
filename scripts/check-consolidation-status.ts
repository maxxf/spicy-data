import { storage } from "../server/storage";

async function main() {
  const locs = await storage.getLocations();
  const withCanonical = locs.filter(l => l.canonicalName);

  console.log(`\n📍 Total locations: ${locs.length}`);
  console.log(`📍 With canonical names: ${withCanonical.length}\n`);

  console.log("Sample consolidated locations:");
  for (const loc of withCanonical.slice(0, 10)) {
    console.log(`  ✅ ${loc.canonicalName}`);
    console.log(`      UE: ${loc.uberEatsName || 'none'}`);
    console.log(`      DD: ${loc.doordashName || 'none'}`);
    console.log(`      GH: ${loc.grubhubName || 'none'}`);
    console.log('');
  }

  // Check transactions
  const trans = await storage.getTransactions();
  console.log(`📊 Total transactions: ${trans.length}`);

  // Check analytics
  const filters = { clientId: locs[0]?.clientId || "" };
  const analytics = await storage.getLocationAnalytics(filters);
  
  console.log(`\n📊 Location analytics: ${analytics.length} locations`);
  
  const withSales = analytics.filter(a => a.totalSales > 0);
  console.log(`📊 Locations with sales: ${withSales.length}`);
  
  if (withSales.length > 0) {
    console.log("\nTop 5 locations by sales:");
    withSales.sort((a, b) => b.totalSales - a.totalSales).slice(0, 5).forEach(loc => {
      console.log(`  ${loc.location}: $${loc.totalSales.toLocaleString()} (${loc.totalOrders} orders)`);
    });
  }
}

main().catch(console.error);
