import { readFileSync, writeFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { db } from "../server/db";
import { locations, clients } from "../shared/schema";
import { eq } from "drizzle-orm";

interface LocationMatch {
  platform: string;
  platformName: string;
  matchedStoreId: string;
  matchedShopName: string;
  matchMethod: string;
  confidence: number;
  notes: string;
}

async function main() {
  console.log("🚀 Applying high-confidence location matches (≥90%)\n");

  // Load match report
  const reportCsv = readFileSync("auto-location-mapping-report.csv", "utf-8");
  const rows = parse(reportCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  // Filter for high confidence matches (≥0.9)
  const highConfidenceMatches = rows.filter((row: any) => {
    const confidence = parseFloat(row.Confidence);
    return confidence >= 0.9 && row["Matched Store ID"];
  });

  console.log(`Found ${highConfidenceMatches.length} high-confidence matches to apply\n`);

  // Load master location list for address/city/state/zip data
  const masterCsv = readFileSync(
    "attached_assets/Pasted-Status-Open-Date-Shop-IDs-Owned-SHOP-Store-ID-Franchisee-Group-Shop-Address-City-State-Zip-Public--1760895435341_1760895435342.txt",
    "utf-8"
  );

  const masterRows = parse(masterCsv, {
    columns: true,
    skip_empty_lines: true,
    delimiter: "\t",
    trim: true,
  });

  const masterLocations = new Map(
    masterRows
      .filter((row: any) => row["Store ID"] && row["Status"] === "Active")
      .map((row: any) => [
        row["Store ID"],
        {
          storeId: row["Store ID"],
          shopName: row["Shop IDs Owned"],
          address: row["Shop Address"],
          city: row["City"],
          state: row["State"],
          zip: row["Zip"],
        },
      ])
  );

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }

  // Get all database locations
  const dbLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));

  let appliedCount = 0;
  let errorCount = 0;

  for (const match of highConfidenceMatches) {
    const platform = match.Platform as string;
    const platformName = match["Platform Location Name"] as string;
    const storeId = match["Matched Store ID"] as string;
    const confidence = parseFloat(match.Confidence);

    // Find the database location that has this platform-specific name
    const dbLoc = dbLocations.find((loc) => {
      if (platform === "ubereats" && loc.uberEatsName === platformName) return true;
      if (platform === "doordash" && loc.doordashName === platformName) return true;
      if (platform === "grubhub" && loc.grubhubName === platformName) return true;
      return false;
    });

    if (!dbLoc) {
      console.log(`⚠️  Could not find database location for: ${platform}:"${platformName}"`);
      errorCount++;
      continue;
    }

    // Get master location data
    const masterLoc = masterLocations.get(storeId);
    if (!masterLoc) {
      console.log(`⚠️  Could not find master location for Store ID: ${storeId}`);
      errorCount++;
      continue;
    }

    // Update the database location with canonical data
    await db
      .update(locations)
      .set({
        canonicalName: masterLoc.shopName,
        address: masterLoc.address,
        city: masterLoc.city,
        state: masterLoc.state,
        zip: masterLoc.zip,
        isVerified: true,
      })
      .where(eq(locations.id, dbLoc.id));

    console.log(
      `✅ [${(confidence * 100).toFixed(0)}%] ${platform.padEnd(10)} "${platformName}" → ${storeId} ${masterLoc.shopName}`
    );
    appliedCount++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Applied: ${appliedCount}`);
  console.log(`   ⚠️  Errors: ${errorCount}`);
  console.log(`   📝 Total processed: ${highConfidenceMatches.length}`);

  // Generate manual review CSV for remaining locations
  console.log(`\n📝 Generating manual review CSV for remaining locations...`);

  const lowMediumConfidence = rows.filter((row: any) => {
    const confidence = parseFloat(row.Confidence);
    return confidence < 0.9;
  });

  const manualReviewRows = [
    "Platform,Platform Location Name,Suggested Store ID,Suggested Shop Name,Confidence,Match Method,Notes,Correct Store ID (FILL THIS IN)",
    ...lowMediumConfidence.map((row: any) => {
      const suggestedStoreId = row["Matched Store ID"] || "";
      const suggestedShopName = row["Matched Shop Name"] || "";
      const confidence = row.Confidence || "0";
      const matchMethod = row["Match Method"] || "";
      const notes = (row.Notes || "").replace(/"/g, '""');
      
      return `"${row.Platform}","${row["Platform Location Name"]}","${suggestedStoreId}","${suggestedShopName}","${confidence}","${matchMethod}","${notes}",""`;
    }),
  ];

  writeFileSync("manual-review-locations.csv", manualReviewRows.join("\n"));
  console.log(`✅ Manual review CSV saved to: manual-review-locations.csv`);
  console.log(`   📊 ${lowMediumConfidence.length} locations need manual review\n`);

  console.log("✅ Location consolidation complete!");
  console.log("\n📝 Next steps:");
  console.log("   1. Review manual-review-locations.csv");
  console.log("   2. Fill in 'Correct Store ID' column for medium/low confidence matches");
  console.log("   3. Run import script to apply manual mappings");
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});
