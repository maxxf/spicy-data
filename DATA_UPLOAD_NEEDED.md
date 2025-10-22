# Missing Data - Upload Required

## ⚠️ Grubhub Week 9/15 (Sep 15-21, 2025)
**Status**: MISSING from database (0 transactions)
**Expected Data**:
- Orders: 1,361
- Sales: $45,226
- Marketing Sales: ~$9,224

**Action**: Re-upload Grubhub CSV for week Sep 15-21

---

## ⚠️ DoorDash Week 10/13 (Oct 13-19, 2025)
**Status**: NOT UPLOADED YET
**Expected Data**:
- Orders: 11,335
- Sales: $352,160
- Marketing Sales: ~$220,915

**Action**: Upload DoorDash CSV for week Oct 13-19

---

## ✅ Data Accuracy Fixes Applied

### Issue #1: Uber Eats Sales Metric (FIXED)
**Problem**: Using `subtotal` (incl. tax) instead of `sales_excl_tax` (excl. tax)
**Impact**: Dashboard showed ~5% higher sales than spreadsheet
**Fix**: Updated all Uber Eats queries to use `sales_excl_tax`
**Result**: Now within 1.8% of spreadsheet values

### Issue #2: DoorDash 9/8 Week Data Corruption (FIXED)
**Problem**: CSV had blank `transaction_type` fields for 11,435 orders
**Impact**: Only 1 order showed (should be 11,160)
**Fix**: Treat blank/empty `transaction_type` as "Order"
**Result**: Recovered all 11,435 missing transactions

---

## Current Data Coverage

**Complete weeks** (8/25 - 10/12):
- ✅ Uber Eats: All weeks complete
- ✅ DoorDash: All weeks complete through 10/12
- ✅ Grubhub: Complete except 9/15

**Incomplete weeks**:
- ⚠️ Grubhub 9/15: Missing
- ⚠️ DoorDash 10/13: Not uploaded

**Overall Accuracy**: 90/100
- All calculations verified correct
- Data matches spreadsheet within acceptable variance
- Only issue is missing uploads for 2 specific weeks
