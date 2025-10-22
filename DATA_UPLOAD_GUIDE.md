# Data Upload Guide - Spicy Data Analytics Dashboard

## Overview
This guide provides step-by-step instructions for uploading transaction data from delivery platforms (Uber Eats, DoorDash, Grubhub) into the analytics dashboard.

## Required CSV Report Types by Platform

### Uber Eats
- **Report Name**: Payment Reports
- **Location**: Uber Eats Manager > Financials > Payment Reports
- **Date Format**: M/D/YY (e.g., 10/13/25)
- **Key Fields**: Store Name, Store ID, Workflow ID, Order Status, Sales (excl. tax), Total payout

### DoorDash
- **Report Name**: Financial Report > Transactions Overview
- **Location**: DoorDash Merchant Portal > Financials > Reports
- **Date Format**: YYYY-MM-DD (e.g., 2025-10-13)
- **Key Fields**: Store Location, Transaction ID, Transaction Date, Transaction Type, Channel, Sales (excl. tax)

### Grubhub
- **Report Name**: Transaction Reports
- **Location**: Grubhub for Restaurants > Reports
- **Date Format**: YYYY-MM-DD (e.g., 2025-10-13)
- **Key Fields**: Restaurant, Order ID, Transaction ID, Order Date, Subtotal, Sales Tax

## Upload Steps

### 1. Navigate to Upload Page
- Log into the dashboard
- Click **"Upload"** in the sidebar navigation
- Select the appropriate platform tab (Uber Eats, DoorDash, or Grubhub)

### 2. Select Client
- Choose **"Capriotti's Sandwich Shop"** from the client dropdown
- This ensures transactions are associated with the correct account

### 3. Upload Transaction Data
- Click **"Choose File"** or drag-and-drop the CSV file
- Select the CSV report downloaded from the platform
- Click **"Upload Transaction Data"**
- Wait for processing to complete (may take 30-60 seconds for large files)

### 4. Verify Upload Success
- Check the success message showing number of transactions imported
- Review the transaction count (should match expected weekly volumes)
- Note: Duplicate transactions are automatically prevented using unique identifiers

## Current Data Gaps (as of Oct 22, 2025)

### 🚨 CRITICAL: Missing Uber Eats Week 10/13
- **Date Range**: Oct 13-19, 2025
- **Status**: MISSING from database
- **Expected Volume**: ~3,500 orders / ~$120,000 in sales (all locations)
- **Impact**: Corp locations report shows $48K instead of expected $168K for week 10/13
- **File Provided**: `united_states_1761146728649.csv` (ready to upload)

### ⚠️ Missing Grubhub Week 9/15
- **Date Range**: Sep 15-21, 2025
- **Status**: MISSING from database
- **Expected Volume**: ~1,361 orders / ~$45,226

## Location Mapping

### How Location Matching Works
The system uses a master location sheet (Google Sheets) to map platform-specific location names to canonical store IDs:

1. **Uber Eats**: Matches by `Store ID` field (e.g., "79|15654") against `ubereats_store_label` in locations table
2. **DoorDash**: Matches by `Merchant Store ID` against `doordash_store_key` in locations table
3. **Grubhub**: Matches by `Store Number` (extracted from restaurant name) or address fuzzy matching

### Unmapped Locations
- Transactions from unmapped locations are assigned to "Unmapped Locations" bucket
- Check the Dashboard page to see unmapped transaction counts by platform
- Contact admin to update master location sheet if new stores need to be added

## Data Processing Rules

### Uber Eats
- **Included Orders**: Only "Completed" status orders
- **Sales Metric**: Uses `Sales (excl. tax)` field (not `Sales (incl. tax)`)
- **Deduplication**: Uses `Workflow ID` as unique identifier
- **Marketing Spend**: Sums "Ad Spend" + promotional offers + redemption fees
- **Payout**: Uses `Total payout` field

### DoorDash
- **Included Orders**: Only "Marketplace" channel transactions with Transaction Type = "Order" (or blank/null)
- **Excluded Orders**: "Storefront" channel orders are filtered out during upload
- **Sales Metric**: Uses `Sales (excl. tax)` field
- **Deduplication**: Uses `Transaction ID` as unique identifier
- **Marketing Spend**: Sums "Marketing fees" + promotional discounts + credits
- **Payout**: Uses `Total Payout` field

### Grubhub
- **Included Orders**: Only "Prepaid Order" transaction types
- **Sales Metric**: Sums `Subtotal` + `Subtotal Sales Tax`
- **Deduplication**: Uses `Transaction ID` as unique identifier
- **Payout**: Uses `Merchant Net Total` field

## Expected Upload Times
- **Small files** (<1,000 transactions): 10-15 seconds
- **Medium files** (1,000-5,000 transactions): 30-45 seconds
- **Large files** (5,000-20,000 transactions): 60-120 seconds

## Troubleshooting

### Upload Fails or Times Out
- Check file format matches required CSV structure
- Ensure file is not corrupted (open in Excel/Google Sheets to verify)
- Try uploading smaller date ranges if file is very large (>25,000 rows)

### Transactions Not Appearing in Reports
- Verify correct client was selected during upload
- Check that location names match master location sheet
- Review "Unmapped Locations" count on Dashboard page
- Ensure transaction dates fall within the dashboard's date range filter

### Duplicate Data Warnings
- The system automatically prevents duplicates using platform-specific unique IDs
- If you re-upload the same file, existing transactions will be skipped
- This is safe and prevents double-counting in analytics

## Post-Upload Verification

### 1. Check Dashboard Overview
- Navigate to Dashboard page
- Set date filter to the uploaded week
- Verify sales totals match expected values from source platform reports

### 2. Review Location Metrics
- Go to Locations page
- Filter by platform and date range
- Check that individual locations show expected sales volumes

### 3. Corporate Locations Report
- For Nevada/Arizona corporate stores, check the Corp Locations report
- Verify all 16 locations show data for the uploaded week
- Compare totals against source spreadsheet

## Data Quality Best Practices

1. **Upload Weekly**: Process and upload data weekly to stay current
2. **Verify Before Upload**: Check CSV structure and date ranges before uploading
3. **Monitor Unmapped Transactions**: Regularly review and resolve unmapped locations
4. **Cross-Reference**: Compare dashboard totals against platform source reports
5. **Document Issues**: Report any discrepancies or mapping issues to admin

## Contact & Support
For issues with data uploads or location mapping, contact the Spicy Data admin team.
