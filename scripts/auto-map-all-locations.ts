import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync } from "fs";
import { db } from "../server/db";
import { locations, clients } from "../shared/schema";
import { eq } from "drizzle-orm";

interface MasterLocation {
  storeId: string;
  shopName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

interface UberEatsLocation {
  locationCode: string;
  storeName: string;
  address: string;
  city: string;
  state: string;
}

interface LocationMatch {
  platform: string;
  platformName: string;
  matchedStoreId: string | null;
  matchedShopName: string | null;
  matchMethod: string;
  confidence: number;
  notes: string;
}

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  
  const words1 = s1.split(/\s+/);
  const words2 = s2.split(/\s+/);
  const commonWords = words1.filter(w => words2.includes(w) && w.length > 2);
  
  if (commonWords.length > 0) {
    return Math.min(commonWords.length / Math.max(words1.length, words2.length) * 1.5, 0.9);
  }
  
  return 0;
}

function extractCityFromPlatformName(name: string): string[] {
  const cities: string[] = [];
  
  // Pattern: "Street - City" (e.g., "Broadway - Tucson")
  const dashPattern = name.match(/[-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (dashPattern) {
    cities.push(dashPattern[1].toLowerCase());
  }
  
  // Pattern: City at end (e.g., "Shepherd - Fresno")
  const endPattern = name.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)$/);
  if (endPattern && endPattern[1] !== "Shop") {
    cities.push(endPattern[1].toLowerCase());
  }
  
  return cities;
}

function extractStreetKeywords(name: string): string[] {
  const keywords: string[] = [];
  const lowerName = name.toLowerCase()
    .replace(/capriotti'?s?\s*(sandwich\s*shop)?/gi, "")
    .replace(/\([^)]+\)/g, ""); // Remove parentheses content
  
  const streetTypes = ['dr', 'drive', 'rd', 'road', 'st', 'street', 'ave', 'avenue', 'blvd', 'boulevard', 'pkwy', 'parkway', 'hwy', 'highway', 'way', 'ln', 'lane'];
  const words = lowerName.split(/[\s\-,]+/).filter(w => w.length > 2);
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Skip common words
    if (['and', 'the', 'of', 'suite', 'ste', 'unit'].includes(word)) {
      continue;
    }
    
    // Include street-related words
    if (streetTypes.includes(word)) {
      keywords.push(word);
      if (i > 0) keywords.push(words[i-1]); // Include preceding word
    } else if (word.length > 3 && !word.match(/^\d+$/)) {
      keywords.push(word);
    }
  }
  
  return [...new Set(keywords)]; // Remove duplicates
}

function matchLocation(
  platformName: string,
  platform: string,
  masterLocations: MasterLocation[],
  uberEatsLocations: UberEatsLocation[]
): LocationMatch {
  // STAGE 1: Extract Store ID from platform name
  const storeIdPattern = /\(([A-Z]{2}\d+)\)/i;
  const match = platformName.match(storeIdPattern);
  
  if (match) {
    const extractedStoreId = match[1].toUpperCase();
    const masterLoc = masterLocations.find((m) => m.storeId === extractedStoreId);
    
    if (masterLoc) {
      return {
        platform,
        platformName,
        matchedStoreId: masterLoc.storeId,
        matchedShopName: masterLoc.shopName,
        matchMethod: "store_id_exact",
        confidence: 1.0,
        notes: "Extracted Store ID from name",
      };
    }
  }
  
  // STAGE 2: City + Address matching
  const platformCities = extractCityFromPlatformName(platformName);
  const streetKeywords = extractStreetKeywords(platformName);
  
  let bestMatch: LocationMatch | null = null;
  let bestScore = 0;
  
  for (const masterLoc of masterLocations) {
    let score = 0;
    let matchDetails: string[] = [];
    
    // City match (high weight)
    const cityMatch = platformCities.some(city => 
      masterLoc.city.toLowerCase().includes(city) || 
      city.includes(masterLoc.city.toLowerCase())
    );
    if (cityMatch) {
      score += 0.5;
      matchDetails.push("city");
    }
    
    // Address/street keyword match
    const masterAddress = masterLoc.address.toLowerCase();
    const matchingKeywords = streetKeywords.filter(kw => masterAddress.includes(kw));
    if (matchingKeywords.length > 0) {
      const keywordScore = Math.min(matchingKeywords.length * 0.25, 0.5);
      score += keywordScore;
      matchDetails.push(`street:${matchingKeywords.join(",")}`);
    }
    
    // Shop name similarity
    const cleanPlatformName = platformName.toLowerCase()
      .replace(/capriotti'?s?\s*(sandwich\s*shop)?/gi, "")
      .replace(/\([^)]+\)/g, "")
      .replace(/\s*-\s*/g, " ")
      .trim();
    const cleanMasterName = masterLoc.shopName.toLowerCase()
      .replace(/[A-Z]{2}\d+\s*/gi, "")
      .replace(/capriotti'?s?\s*/gi, "")
      .trim();
    
    const nameSim = calculateSimilarity(cleanPlatformName, cleanMasterName);
    if (nameSim >= 0.3) {
      score += nameSim * 0.3;
      matchDetails.push("name");
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        platform,
        platformName,
        matchedStoreId: masterLoc.storeId,
        matchedShopName: masterLoc.shopName,
        matchMethod: "address_city",
        confidence: Math.min(score, 1.0),
        notes: matchDetails.join(", "),
      };
    }
  }
  
  // STAGE 3: UberEats cross-reference (if applicable)
  if (platform === "ubereats") {
    const uberLoc = uberEatsLocations.find(ue => 
      ue.storeName.toLowerCase().includes(platformName.toLowerCase()) ||
      platformName.toLowerCase().includes(ue.city.toLowerCase())
    );
    
    if (uberLoc) {
      const masterLoc = masterLocations.find(m => m.storeId === uberLoc.locationCode);
      if (masterLoc && (!bestMatch || bestScore < 0.9)) {
        return {
          platform,
          platformName,
          matchedStoreId: masterLoc.storeId,
          matchedShopName: masterLoc.shopName,
          matchMethod: "ubereats_crossref",
          confidence: 0.85,
          notes: "Matched via UberEats location list",
        };
      }
    }
  }
  
  if (bestMatch && bestScore >= 0.4) {
    return bestMatch;
  }
  
  // STAGE 4: Unmatched
  return {
    platform,
    platformName,
    matchedStoreId: null,
    matchedShopName: null,
    matchMethod: "unmatched",
    confidence: 0,
    notes: "No confident match found",
  };
}

async function main() {
  console.log("🚀 Automatic Location Mapping\n");
  
  // Load master location list
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
    }));
  
  console.log(`✅ Loaded ${masterLocations.length} master locations`);
  
  // Load UberEats location list
  const uberEatsCsv = readFileSync(
    "attached_assets/Pasted-Location-Code-Store-Name-Street-Address-City-State-Zip-Code-External-Store-ID-AL100443-Capriotti-s-S-1760896162704_1760896162705.txt",
    "utf-8"
  );
  
  const uberEatsRows = parse(uberEatsCsv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true, // Handle rows with missing columns
  });
  
  const uberEatsLocations: UberEatsLocation[] = uberEatsRows.map((row: any) => ({
    locationCode: row["Location Code"],
    storeName: row["Store Name"],
    address: row["Street Address"],
    city: row["City"],
    state: row["State"],
  }));
  
  console.log(`✅ Loaded ${uberEatsLocations.length} UberEats locations\n`);
  
  // Get Capriotti's client
  const [client] = await db.select().from(clients).where(eq(clients.name, "Capriotti's"));
  if (!client) {
    console.error("Capriotti's client not found!");
    process.exit(1);
  }
  
  // Get all database locations
  const dbLocations = await db.select().from(locations).where(eq(locations.clientId, client.id));
  
  // Collect all platform-specific names
  const platformNames: Array<{ platform: string; name: string; locationId: string }> = [];
  
  for (const loc of dbLocations) {
    if (loc.uberEatsName) {
      platformNames.push({ platform: "ubereats", name: loc.uberEatsName, locationId: loc.id });
    }
    if (loc.doordashName) {
      platformNames.push({ platform: "doordash", name: loc.doordashName, locationId: loc.id });
    }
    if (loc.grubhubName) {
      platformNames.push({ platform: "grubhub", name: loc.grubhubName, locationId: loc.id });
    }
  }
  
  console.log(`📍 Found ${platformNames.length} platform-specific location names\n`);
  console.log("🔍 Matching locations...\n");
  
  // Match all locations
  const matches: LocationMatch[] = [];
  
  for (const platLoc of platformNames) {
    const match = matchLocation(platLoc.name, platLoc.platform, masterLocations, uberEatsLocations);
    matches.push(match);
    
    // Display match with confidence indicator
    const icon = match.confidence >= 0.8 ? "✅" : match.confidence >= 0.5 ? "⚠️" : "❌";
    const confStr = (match.confidence * 100).toFixed(0);
    
    if (match.matchedStoreId) {
      console.log(`${icon} [${confStr}%] ${platLoc.platform.padEnd(10)} "${platLoc.name}" → ${match.matchedStoreId} (${match.matchMethod})`);
    } else {
      console.log(`${icon} [${confStr}%] ${platLoc.platform.padEnd(10)} "${platLoc.name}" → UNMATCHED`);
    }
  }
  
  // Generate summary
  const highConfidence = matches.filter(m => m.confidence >= 0.8).length;
  const mediumConfidence = matches.filter(m => m.confidence >= 0.5 && m.confidence < 0.8).length;
  const lowConfidence = matches.filter(m => m.confidence < 0.5).length;
  
  console.log(`\n📊 Matching Summary:`);
  console.log(`   ✅ High confidence (≥80%): ${highConfidence}`);
  console.log(`   ⚠️  Medium confidence (50-79%): ${mediumConfidence}`);
  console.log(`   ❌ Low/No match (<50%): ${lowConfidence}`);
  console.log(`   📈 Overall match rate: ${((highConfidence + mediumConfidence) / matches.length * 100).toFixed(1)}%`);
  
  // Save detailed CSV report
  const csvRows = [
    "Platform,Platform Location Name,Matched Store ID,Matched Shop Name,Match Method,Confidence,Notes",
    ...matches.map(m => 
      `"${m.platform}","${m.platformName.replace(/"/g, '""')}","${m.matchedStoreId || ""}","${m.matchedShopName || ""}","${m.matchMethod}","${m.confidence.toFixed(2)}","${m.notes}"`
    ),
  ];
  
  writeFileSync("auto-location-mapping-report.csv", csvRows.join("\n"));
  console.log(`\n✅ Report saved to: auto-location-mapping-report.csv`);
  
  // Flag low-confidence matches for review
  const needsReview = matches.filter(m => m.confidence < 0.8 && m.confidence > 0);
  if (needsReview.length > 0) {
    console.log(`\n⚠️  ${needsReview.length} matches need review (confidence <80%):`);
    needsReview.slice(0, 10).forEach(m => {
      console.log(`   - [${(m.confidence * 100).toFixed(0)}%] ${m.platform}: "${m.platformName}" → ${m.matchedStoreId}`);
    });
    if (needsReview.length > 10) {
      console.log(`   ... and ${needsReview.length - 10} more (see CSV report)`);
    }
  }
  
  const unmatched = matches.filter(m => m.confidence === 0);
  if (unmatched.length > 0) {
    console.log(`\n❌ ${unmatched.length} unmatched locations:`);
    unmatched.forEach(m => {
      console.log(`   - ${m.platform}: "${m.platformName}"`);
    });
  }
  
  console.log(`\n📝 Next step: Review auto-location-mapping-report.csv and approve matches`);
}

main().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});
