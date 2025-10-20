import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { db } from "../server/db";
import { locations } from "../shared/schema";
import { eq } from "drizzle-orm";

const CAPRIOTTIS_CLIENT_ID = "83506705-b408-4f0a-a9b0-e5b585db3b7d";

console.log("🔍 Diagnosing unmapped locations across all platforms...\n");

function extractCodeFromParentheses(text: string): string | null {
  const match = text.match(/\(([A-Za-z0-9|-]+)\)/);
  return match ? match[1].trim() : null;
}

async function analyzeUberEats(filePath: string, weekLabel: string) {
  console.log(`\n📊 Analyzing UberEats ${weekLabel}...`);
  console.log("=".repeat(80));
  
  const csv = readFileSync(filePath, "utf-8");
  const rows = parse(csv, { 
    columns: true, 
    skip_empty_lines: true, 
    trim: true,
    from_line: 1,
    relax_quotes: true
  });
  
  const storeMatches = new Map<string, { count: number; example: string }>();
  let totalRows = 0;
  let matchedRows = 0;
  
  const allLocations = await db.select().from(locations).where(eq(locations.clientId, CAPRIOTTIS_CLIENT_ID));
  
  for (const row of rows) {
    totalRows++;
    const storeName = row["Store Name"] || row["\ufeffStore Name"] || "";
    
    if (!storeName || storeName.trim() === "") {
      continue;
    }
    
    const extractedCode = extractCodeFromParentheses(storeName);
    if (extractedCode) {
      const location = allLocations.find(l => l.uberEatsStoreLabel === extractedCode);
      
      if (location) {
        matchedRows++;
      } else {
        const existing = storeMatches.get(extractedCode);
        if (existing) {
          existing.count++;
        } else {
          storeMatches.set(extractedCode, { count: 1, example: storeName });
        }
      }
    } else {
      const existing = storeMatches.get(storeName);
      if (existing) {
        existing.count++;
      } else {
        storeMatches.set(storeName, { count: 1, example: storeName });
      }
    }
  }
  
  console.log(`  Total rows: ${totalRows}`);
  console.log(`  Matched: ${matchedRows} (${((matchedRows / totalRows) * 100).toFixed(1)}%)`);
  console.log(`  Unmapped: ${totalRows - matchedRows} (${(((totalRows - matchedRows) / totalRows) * 100).toFixed(1)}%)`);
  console.log(`\n  Unmapped stores (${storeMatches.size} unique):`);
  
  const sorted = Array.from(storeMatches.entries()).sort((a, b) => b[1].count - a[1].count);
  sorted.forEach(([code, data]) => {
    console.log(`    ${code}: ${data.count} transactions (e.g., "${data.example}")`);
  });
}

async function analyzeDoorDashSummary(filePath: string, weekLabel: string) {
  console.log(`\n📊 Analyzing DoorDash Summary ${weekLabel}...`);
  console.log("=".repeat(80));
  
  const csv = readFileSync(filePath, "utf-8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
  
  const storeMatches = new Map<string, { storeId: string; count: number }>();
  let totalStores = 0;
  let matchedStores = 0;
  
  const allLocations = await db.select().from(locations).where(eq(locations.clientId, CAPRIOTTIS_CLIENT_ID));
  
  for (const row of rows) {
    totalStores++;
    const storeName = row["Store Name"] || "";
    const storeId = row["Merchant Store ID"] || "";
    
    const location = allLocations.find(l => 
      l.doordashStoreKey === storeId ||
      (l.doordashStoreKey && storeId && l.doordashStoreKey.includes(storeId.split('-')[0]))
    );
    
    if (location) {
      matchedStores++;
    } else {
      storeMatches.set(storeName, { storeId, count: 1 });
    }
  }
  
  console.log(`  Total stores: ${totalStores}`);
  console.log(`  Matched: ${matchedStores} (${((matchedStores / totalStores) * 100).toFixed(1)}%)`);
  console.log(`  Unmapped: ${totalStores - matchedStores} (${(((totalStores - matchedStores) / totalStores) * 100).toFixed(1)}%)`);
  console.log(`\n  Unmapped stores (${storeMatches.size} unique):`);
  
  const sorted = Array.from(storeMatches.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  sorted.forEach(([name, data]) => {
    console.log(`    "${name}" (ID: ${data.storeId})`);
  });
}

async function main() {
  await analyzeUberEats(
    "attached_assets/de1f7aa7-43c3-406d-a907-6e3628a23684-united_states_1760939066315.csv",
    "9/15"
  );
  
  await analyzeUberEats(
    "attached_assets/aa8b1212-5eb3-4c31-82bf-61118961e3c9-united_states_1760938287485.csv",
    "9/29"
  );
  
  await analyzeDoorDashSummary(
    "attached_assets/financials_detailed_transactions_summarized_us_2025-09-15_2025-09-21_1ZdEK_2025-10-20T05-42-41Z_1760939066315.csv",
    "9/15"
  );
  
  console.log("\n" + "=".repeat(80));
  console.log("✅ Diagnosis complete!");
}

main().catch(console.error);
