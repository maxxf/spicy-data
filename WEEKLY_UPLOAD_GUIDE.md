# Weekly Data Upload Guide

This guide explains how to confidently upload weekly transaction and marketing data to the Spicy Data Analytics Dashboard.

## Overview

The dashboard is designed for weekly data uploads from three delivery platforms:
- **Uber Eats**
- **DoorDash**
- **Grubhub**

## Step-by-Step Upload Process

### 1. Prepare Your CSV Files

Before uploading, ensure you have:
- **Transaction CSV files** from each platform (Uber Eats, DoorDash, Grubhub)
- **Marketing CSV files** (optional) for promotions and paid advertising data

**Important:** The system prevents duplicate uploads using unique transaction identifiers from each platform's CSV:
- **Uber Eats:** `workflowId` column (unique UUID for each transaction)
- **DoorDash:** `transactionId` column (unique order identifier)
- **Grubhub:** `transactionId` column (unique order identifier)

These identifiers allow the system to detect and update existing records if you upload the same data twice (upsert logic).

### 2. Navigate to Admin Page

1. Log into the dashboard
2. Click **Admin** in the left sidebar (bottom of navigation)
3. Verify **Capriotti's** is selected as the client (default)

### 3. Upload Transaction Data

The Admin page has three upload zones under "Upload Transaction Data":

#### Uber Eats Upload:
1. Click the **Uber Eats** upload zone (green)
2. Select your Uber Eats CSV file
3. Wait for "Upload complete!" confirmation

#### DoorDash Upload:
1. Click the **DoorDash** upload zone (red)
2. Select your DoorDash CSV file
3. Wait for "Upload complete!" confirmation

#### Grubhub Upload:
1. Click the **Grubhub** upload zone (orange)
2. Select your Grubhub CSV file
3. Wait for "Upload complete!" confirmation

**Note:** You can upload platforms in any order or skip platforms if you don't have data for that week.

### 4. Upload Marketing Data (Optional)

If you have marketing campaign data:

1. Scroll to **Upload Marketing Data** section
2. Select the **platform-specific** data type from the dropdown:
   - **DoorDash - Promotions** - DoorDash discount campaigns
   - **DoorDash - Paid Ads** - DoorDash sponsored placement data
   - **Uber Eats - Campaign Location Data** - Uber campaign performance by location
   - **Uber Eats - Offers & Campaigns** - Uber promotions and offer performance
3. Click the upload zone that appears after selecting the data type
4. Select your marketing CSV file
5. Wait for "Marketing data uploaded" confirmation

**Important:** Always select the correct platform and data type. Each platform has different CSV formats and data structures.

### 5. Verify Upload Success

After uploading, verify your data appears correctly:

1. Click **Overview** in the sidebar to return to the Dashboard
2. Check the **Week Selector** dropdown - your new week should appear at the top
3. Select the new week from the dropdown
4. Verify the **Key Performance Indicators** section shows updated metrics:
   - Total Sales
   - Sales from Marketing
   - Total Orders
   - True CPO
   - Average Order Value
   - Marketing Spend
   - Marketing ROAS
   - Net Payout

5. Scroll down to **Platform Breakdown** - confirm data appears for all uploaded platforms
6. Check **Location Performance** table - verify locations show data for the new week

#### Quick Verification Checklist

Use this checklist to confirm your upload was successful:

- [ ] New week appears in Week Selector dropdown (e.g., "Oct 6 - 12, 2025")
- [ ] Total Sales matches expected revenue for the week
- [ ] Total Orders count looks reasonable
- [ ] Platform Breakdown shows sales for each platform you uploaded
- [ ] Location Performance table shows data for multiple locations
- [ ] No unexpected "Unmapped Locations" count (check Locations page if needed)
- [ ] Marketing metrics populate if you uploaded marketing data
- [ ] All currency values display properly formatted (no missing $ symbols)

## What to Expect After Upload

### Automatic Data Processing

The system automatically:
- ✅ **Parses** CSV files using platform-specific logic
- ✅ **Validates** transaction data for completeness
- ✅ **Matches** locations using the master location list
- ✅ **Prevents duplicates** - re-uploading the same file updates existing records
- ✅ **Calculates metrics** - ROAS, AOV, net payout, etc.
- ✅ **Updates dashboard** - all pages refresh with new data

### Duplicate Prevention (Refresh/Replace Pattern)

You can safely re-upload the same file multiple times:
- **First upload:** Creates new transaction records
- **Subsequent uploads:** Updates existing records (upsert logic)
- **No duplicates:** System uses platform-specific unique identifiers

This is useful if you need to:
- Fix errors in the source data
- Update incomplete data
- Add missing transactions

### Data Display Format

Monetary values display differently depending on context:
- **KPI Cards (Dashboard):** $XXX,XXX (whole dollars, no cents, comma separators)
- **Data Tables:** $XXX,XXX.XX (includes cents for precision)
- **Percentages:** XX.XX%
- **Multipliers:** X.XXx (for ROAS)
- **Order Counts:** X,XXX (comma separators)

Changes from previous week show:
- ↑ **Green arrow** - increase
- ↓ **Red arrow** - decrease
- — **Gray dash** - no change

## Location Matching

### How It Works

The system matches transactions to locations using:
1. **Master Location List** - Canonical location names and IDs with platform-specific mappings
2. **Platform-specific matching logic:**
   - **Uber Eats:** Extracts code from CSV's `Store Name` field (e.g., "Capriotti's (IA069)" → "IA069"), matches to master list's `uberEatsStoreLabel` column. Note: CSV's "Store ID" column is not used for matching.
   - **DoorDash:** PRIMARY match uses CSV's `Merchant Store ID` → master list's `doorDashStoreKey` column. FALLBACK uses `Store name` if ID doesn't match. The master list's `doordashName` column is updated after matching (not used for matching).
   - **Grubhub:** PRIMARY match uses CSV's `street_address` field → master list's `address` column (with normalization). FALLBACK uses CSV's `store_number` if address doesn't match. The master list's `grubhubName` column is updated after matching.

The master list should contain one row per physical location with critical matching columns populated:
- `uberEatsStoreLabel` - Store code for Uber Eats matching
- `doorDashStoreKey` - Merchant Store ID for DoorDash matching
- `address` - Physical address for Grubhub matching

### Unmapped Locations

If a transaction can't be matched to a known location:
- It goes to **"Unmapped Locations"** bucket
- No new location is auto-created
- You can fix this by updating the Master Location List

To fix unmapped locations:
1. Go to **Admin** page
2. Scroll to **Import Master Location List**
3. Update your master CSV with new location mappings
4. Re-upload the master list
5. Re-upload transaction data - transactions will now match

## Viewing Weekly Reports

### Dashboard (Overview)

Best for: Quick weekly snapshot

1. Select your week from the **Week Selector**
2. View 8 KPI metrics at a glance
3. See platform breakdown chart
4. Check location performance table

### Financials Page

Best for: Detailed P&L analysis

1. Navigate to **Financials** in sidebar
2. Select date range (start and end dates)
3. View 28+ financial metrics by platform
4. Export to CSV for external reporting

### Campaigns Page

Best for: Marketing ROI analysis

1. Navigate to **Campaigns** in sidebar
2. Select week from dropdown
3. View promotions and paid advertising metrics
4. Compare ROAS, True CPO, net profit per order

### Locations Page

Best for: Location-specific insights

1. Navigate to **Locations** in sidebar
2. View all locations table
3. Check **Test Locations Report** for corporate locations
4. Filter by tags or platform

## Troubleshooting

### Upload Fails

**Problem:** Upload button shows error

**Solutions:**
- Check CSV file format matches platform requirements
- Ensure file has required columns (headers)
- Try re-uploading after refreshing the page

### Data Doesn't Appear

**Problem:** Dashboard still shows old data after upload

**Solutions:**
- Refresh the browser page (F5 or Cmd+R)
- Select the correct week from Week Selector
- Verify correct client is selected (Capriotti's)

### Wrong Numbers

**Problem:** Metrics look incorrect

**Solutions:**
- Verify you uploaded the correct CSV file
- Check if data is being split across weeks (date range issues)
- Re-upload the correct file - system will update existing records

### Locations Missing

**Problem:** Some locations don't show data

**Solutions:**
- Check if transactions went to "Unmapped Locations"
- Update Master Location List with missing location mappings
- Re-upload transaction data after fixing master list

### Week Not Showing

**Problem:** New week doesn't appear in dropdown

**Solutions:**
- Check that transaction data has valid dates
- Refresh browser page
- Verify CSV has `Order Date` or equivalent date column

## Best Practices

### Weekly Routine

1. **Monday morning:** Download CSV files from each platform
2. **Upload immediately:** Don't wait - upload while data is fresh
3. **Verify first:** Check dashboard after each platform upload
4. **Marketing data:** Upload within 24 hours of transaction data
5. **Review reports:** Share weekly dashboard with stakeholders

### Data Quality

- ✅ **Use official platform CSVs** - Don't modify in Excel first
- ✅ **Keep original files** - Archive for historical reference
- ✅ **Check dates** - Ensure week boundaries are correct
- ✅ **Validate totals** - Compare dashboard to platform totals

### Performance Tips

- Upload during off-peak hours if possible (early morning)
- Upload one platform at a time and verify before next
- Keep CSV files under 10MB for best performance
- Archive files older than 6 months to keep dashboard fast

## Support

If you encounter issues not covered in this guide:

1. Check the **Locations** page for unmapped location count
2. Verify your master location list is up to date
3. Try re-uploading with the original platform CSV
4. Document the error message and contact support

---

**Remember:** The system is designed to be forgiving. You can always re-upload data to fix issues, and the duplicate prevention ensures you won't create duplicates.
