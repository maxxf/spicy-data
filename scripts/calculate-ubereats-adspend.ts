import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";

const UBEREATS_FILE = "attached_assets/8b03ddef-cfc0-4821-8219-abe7664064f9-united_states_1761063414058.csv";

const buffer = readFileSync(UBEREATS_FILE);

// Parse CSV - skip first 2 header rows
const rows = parse(buffer, {
  columns: true,
  skip_empty_lines: true,
  trim: true,
  from_line: 2, // Skip description row
  bom: true,
});

console.log(`Parsed ${rows.length} rows\n`);

// Filter for ad spend rows in week 9/8
const weekDates = ['9/8/25', '9/9/25', '9/10/25', '9/11/25', '9/12/25', '9/13/25', '9/14/25'];

let totalAdSpend = 0;
const adSpendByDate: Record<string, number> = {};

for (const row of rows) {
  const orderDate = row["Order Date"] || '';
  const otherPaymentsDesc = row["Other payments description"] || '';
  const otherPayments = parseFloat(row["Other payments"] || "0");
  
  if (otherPaymentsDesc === "Ad Spend" && weekDates.includes(orderDate)) {
    const amount = Math.abs(otherPayments);
    totalAdSpend += amount;
    adSpendByDate[orderDate] = (adSpendByDate[orderDate] || 0) + amount;
    
    if (Object.keys(adSpendByDate).length <= 20) {
      console.log(`${orderDate}: $${amount.toFixed(2)} - ${row["Store Name"]}`);
    }
  }
}

console.log(`\n=== Week 9/8 Ad Spend Summary ===`);
console.log(`Total ad spend: $${totalAdSpend.toFixed(2)}`);
console.log(`Expected: $5,253.00`);
console.log(`\nBreakdown by date:`);
for (const date of weekDates) {
  if (adSpendByDate[date]) {
    console.log(`  ${date}: $${adSpendByDate[date].toFixed(2)}`);
  }
}
