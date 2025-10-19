import { writeFileSync } from "fs";
import { db } from "../server/db";
import { locations, clients } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("📋 Generating manual location mapping template...\n");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }

  const dbLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));

  // Collect all unique platform-specific names
  const platformNames: Array<{
    platform: string;
    name: string;
    currentLocationId: string;
  }> = [];

  for (const loc of dbLocations) {
    if (loc.uberEatsName) {
      platformNames.push({
        platform: "UberEats",
        name: loc.uberEatsName,
        currentLocationId: loc.id,
      });
    }
    if (loc.doordashName) {
      platformNames.push({
        platform: "DoorDash",
        name: loc.doordashName,
        currentLocationId: loc.id,
      });
    }
    if (loc.grubhubName) {
      platformNames.push({
        platform: "Grubhub",
        name: loc.grubhubName,
        currentLocationId: loc.id,
      });
    }
  }

  console.log(`Found ${platformNames.length} platform-specific location names\n`);

  // Generate CSV template
  const csvRows = [
    "Platform,Platform Location Name,Suggested Store ID,Correct Store ID (FILL THIS IN),Notes",
    ...platformNames.map((p) => {
      // Try to extract Store ID from name
      const storeIdMatch = p.name.match(/\(([A-Z]{2}\d+)\)/i);
      const suggestedStoreId = storeIdMatch ? storeIdMatch[1].toUpperCase() : "";
      
      return `"${p.platform}","${p.name.replace(/"/g, '""')}","${suggestedStoreId}","",""`;
    }),
  ];

  const csv = csvRows.join("\n");
  writeFileSync("manual-location-mapping.csv", csv);

  console.log("✅ Template saved to: manual-location-mapping.csv");
  console.log("\n📝 Instructions:");
  console.log("   1. Open manual-location-mapping.csv");
  console.log("   2. Fill in the 'Correct Store ID' column for each location");
  console.log("      - Use Store IDs from your master list (e.g., AL100443, CA084, NV142)");
  console.log("      - Leave blank if location should be deleted/ignored");
  console.log("   3. Save the file");
  console.log("   4. Run the import script to apply mappings\n");
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});
