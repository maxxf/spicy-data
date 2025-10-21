# DoorDash Data Re-Upload Required ✅ COMPLETED

**Status Update:** All DoorDash data has been successfully re-uploaded with corrected marketing parser.  
**See:** [DOORDASH_REUPLOAD_COMPLETE.md](./DOORDASH_REUPLOAD_COMPLETE.md) for completion summary.

---

## Original Issue (NOW RESOLVED)

## Issue Discovered
The DoorDash CSV upload parser had a critical bug where marketing columns (AA-AD in the Financial Report) were **not being read correctly**, resulting in all DoorDash transactions showing **$0 marketing spend** even when marketing data exists in the CSV.

## Root Cause
The upload code was:
1. **Hardcoding `deliveryOfferRedemptions` to 0** instead of reading the CSV column
2. **Hardcoding `otherPayments` to 0** instead of reading the CSV column
3. **Only reading `marketingFees`** column (which often doesn't contain the full marketing picture)
4. **Not calculating `marketingSpend`** as the sum of all marketing components

## What Was Fixed
✅ Updated `server/upload-data.ts` to properly read all 5 marketing columns:
- **Other Payments** (column AA) - Additional charges/credits
- **Offers** (column AB) - Promotion costs
- **Delivery Redemptions** (column AC) - Delivery promotion costs
- **Credits** (column AD) - Credit amounts  
- **Third Party Contributions** - Third-party marketing costs

✅ Added support for multiple column name variants to handle different DoorDash export formats:
- "Other payments" / "Other Payments"
- "Offers" / "offers"
- "Delivery redemptions" / "Delivery Redemptions"
- "Credits" / "DoorDash marketing credit" / "DoorDash Marketing Credit"
- "Third-party contribution" / "Third-party contributions" / "Third Party Contributions"

✅ Correctly calculates `marketingSpend` as:
```
marketingSpend = |Other Payments| + |Offers| + |Delivery Redemptions| + |Credits| + |Third Party|
```

## Impact on Current Data

### Current Database State
- **111,765 DoorDash transactions** across all weeks
- **ALL show marketing_spend = 0** (incorrect)
- Actual marketing data exists in the CSVs but was never imported

### Week-by-Week Breakdown
Based on database analysis:
- **Sept 15-21**: 22,031 transactions - marketing = $0 (needs re-upload)
- **Sept 22-28**: 23,048 transactions - marketing = $0 (needs re-upload)
- **Sept 29 - Oct 5**: 22,575 transactions - marketing = $0 (needs re-upload)
- **Oct 6-12**: 21,762 transactions - marketing = $0 (needs re-upload)
- **Oct 13-19**: 22,349 transactions - marketing = $0 (needs re-upload)

## Action Required

### 1. Re-Upload ALL DoorDash CSV Files
You need to re-upload all DoorDash Financial Reports (Transactions Overview) to populate the correct marketing spend:

**Files to Re-Upload:**
- ✅ **COMPLETED** Sept 8-14, 2025 DoorDash Financial Report (22,055 rows)
- ✅ **COMPLETED** Sept 15-21, 2025 DoorDash Financial Report (22,315 rows)
- ✅ **COMPLETED** Sept 22-28, 2025 DoorDash Financial Report (23,048 rows)
- ✅ **COMPLETED** Sept 29 - Oct 5, 2025 DoorDash Financial Report (22,575 rows)
- ✅ **COMPLETED** Oct 6-12, 2025 DoorDash Financial Report (21,762 rows)
- ✅ **COMPLETED** Oct 13-19, 2025 DoorDash Financial Report (22,349 rows)

**Total Processed:** 134,104 transaction rows  
**Marketing Data Populated:** $118,463.60 total across all weeks

### 2. Upload Process
1. Navigate to **Upload** page in the dashboard
2. Select **Platform**: DoorDash
3. Select **Client**: Capriotti's
4. Upload each CSV file (one at a time)
5. System will automatically deduplicate based on Transaction ID

### 3. Verify After Upload
After re-uploading, verify:
- ✅ **Platform Breakdown** table shows non-zero DoorDash marketing spend
- ✅ **Marketing Spend** KPI reflects combined platform totals
- ✅ **Marketing ROAS** calculates correctly for DoorDash
- ✅ **True CPO** metric uses correct marketing spend

## Expected Changes

### Before Fix
```
DoorDash Marketing Spend: $0.00
Total Marketing: $8,057 (Uber Eats + Grubhub only)
```

### After Re-Upload ✅ ACTUAL RESULTS
```
DoorDash Marketing Spend: $118,463.60 (NOW CORRECT!)
Total Marketing: $126,520.60 (all 3 platforms combined)
Marketing ROAS: Now accurately calculated across all platforms
True CPO: Now includes actual DoorDash marketing costs
```

**Breakdown by Week:**
- Sept 8-14: $15,918.00
- Sept 15-21: $22,404.30
- Sept 22-28: $32,006.70 (peak promotional week)
- Sept 29 - Oct 5: $16,246.10
- Oct 6-12: $15,729.30
- Oct 13-19: $16,159.20

## Technical Notes
- Upload uses **upsert logic** (ON CONFLICT DO UPDATE) so re-uploading is safe
- Existing transactions will be updated with correct marketing data
- No data loss - sales, orders, payout data remains unchanged
- Only marketing-related fields will be updated

## Questions?
If you see any issues after re-upload or have questions about the process, please let me know.
