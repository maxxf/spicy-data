# CSV Upload Guide for Spicy Data Analytics Dashboard

## Overview
This guide provides detailed instructions for uploading transaction and marketing data from third-party delivery platforms (Uber Eats, DoorDash, Grubhub) to the Spicy Data Analytics Dashboard.

## Required CSV Report Types by Platform

### Uber Eats
**Report Type:** Payment Reports  
**Where to Get It:** Uber Eats Merchant Portal → Reports → Payment Reports  
**Frequency:** Weekly (exports cover the week's transactions)

**Required Columns:**
- `Workflow ID` - Unique transaction identifier
- `Store Name` - Location name (used for matching)
- `Order Date` - Transaction date (YYYY-MM-DD format)
- `Order Number` - Order identifier
- `Sales` - Gross sales amount
- `Net Payout` - Amount paid to merchant after fees
- `Delivery Offer Redemptions` - Delivery promotion costs
- `Offers on Items` - Item-level promotion costs
- `Other Payments` - Includes ads, adjustments, credits (description field used to identify marketing spend)

**Marketing Detection Logic:**
- Marketing spend is auto-calculated from transactions where `Other Payments` has a description matching: `/\b(ad|ads|advertising|paid promotion)\b/i`
- Only positive values are counted as marketing spend
- Word boundaries prevent false matches (e.g., "adjustment", "added" are excluded)

---

### DoorDash
**Report Type:** Financial Report → Transactions Overview  
**Where to Get It:** DoorDash Merchant Portal → Reports → Financial → Transactions Overview  
**Frequency:** Weekly

**Required Columns:**
- `Transaction ID` - Unique transaction identifier
- `Store Name` - Location name (used for matching)
- `Date` - Transaction date
- `Channel` - CRITICAL: Must indicate "Marketplace" or "Storefront"
- `Status` - Transaction status (Delivered, Picked Up, etc.)
- `Type` - Transaction type (Order, Adjustment, etc.)
- `Sales` - Gross sales amount
- `Payout` - Amount paid to merchant after fees
- `Other Payments` - Additional charges/credits
- `Offers` - Promotion costs
- `Delivery Redemptions` - Delivery promotion costs
- `Credits` - Credit amounts
- `Third Party Contributions` - Third-party marketing costs

**Critical Filtering:**
⚠️ **DoorDash Storefront orders MUST be filtered out** - Only Marketplace orders are included in analytics. This is enforced server-side.

**Marketing Spend Calculation:**
Marketing spend is auto-calculated during upload as:
```
marketingSpend = Other Payments + Offers + Delivery Redemptions + Credits + Third Party Contributions
```

**Important Notes:**
- All existing DoorDash data currently has `marketingSpend = 0` and needs to be re-uploaded with correct column mappings
- The CSV must include all component columns for accurate marketing calculation
- Server validates that `Channel = "Marketplace"` for inclusion in analytics

---

### Grubhub
**Report Type:** Transaction Reports  
**Where to Get It:** Grubhub Merchant Portal → Reports → Transactions  
**Frequency:** Weekly

**Required Columns:**
- `Transaction ID` - Unique transaction identifier
- `Restaurant Name` - Location name (used for matching)
- `Transaction Date` - Date of transaction
- `Order Number` - Order identifier
- `Gross Sales` - Total sales before fees
- `Net Payout` - Amount paid to merchant after fees
- `Marketing Fees` - Marketing-related charges (if available)

**Marketing Detection:**
- Grubhub marketing data is typically tracked separately through marketing reports
- Marketing spend can be uploaded via the Marketing Data Upload section

---

## Marketing Data Upload (Optional Enhancement)

The dashboard supports separate marketing data uploads for more granular campaign tracking:

### Supported Marketing Data Types:

1. **DoorDash Promotions** (`doordash-promotions`)
   - Campaign-level promotion performance
   - Location-specific metrics

2. **DoorDash Paid Ads** (`doordash-ads`)
   - Paid advertising campaign data
   - ROAS and cost metrics

3. **Uber Eats Campaigns** (`uber-campaigns`)
   - Campaign performance data
   - Offer redemptions

4. **Uber Eats Offers** (`uber-offers`)
   - Offer-specific performance
   - Location attribution

### Marketing CSV Format:
Marketing CSVs should include:
- Campaign ID or Name
- Start and End Dates
- Location Name (for matching)
- Spend Amount
- Impressions/Clicks (if available)
- Orders Attributed
- Revenue Attributed

---

## Location Matching

The system uses a master location sheet for deterministic matching:

### Matching Process:
1. **Exact Match**: Checks canonical name and platform-specific mappings
2. **Fuzzy Match**: Uses string similarity for unmapped locations
3. **Unmapped Bucket**: Unmatched transactions go to "Unmapped Locations"

### Best Practices:
- Ensure consistent location naming in CSVs
- Review unmapped locations after upload
- Use Admin page to configure location mappings
- Update canonical names to consolidate location variants

---

## Upload Process

### Step-by-Step Instructions:

1. **Navigate to Upload Page**
   - Click "Upload" in the sidebar navigation
   
2. **Select Client**
   - Choose "Capriotti's" (or appropriate client)
   - Default is already set to Capriotti's
   
3. **Upload Transaction Data**
   - Select platform (Uber Eats, DoorDash, or Grubhub)
   - Drag & drop CSV file or click to browse
   - Click "Upload & Process"
   
4. **Upload Marketing Data (Optional)**
   - Select data type from dropdown
   - Upload corresponding CSV file
   - Click "Upload Marketing Data"

5. **Verify Upload**
   - Check for success toast notification
   - Navigate to Dashboard to verify data appears
   - Check Locations page for any unmapped locations

---

## Data Validation

### Server-Side Validation:
- ✅ Platform-specific CSV column validation
- ✅ Date format validation
- ✅ Numeric field validation (sales, payout, etc.)
- ✅ Duplicate prevention (upsert logic)
- ✅ DoorDash Storefront filtering (Marketplace only)
- ✅ Marketing spend calculation

### Duplicate Handling:
- **Uber Eats**: Uses `workflowId` as unique constraint
- **DoorDash**: Uses `(clientId, transactionId)` composite key
- **Grubhub**: Uses `(clientId, transactionId)` composite key
- Re-uploading same data will update existing records (upsert)

---

## Troubleshooting

### Common Issues:

**Issue:** "Upload failed - Invalid CSV format"  
**Solution:** Ensure CSV matches required column names for the platform

**Issue:** "No data appearing in dashboard"  
**Solution:** Check that CSV has correct date format and valid numeric values

**Issue:** "Many unmapped locations"  
**Solution:** Review location names in CSV, ensure they match expected format, configure mappings in Admin page

**Issue:** "DoorDash marketing spend showing as $0"  
**Solution:** Re-upload DoorDash CSVs with all required marketing component columns (Other Payments, Offers, Delivery Redemptions, Credits, Third Party Contributions)

**Issue:** "DoorDash Storefront orders included in analytics"  
**Solution:** This should not happen as filtering is server-side, but verify CSV has Channel column populated

---

## Data Refresh Frequency

### Recommended Schedule:
- **Weekly**: Upload new transaction data every Monday for the previous week
- **Monthly**: Reconcile marketing data at month-end
- **Quarterly**: Audit location mappings and consolidations

### Date Ranges:
- Current data covers: October 6-19, 2025 (3 weeks)
- System supports any date range
- Week-over-week comparisons require at least 2 weeks of data

---

## Current System State

### Existing Data:
- **Total Transactions**: 133,556
- **Date Range**: October 6-19, 2025 (weeks 10/6-10/12, 10/13-10/19)
- **Locations**: 161 unique locations
- **Client**: Capriotti's
- **Platforms**: Uber Eats, DoorDash, Grubhub

### Known Data Issues:
1. ⚠️ **DoorDash marketing spend = $0** for all existing records
   - Needs re-upload with complete marketing columns
   - Use latest CSV export format from DoorDash portal
   
2. Some locations may need canonical name consolidation
   - Review Locations page for variants
   - Configure in Admin page

---

## Production Deployment Checklist

Before using this system in production:

- [ ] Upload complete historical data (at least 8-12 weeks for trends)
- [ ] Verify all location mappings are correct
- [ ] Re-upload DoorDash data with marketing columns
- [ ] Configure user roles and permissions
- [ ] Set up weekly upload schedule/automation
- [ ] Train users on Upload page workflow
- [ ] Document client-specific location naming conventions
- [ ] Set up data backup procedures
- [ ] Configure monitoring and alerts for failed uploads

---

## Support

For technical issues or questions:
- Check server logs in Replit workspace
- Review browser console for client-side errors
- Contact development team for database issues
- Refer to `replit.md` for system architecture details
