import { db } from "./db";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";
import { DbStorage } from "./db-storage";

const storage = new DbStorage(db);

async function processGrubhubFile() {
  console.log("\n📦 Processing Grubhub file...");
  
  const csvContent = readFileSync("/tmp/grubhub_upload.csv", "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`   Found ${records.length} transactions`);
  
  // Use clientId "1" (Capriotti's)
  const clientId = "1";
  
  let processed = 0;
  let mapped = 0;
  let unmapped = 0;

  for (const row of records) {
    try {
      // Extract store_number for matching
      const storeNumber = row.store_number?.trim();
      
      // Find location by store_number (matches grubhub_store_number column)
      let locationId = null;
      
      if (storeNumber) {
        // Try to find location by grubhub_store_number
        const locations = await storage.getLocationsByClient(clientId);
        const location = locations.find(l => 
          l.grubhubStoreNumber === storeNumber || 
          l.storeId === storeNumber
        );
        
        if (location) {
          locationId = location.id;
          mapped++;
        } else {
          unmapped++;
        }
      } else {
        unmapped++;
      }

      // Create transaction
      await storage.createGrubhubTransaction({
        clientId,
        locationId: locationId || null,
        orderNumber: row.order_number || "",
        transactionDate: row.transaction_date || "",
        restaurant: row.store_name || "",
        grubhubStoreId: row.grubhub_store_id || null,
        storeNumber: storeNumber || null,
        streetAddress: row.street_address || null,
        city: row.city || null,
        state: row.state || null,
        postalCode: row.postal_code || null,
        transactionType: row.transaction_type || null,
        fulfillmentType: row.fulfillment_type || null,
        subtotal: parseFloat(row.subtotal || "0"),
        subtotalSalesTax: parseFloat(row.subtotal_sales_tax || "0"),
        merchantServiceFee: parseFloat(row.merchant_service_fee || "0"),
        commissionFee: parseFloat(row.commission_fee || "0"),
        deliveryFee: parseFloat(row.delivery_fee || "0"),
        totalPayout: parseFloat(row.total_payout || "0"),
      });

      processed++;
      if (processed % 100 === 0) {
        console.log(`   Processed ${processed}/${records.length} (${mapped} mapped, ${unmapped} unmapped)`);
      }
    } catch (error) {
      console.error(`   Error processing row:`, error);
    }
  }

  console.log(`✅ Grubhub complete: ${processed} processed (${mapped} mapped, ${unmapped} unmapped)\n`);
}

async function processUberEatsFile() {
  console.log("\n📦 Processing Uber Eats file...");
  
  const csvContent = readFileSync("/tmp/ubereats_upload.csv", "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`   Found ${records.length} transactions`);
  
  const clientId = "1";
  
  let processed = 0;
  let mapped = 0;
  let unmapped = 0;

  // Helper function to extract code from parentheses
  function extractCodeFromParentheses(str: string): string | null {
    if (!str) return null;
    const match = str.match(/\(([A-Z]{2}\d+)\)/);
    return match ? match[1] : null;
  }

  for (const row of records) {
    try {
      const storeName = row["Store Name"] || row.store_name || "";
      const storeId = row["Store ID"] || row.store_id || "";
      const workflowId = row["Workflow ID"] || row.workflow_id || "";
      
      // Skip if no workflow ID (ad spend rows, etc.)
      if (!workflowId) {
        continue;
      }

      // Extract store code from Store Name (e.g., "Capriotti's (IA069)" → "IA069")
      const extractedCode = extractCodeFromParentheses(storeName);
      
      // Find location by matching extracted code to uberEatsStoreLabel
      let locationId = null;
      
      if (extractedCode) {
        const locations = await storage.getLocationsByClient(clientId);
        const location = locations.find(l => 
          l.uberEatsStoreLabel === extractedCode ||
          l.storeId === extractedCode
        );
        
        if (location) {
          locationId = location.id;
          mapped++;
        } else {
          unmapped++;
        }
      } else {
        unmapped++;
      }

      // Parse dates
      const orderDate = row["Order Date"] || row.order_date || "";
      const payoutDate = row["Payout Date"] || row.payout_date || "";

      // Create transaction
      await storage.createUberEatsTransaction({
        clientId,
        locationId: locationId || null,
        location: storeName,
        storeId: storeId || null,
        orderId: row["Order ID"] || row.order_id || null,
        workflowId,
        diningMode: row["Dining Mode"] || row.dining_mode || null,
        orderStatus: row["Order Status"] || row.order_status || null,
        orderDate,
        salesExclTax: parseFloat(row["Sales (excl. tax)"] || row.sales_excl_tax || "0"),
        taxOnSales: parseFloat(row["Tax on Sales"] || row.tax_on_sales || "0"),
        salesInclTax: parseFloat(row["Sales (incl. tax)"] || row.sales_incl_tax || "0"),
        uberServiceFee: parseFloat(row["Uber Service Fee"] || row.uber_service_fee || "0"),
        uberDeliveryFee: parseFloat(row["Uber Delivery Fee"] || row.uber_delivery_fee || "0"),
        taxOnUberDeliveryFee: parseFloat(row["Tax on Uber Delivery Fee"] || row.tax_on_uber_delivery_fee || "0"),
        promotionFundedByUber: parseFloat(row["Promotion funded by Uber"] || row.promotion_funded_by_uber || "0"),
        promotionFundedByRestaurant: parseFloat(row["Promotion funded by restaurant"] || row.promotion_funded_by_restaurant || "0"),
        totalPayout: parseFloat(row["Total payout"] || row.total_payout || row["Total payout "] || "0"),
        payoutDate,
      });

      processed++;
      if (processed % 500 === 0) {
        console.log(`   Processed ${processed}/${records.length} (${mapped} mapped, ${unmapped} unmapped)`);
      }
    } catch (error) {
      console.error(`   Error processing row:`, error);
    }
  }

  console.log(`✅ Uber Eats complete: ${processed} processed (${mapped} mapped, ${unmapped} unmapped)\n`);
}

async function main() {
  console.log("🚀 Starting data import process...\n");
  
  try {
    await processGrubhubFile();
    await processUberEatsFile();
    
    console.log("\n✅ All imports complete! Run diagnostic to see results:");
    console.log("   tsx server/quick-diagnostic.ts");
  } catch (error) {
    console.error("\n❌ Import failed:", error);
    process.exit(1);
  }
}

main();
