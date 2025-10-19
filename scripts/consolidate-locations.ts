import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";
import { db } from "../server/db";
import { locations, clients } from "../shared/schema";
import { eq, or, like } from "drizzle-orm";

interface MasterLocation {
  storeId: string;
  shopName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
}

interface PlatformLocation {
  id: string;
  platformName: string;
  platform: "ubereats" | "doordash" | "grubhub";
  currentCanonicalName: string;
}

interface LocationMatch {
  platformLocation: PlatformLocation;
  masterLocation: MasterLocation | null;
  matchMethod: "store_id" | "address" | "name" | "unmatched";
  confidence: number;
  extractedStoreId?: string;
}

async function main() {
  console.log("🚀 Starting location consolidation...\n");

  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }

  // STEP 1: Parse master location list
  console.log("📋 Step 1: Parsing master location list...");
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

  const masterLocations: MasterLocation[] = masterRows
    .filter((row: any) => row["Store ID"] && row["Status"] === "Active")
    .map((row: any) => ({
      storeId: row["Store ID"],
      shopName: row["Shop IDs Owned"],
      address: row["Shop Address"],
      city: row["City"],
      state: row["State"],
      zip: row["Zip"],
      status: row["Status"],
    }));

  console.log(`✅ Parsed ${masterLocations.length} active locations from master list\n`);

  // STEP 2: Get all existing platform locations from database
  console.log("📊 Step 2: Querying existing platform locations...");
  const dbLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));

  const platformLocations: PlatformLocation[] = [];
  
  for (const loc of dbLocations) {
    if (loc.uberEatsName) {
      platformLocations.push({
        id: loc.id,
        platformName: loc.uberEatsName,
        platform: "ubereats",
        currentCanonicalName: loc.canonicalName,
      });
    }
    if (loc.doordashName) {
      platformLocations.push({
        id: loc.id,
        platformName: loc.doordashName,
        platform: "doordash",
        currentCanonicalName: loc.canonicalName,
      });
    }
    if (loc.grubhubName) {
      platformLocations.push({
        id: loc.id,
        platformName: loc.grubhubName,
        platform: "grubhub",
        currentCanonicalName: loc.canonicalName,
      });
    }
  }

  console.log(`✅ Found ${platformLocations.length} platform-specific location names\n`);

  // STEP 3: Match platform locations to master list
  console.log("🔍 Step 3: Matching platform locations to master list...\n");
  const matches: LocationMatch[] = [];

  for (const platLoc of platformLocations) {
    const match = matchLocation(platLoc, masterLocations);
    matches.push(match);

    if (match.matchMethod !== "unmatched") {
      const emoji = match.confidence >= 0.9 ? "✅" : match.confidence >= 0.7 ? "⚠️" : "❓";
      console.log(
        `${emoji} [${match.matchMethod.toUpperCase()}] ${platLoc.platform}: "${platLoc.platformName}" → "${match.masterLocation?.shopName}" (Store ID: ${match.masterLocation?.storeId}, confidence: ${match.confidence.toFixed(2)})`
      );
    }
  }

  const matchedCount = matches.filter((m) => m.matchMethod !== "unmatched").length;
  const unmatchedCount = matches.length - matchedCount;

  console.log(`\n📈 Matching Summary:`);
  console.log(`   ✅ Matched: ${matchedCount}`);
  console.log(`   ❌ Unmatched: ${unmatchedCount}`);
  console.log(`   📊 Success Rate: ${((matchedCount / matches.length) * 100).toFixed(1)}%\n`);

  // STEP 4: Generate report
  console.log("📝 Step 4: Generating location mapping report...");
  const reportRows = matches.map((m) => ({
    "Platform": m.platformLocation.platform,
    "Platform Location Name": m.platformLocation.platformName,
    "Current Canonical Name": m.platformLocation.currentCanonicalName,
    "Matched Store ID": m.masterLocation?.storeId || "",
    "Matched Shop Name": m.masterLocation?.shopName || "",
    "Matched Address": m.masterLocation?.address || "",
    "Match Method": m.matchMethod,
    "Confidence": m.confidence.toFixed(2),
    "Extracted Store ID": m.extractedStoreId || "",
  }));

  const reportCsv = [
    Object.keys(reportRows[0]).join(","),
    ...reportRows.map((row) =>
      Object.values(row)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");

  writeFileSync("location-mapping-report.csv", reportCsv);
  console.log(`✅ Report saved to: location-mapping-report.csv\n`);

  // STEP 5: Show unmatched locations for review
  const unmatchedLocations = matches.filter((m) => m.matchMethod === "unmatched");
  if (unmatchedLocations.length > 0) {
    console.log("⚠️  Unmatched Locations (need manual review):");
    unmatchedLocations.forEach((m) => {
      console.log(`   - [${m.platformLocation.platform}] "${m.platformLocation.platformName}"`);
    });
    console.log();
  }

  console.log("✅ Location consolidation analysis complete!");
  console.log("\n📊 Next steps:");
  console.log("   1. Review location-mapping-report.csv");
  console.log("   2. Verify matches look correct");
  console.log("   3. Run update script to consolidate locations in database");
}

function matchLocation(platLoc: PlatformLocation, masterLocations: MasterLocation[]): LocationMatch {
  // STAGE 1: Extract Store ID from platform name
  const storeIdPattern = /\(([A-Z]{2}\d+)\)/i; // Matches (AL100443), (IA069), etc.
  const match = platLoc.platformName.match(storeIdPattern);
  
  if (match) {
    const extractedStoreId = match[1].toUpperCase();
    const masterLoc = masterLocations.find((m) => m.storeId === extractedStoreId);
    
    if (masterLoc) {
      return {
        platformLocation: platLoc,
        masterLocation: masterLoc,
        matchMethod: "store_id",
        confidence: 1.0,
        extractedStoreId,
      };
    }
  }

  // STAGE 2: City + Street name matching
  // Extract potential city name (often appears after hyphen or in parentheses)
  const cityMatch = platLoc.platformName.match(/[-\s]([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  const platformCityHints = cityMatch ? [cityMatch[1].toLowerCase()] : [];
  
  // Extract street keywords (common street names)
  const streetKeywords = extractStreetKeywords(platLoc.platformName);
  
  for (const masterLoc of masterLocations) {
    let score = 0;
    let matches: string[] = [];
    
    // Check city match
    if (platformCityHints.some(city => masterLoc.city.toLowerCase().includes(city) || city.includes(masterLoc.city.toLowerCase()))) {
      score += 0.5;
      matches.push("city");
    }
    
    // Check street keywords in address
    const masterAddress = masterLoc.address.toLowerCase();
    const matchingKeywords = streetKeywords.filter(kw => masterAddress.includes(kw));
    if (matchingKeywords.length > 0) {
      score += 0.3 * matchingKeywords.length;
      matches.push(`street:${matchingKeywords.join(",")}`);
    }
    
    // Check shop name similarity
    const cleanPlatformName = platLoc.platformName.toLowerCase()
      .replace(/capriotti'?s?\s*(sandwich\s*shop)?/gi, "")
      .replace(/\s*-\s*/g, " ")
      .trim();
    const cleanMasterName = masterLoc.shopName.toLowerCase()
      .replace(/[A-Z]{2}\d+\s*/gi, "")
      .replace(/capriotti'?s?\s*/gi, "")
      .trim();
    
    const nameSimilarity = calculateSimilarity(cleanPlatformName, cleanMasterName);
    if (nameSimilarity >= 0.4) {
      score += nameSimilarity * 0.3;
      matches.push("name");
    }
    
    if (score >= 0.5) {
      return {
        platformLocation: platLoc,
        masterLocation: masterLoc,
        matchMethod: "address",
        confidence: Math.min(score, 1.0),
      };
    }
  }

  // STAGE 3: Fuzzy name matching on shop name only (fallback)
  const cleanPlatformName = platLoc.platformName.toLowerCase().replace(/capriotti'?s?\s*(sandwich\s*shop)?/gi, "").trim();
  
  for (const masterLoc of masterLocations) {
    const cleanMasterName = masterLoc.shopName.toLowerCase().replace(/capriotti'?s?\s*/gi, "").trim();
    
    const similarity = calculateSimilarity(cleanPlatformName, cleanMasterName);
    if (similarity >= 0.7) {
      return {
        platformLocation: platLoc,
        masterLocation: masterLoc,
        matchMethod: "name",
        confidence: similarity,
      };
    }
  }

  // STAGE 4: Unmatched
  return {
    platformLocation: platLoc,
    masterLocation: null,
    matchMethod: "unmatched",
    confidence: 0,
  };
}

function extractStreetKeywords(name: string): string[] {
  const keywords: string[] = [];
  const lowerName = name.toLowerCase();
  
  // Common street type suffixes
  const streetTypes = ['dr', 'drive', 'rd', 'road', 'st', 'street', 'ave', 'avenue', 'blvd', 'boulevard', 'pkwy', 'parkway', 'hwy', 'highway', 'way', 'ln', 'lane'];
  
  // Extract words that might be street names
  const words = lowerName.split(/[\s\-,]+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Skip common words
    if (['and', 'the', 'of', 'capriottis', 'capriotti', 'sandwich', 'shop'].includes(word)) {
      continue;
    }
    
    // If word is followed by a street type, include both
    if (i < words.length - 1 && streetTypes.includes(words[i + 1])) {
      keywords.push(word);
      keywords.push(words[i + 1]);
      i++; // Skip next word since we processed it
    } else if (streetTypes.includes(word)) {
      keywords.push(word);
    } else if (word.length > 3 && !word.match(/^\d+$/)) {
      // Include significant words (not just numbers)
      keywords.push(word);
    }
  }
  
  return keywords;
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

main().catch((error) => {
  console.error("❌ Consolidation failed:", error);
  process.exit(1);
});
