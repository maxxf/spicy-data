# DoorDash Storefront Transaction Cleanup

**Date**: October 28, 2025  
**Status**: ✅ **COMPLETED**

## Issue Identified

DoorDash Storefront transactions were incorrectly included in the database from earlier uploads before the filter was implemented.

## Actions Taken

### 1. Database Cleanup
**Deleted 21,319 Storefront transactions** totaling $777,538.40 in sales that should not have been included in analytics.

```sql
DELETE FROM doordash_transactions WHERE channel = 'Storefront';
-- Result: DELETE 21319
```

### 2. Verification
**Before Cleanup**:
- Marketplace: 107,310 transactions
- Storefront: 21,319 transactions ❌
- NULL: 255 transactions

**After Cleanup**:
- Marketplace: 107,310 transactions ✅
- Storefront: 0 transactions ✅
- NULL: 255 transactions (treated as Marketplace)

**Current Database State**:
- Total DoorDash Transactions: 107,565
- Marketplace Only: 107,310 (199 unique locations)
- Total Sales: $3,223,020.00
- Storefront Transactions: 0 ✅

### 3. Upload Filter Confirmation

The upload logic **already had the correct filter in place** (lines 611-615 in server/routes.ts):

```typescript
// CRITICAL: Skip Storefront orders - only process Marketplace orders
const channel = getColumnValue(row, "Channel", "channel");
if (channel && channel.trim().toLowerCase() === "storefront") {
  continue; // Skip this row
}
```

This means:
- ✅ All future uploads will automatically exclude Storefront transactions
- ✅ The attached file for week 10/20-10/26 can be safely uploaded
- ✅ Only Marketplace transactions will be processed

### 4. Analytics Query Verification

All analytics queries already properly filter for Marketplace transactions:

**Example from db-storage.ts**:
```typescript
const isMarketplace = !t.channel || t.channel === "Marketplace";
if (!isMarketplace) return; // Skip Storefront
```

**SQL Aggregations**:
```sql
WHERE (channel = 'Marketplace' OR channel IS NULL)
```

This ensures:
- ✅ Dashboard metrics exclude Storefront
- ✅ Income Statement excludes Storefront
- ✅ Weekly trends exclude Storefront
- ✅ ROAS/ROI calculations exclude Storefront

### 5. Documentation Updated

Updated the following files to reflect Storefront filtering:

**replit.md**:
- Clarified that "DoorDash Storefront filtering (Storefront transactions are excluded, only Marketplace transactions processed)"

**PRODUCTION_DEPLOYMENT.md**:
- Changed "DoorDash transaction CSVs (Marketplace & Storefront)" 
- To "DoorDash transaction CSVs (Marketplace only - Storefront transactions automatically filtered out)"

## Why Filter Storefront Transactions?

DoorDash Storefront represents direct orders through the restaurant's own website/app (powered by DoorDash), while Marketplace represents orders through the DoorDash app. The key differences:

1. **Fee Structure**: Storefront has different commission rates than Marketplace
2. **Marketing Attribution**: Storefront orders are not driven by DoorDash marketing
3. **Analytics Comparability**: Mixing Storefront and Marketplace distorts platform comparison metrics
4. **Customer Acquisition**: Different customer acquisition costs and dynamics

By filtering Storefront, the analytics focus on true third-party delivery platform performance.

## Impact on Historical Data

**Sales Adjustment**:
- Previous DoorDash sales included ~$777K from Storefront transactions
- After cleanup, DoorDash sales are ~$777K lower (more accurate)
- This affects weeks where Storefront data was present (primarily Oct 13 and Sep 8)

**Week-over-Week Comparisons**:
- Oct 13 week previously showed inflated DoorDash sales due to Storefront inclusion
- After cleanup, week-over-week trends will be more consistent
- Future uploads will maintain consistency (Marketplace only)

## Next Steps

✅ The system is ready to process the attached file for week 10/20-10/26  
✅ All Storefront transactions will be automatically filtered out  
✅ Analytics will remain clean and accurate going forward  

**To upload the new file**:
1. Navigate to Upload page
2. Select client: "Capriotti's"
3. Select platform: "DoorDash"
4. Upload: "Caps _ 20 to 26th - Door Dash_1761668171138.csv"
5. Verify success message shows transaction count (Storefront rows will be skipped)

---

**Prepared By**: Development Team  
**Date**: October 28, 2025  
**File**: attached_assets/Caps _ 20 to 26th - Door Dash_1761668171138.csv (23,478 total rows)
