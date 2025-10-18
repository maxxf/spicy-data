/**
 * Generate sample weekly financial data for locations via API
 * This script creates sample weekly financial snapshots for testing the UI
 */

const API_BASE = "http://localhost:5000";

async function apiRequest(method: string, path: string, body?: any) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const text = await response.text();
    console.error(`API request failed (${response.status}): ${path}`);
    console.error(`Response: ${text.substring(0, 200)}`);
    throw new Error(`API request failed: ${response.statusText}`);
  }
  
  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    const text = await response.text();
    console.error(`Expected JSON response but got: ${contentType}`);
    console.error(`Response body: ${text.substring(0, 200)}`);
    throw new Error(`Invalid response type: ${contentType}`);
  }
  
  return response.json();
}

async function generateWeeklyFinancials() {
  console.log("Generating sample weekly financial data via API...");

  // Get all locations
  let locations = await apiRequest("GET", "/api/locations");
  
  if (locations.length === 0) {
    console.log("No locations found. Creating sample locations...");
    
    // Create sample locations for Capriotti's
    const sampleLocations = [
      { canonicalName: "NV067 Reno Meadows", uberEatsName: "Capriotti's - Reno Meadows", doordashName: "Capriotti's (Reno Meadows)", grubhubName: "Capriotti's Reno" },
      { canonicalName: "NV900478 LV S Las Vegas", uberEatsName: "Capriotti's - S Las Vegas", doordashName: "Capriotti's (Las Vegas South)", grubhubName: null },
    ];
    
    for (const loc of sampleLocations) {
      await apiRequest("POST", "/api/locations", {
        clientId: "capriottis",
        canonicalName: loc.canonicalName,
        uberEatsName: loc.uberEatsName,
        doordashName: loc.doordashName,
        grubhubName: loc.grubhubName,
        isVerified: true,
      });
    }
    
    locations = await apiRequest("GET", "/api/locations");
    console.log(`Created ${locations.length} sample locations`);
  }

  console.log(`Found ${locations.length} locations`);

  // Generate 6 weeks of data (9/1/2025 to 10/6/2025)
  const weeks = [
    { start: "2025-09-01", end: "2025-09-07" },
    { start: "2025-09-08", end: "2025-09-14" },
    { start: "2025-09-15", end: "2025-09-21" },
    { start: "2025-09-22", end: "2025-09-28" },
    { start: "2025-09-29", end: "2025-10-05" },
    { start: "2025-10-06", end: "2025-10-12" },
  ];

  let recordsCreated = 0;

  for (const location of locations) {
    for (const week of weeks) {
      // Generate realistic sample data with some variance
      const baseSales = Math.floor(Math.random() * 3000) + 4000; // $4k-$7k
      const marketingPercent = Math.floor(Math.random() * 6) + 5; // 5-10%
      const marketingSales = Math.floor((baseSales * marketingPercent) / 100);
      const marketingSpend = Math.floor(marketingSales / (Math.random() * 3 + 3)); // ROAS 3-6
      const roas = marketingSales / marketingSpend;
      
      // Payout calculations (70-88% of sales)
      const payoutPercent = Math.floor(Math.random() * 18) + 70; // 70-88%
      const payout = Math.floor((baseSales * payoutPercent) / 100);
      
      // COGS (46% of payout)
      const payoutWithCogs = Math.floor(payout * 0.54); // Remaining after 46% COGS

      await apiRequest("POST", "/api/location-weekly-financials", {
        locationId: location.id,
        clientId: location.clientId,
        weekStartDate: week.start,
        weekEndDate: week.end,
        sales: baseSales,
        marketingSales,
        marketingSpend,
        marketingPercent,
        roas: parseFloat(roas.toFixed(1)),
        payout,
        payoutPercent,
        payoutWithCogs,
      });

      recordsCreated++;
    }
  }

  console.log(`✓ Created ${recordsCreated} weekly financial records`);
  console.log(`  ${locations.length} locations × ${weeks.length} weeks`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateWeeklyFinancials()
    .then(() => {
      console.log("\n✓ Weekly financials generation complete!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("✗ Error generating weekly financials:", error);
      process.exit(1);
    });
}

export { generateWeeklyFinancials };
