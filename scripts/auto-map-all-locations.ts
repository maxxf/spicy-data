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

interface DoorDashLocation {
  storeName: string;
  fullAddress: string;
  address: string;
  city: string;
  state: string;
  zip: string;
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
  uberEatsLocations: UberEatsLocation[],
  doordashLocations: DoorDashLocation[]
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
  
  // STAGE 3: DoorDash cross-reference (if applicable)
  if (platform === "doordash") {
    const platformNameLower = platformName.toLowerCase();
    
    // Find matching DoorDash location by comparing platform name to address in parentheses
    const ddLoc = doordashLocations.find(dd => {
      // Extract address from DoorDash store name (in parentheses)
      const ddAddressMatch = dd.storeName.match(/\(([^)]+)\)/);
      if (!ddAddressMatch) return false;
      
      const ddAddress = ddAddressMatch[1].toLowerCase();
      
      // Check if platform name contains significant parts of the DoorDash address
      // Example: platform="Broadway - Tucson", dd address="3301 E Broadway Blvd"
      const addressWords = ddAddress.split(/[\s,\-]+/).filter(w => w.length > 2 && !w.match(/^\d+$/));
      const platformWords = platformNameLower.split(/[\s,\-]+/).filter(w => w.length > 2);
      
      const matchingWords = addressWords.filter(aw => platformWords.some(pw => pw.includes(aw) || aw.includes(pw)));
      
      // Also check city match
      const cityMatch = platformNameLower.includes(dd.city.toLowerCase());
      
      // Strong match: 2+ address words OR city + 1 address word
      return matchingWords.length >= 2 || (cityMatch && matchingWords.length >= 1);
    });
    
    if (ddLoc) {
      // Now match this DoorDash address to master location list
      // CRITICAL: City must match to avoid false positives to IL110507
      for (const masterLoc of masterLocations) {
        const masterAddr = masterLoc.address.toLowerCase();
        const ddAddr = ddLoc.address.toLowerCase();
        const masterCity = masterLoc.city.toLowerCase();
        const ddCity = ddLoc.city.toLowerCase();
        
        // STRICT city match required (architect recommendation)
        const cityMatch = masterCity === ddCity || 
                         (masterCity.includes(ddCity) && ddCity.length > 3) || 
                         (ddCity.includes(masterCity) && masterCity.length > 3);
        
        if (!cityMatch) continue;
        
        // Check address similarity
        const addrSimilarity = calculateSimilarity(masterAddr, ddAddr);
        
        if (addrSimilarity >= 0.6) {
          // High confidence only if both city AND address match well
          const confidence = addrSimilarity >= 0.8 ? 0.95 : 0.75;
          return {
            platform,
            platformName,
            matchedStoreId: masterLoc.storeId,
            matchedShopName: masterLoc.shopName,
            matchMethod: "doordash_address",
            confidence,
            notes: `DD: ${ddLoc.address}, ${ddLoc.city} → ${masterLoc.storeId}`,
          };
        }
      }
      
      // If DoorDash location found but NO master match, flag for manual review
      if (ddLoc.city && ddLoc.address) {
        return {
          platform,
          platformName,
          matchedStoreId: null,
          matchedShopName: null,
          matchMethod: "doordash_no_master",
          confidence: 0,
          notes: `DD location exists (${ddLoc.address}, ${ddLoc.city}) but not in master list - needs manual review`,
        };
      }
    }
  }
  
  // STAGE 4: UberEats cross-reference (if applicable)
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
          confidence: 0.95,
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
  
  // Load UberEats location list (complete export with 140 locations)
  const uberEatsCsv = readFileSync(
    "attached_assets/Pasted-Location-Code-Store-Name-Street-Address-City-State-Zip-Code-External-Store-ID-AL100443-Capriotti-s-S-1760896883899_1760896883899.txt",
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
  
  console.log(`✅ Loaded ${uberEatsLocations.length} UberEats locations`);
  
  // Load DoorDash location list - manual parsing due to commas in addresses
  const doordashCsv = readFileSync(
    "attached_assets/Pasted-Store-Address-Capriotti-s-Sandwich-Shop-142-Los-Altos-Pkwy-142-Los-Altos-Pkwy-Sparks-NV-89436-775-1760896740029_1760896740029.txt",
    "utf-8"
  );
  
  const doordashLocations: DoorDashLocation[] = [];
  const lines = doordashCsv.split("\n");
  
  for (let i = 1; i < lines.length; i++) { // Skip header
    const line = lines[i].trim();
    if (!line) continue;
    
    // Match pattern: "Store Name (address part),full address with city state zip"
    // Example: Capriotti's Sandwich Shop (142 Los Altos Pkwy),142 Los Altos Pkwy, Sparks NV 89436-7758, United States
    const storeMatch = line.match(/^([^,]+),(.+)$/);
    if (!storeMatch) continue;
    
    const storeName = storeMatch[1].trim();
    const fullAddress = storeMatch[2].trim();
    
    // Parse full address - can be either:
    // "142 Los Altos Pkwy, Sparks NV 89436-7758, United States"
    // "Santa Fe Station Hotel & Casino, 4949 N Rancho Dr, Las Vegas NV 89130, United States"
    const addressParts = fullAddress.split(",").map(p => p.trim());
    
    // Find which part has the city/state/zip (look for pattern "City ST 12345")
    let city = "";
    let state = "";
    let zip = "";
    let streetAddress = "";
    
    for (let j = 0; j < addressParts.length; j++) {
      const part = addressParts[j];
      const cityStateMatch = part.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5})/);
      if (cityStateMatch) {
        city = cityStateMatch[1];
        state = cityStateMatch[2];
        zip = cityStateMatch[3];
        // Street address is usually the part before the city/state/zip
        streetAddress = j > 0 ? addressParts[j - 1] : addressParts[0];
        break;
      }
    }
    
    doordashLocations.push({
      storeName,
      fullAddress,
      address: streetAddress,
      city,
      state,
      zip,
    });
  }
  
  console.log(`✅ Loaded ${doordashLocations.length} DoorDash locations\n`);
  
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
    const match = matchLocation(platLoc.name, platLoc.platform, masterLocations, uberEatsLocations, doordashLocations);
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
