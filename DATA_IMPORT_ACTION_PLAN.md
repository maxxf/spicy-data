# 🚨 DATA IMPORT ACTION PLAN - URGENT FIXES NEEDED TONIGHT

**Generated:** October 22, 2025  
**Status:** CRITICAL - 76.7% of Uber Eats data unmapped

---

## 📊 EXECUTIVE SUMMARY

| Metric | Current State | Target | Priority |
|--------|---------------|--------|----------|
| **Uber Eats Mapping** | 23.3% (43,404 / 186,363) | >95% | 🔴 CRITICAL |
| **Grubhub Mapping** | 84.4% (9,249 / 10,959) | >95% | 🟡 HIGH |
| **DoorDash Mapping** | 100% (94,838 / 94,839) | >95% | ✅ GOOD |
| **Locations with All 3 Platforms** | 27.9% (124 / 445) | >80% | 🟡 HIGH |

---

## 🔴 CRITICAL ISSUE #1: Uber Eats Unmapped Transactions

### Problem
**142,959 Uber Eats transactions (76.7%) cannot be matched to locations**

This is preventing accurate analytics for:
- Location-level sales reports
- Weekly performance tracking
- Cross-platform comparisons
- Marketing ROI calculations

### Root Cause Analysis
The unmapped locations follow these patterns:

```
"Capriotti's Sandwich Shop (FL100238)" - 415 transactions
"Capriotti's Sandwich Shop (11350 S. Highlands Pkwy)" - 352 transactions
"Capriotti's Sandwich Shop (CA425)" - 326 transactions
"Capriotti's (TX444)" - 177 transactions
"Capriotti's Sandwich Shop (Murrieta)" - 147 transactions
```

**Issue:** Store codes appear in parentheses but aren't being extracted correctly, OR these store codes don't exist in your master location sheet.

### Solution Options

#### Option A: Fix Location Master Sheet (RECOMMENDED)
**Time Required:** 2-3 hours  
**Impact:** Fixes all 142,959 unmapped transactions  

**Steps:**
1. Export unmapped Uber Eats locations to CSV:
   ```sql
   SELECT DISTINCT location, COUNT(*) as txn_count
   FROM uber_eats_transactions 
   WHERE location_id IS NULL
   GROUP BY location
   ORDER BY txn_count DESC;
   ```

2. Extract store codes from parentheses:
   - FL100238, CA425, TX444, etc.
   - Or addresses like "11350 S. Highlands Pkwy", "Murrieta"

3. Update your Google Sheet master location mapping:
   - Add `ubereats_store_label` column for each missing store
   - Match the format exactly as it appears in Uber Eats reports

4. Re-upload all Uber Eats payment reports:
   - Download fresh reports from Uber Eats portal
   - Upload via Dashboard → Upload Data → Uber Eats

#### Option B: Fix Code Logic
**Time Required:** 1 hour  
**Impact:** Depends on root cause  

If the issue is code-based (not mapping), investigate:
- `server/routes.ts` - Uber Eats upload location matching logic
- `server/fix-ubereats-mapping.ts` - Recent mapping fix implementation
- Check if store codes are being extracted correctly from parentheses

---

## 🟡 HIGH PRIORITY #2: Grubhub Unmapped Transactions

### Problem
**1,710 Grubhub transactions (15.6%) unmapped**

### Sample Unmapped Locations
```
"Capriotti's Sandwich Shop" - 1,621 transactions
"Capriottis Sandwich Shop" - 16 transactions (typo/variation)
"Capriotti's Sandwich Shop " - 9 transactions (trailing space)
```

### Solution
The Grubhub transactions have generic "Capriotti's Sandwich Shop" names without store numbers.

**Steps:**
1. Check if these transactions have a `store_number` field in the raw CSV
2. If yes: Update upload logic to use `store_number` for matching
3. If no: These may be test transactions or corporate-level entries - mark as "Corporate/Unmapped"

---

## 🟡 HIGH PRIORITY #3: Missing Platform Coverage

### Problem
**Only 27.9% of locations have data from all 3 platforms**

### Coverage Breakdown
- **Uber Eats:** 132 locations (29.7%) - 🔴 CRITICAL GAP
- **DoorDash:** 302 locations (67.9%) - ✅ GOOD
- **Grubhub:** 150 locations (33.7%) - 🟡 NEEDS IMPROVEMENT

### Likely Causes
1. **Not all locations are active on all platforms** (expected)
2. **Missing data uploads for some platforms**
3. **Date range mismatches** (some platforms have older/newer data)

### Solution
**Create a location audit spreadsheet:**

| Store ID | Name | On Uber Eats? | On DoorDash? | On Grubhub? | Action Needed |
|----------|------|---------------|--------------|-------------|---------------|
| FL100238 | Tampa | ✅ Yes | ✅ Yes | ❌ No | Upload Grubhub or mark inactive |
| CA425 | San Diego | ✅ Yes | ❌ No | ❌ No | Upload DD/GH or mark inactive |

**Then:**
1. For active locations missing data: Download & upload platform reports
2. For inactive locations: Add `location_tag: "inactive"` to filter them out

---

## 📅 PRIORITY #4: Date Range Gaps

### Current Date Ranges
| Platform | Start Date | End Date | Unique Days | Status |
|----------|------------|----------|-------------|--------|
| Uber Eats | 10/1/25 | 9/9/25 | 62 days | ⚠️ Date format issue |
| DoorDash | 8/25/25 | 10/19/25 | 56 days | ✅ Good |
| Grubhub | 8/25/25 | 10/12/25 | 42 days | ⚠️ Missing recent week |

### Issues Detected
1. **Uber Eats date format anomaly:** Start date shows as 10/1/25 but end as 9/9/25 (reversed?)
2. **Grubhub missing last week:** Latest data is 10/12 (missing Oct 13-19)

### Solution
1. **Uber Eats:** Verify the date parsing logic in upload code
2. **Grubhub:** Download and upload the latest week (Oct 13-19, 2025)
3. **All Platforms:** Establish weekly upload schedule to prevent gaps

---

## 🎯 TONIGHT'S ACTION PLAN - STEP BY STEP

### Phase 1: Emergency Uber Eats Fix (2-3 hours)
**Goal:** Map the 142,959 unmapped Uber Eats transactions

1. **Export unmapped locations** (5 min):
   - Run diagnostic: `tsx server/quick-diagnostic.ts`
   - Or query database for full list

2. **Analyze patterns** (15 min):
   - Identify which store codes are missing
   - Check if they exist in your master location sheet

3. **Update master location sheet** (1-2 hours):
   - Add missing `ubereats_store_label` entries
   - Match format exactly as appears in Uber Eats reports

4. **Re-upload Uber Eats data** (30 min):
   - Download fresh payment reports from Uber Eats
   - Upload through dashboard
   - Verify mapping rate improves to >95%

### Phase 2: Grubhub Cleanup (30 min)
1. Check if unmapped Grubhub transactions have store numbers
2. Update upload logic if needed
3. Re-upload Grubhub reports if logic was fixed

### Phase 3: Fill Date Gaps (30 min)
1. Download Grubhub report for Oct 13-19
2. Upload via dashboard
3. Verify weekly coverage is complete

### Phase 4: Verification (15 min)
1. Run diagnostic again: `tsx server/quick-diagnostic.ts`
2. Verify mapping rates:
   - Uber Eats: >95%
   - DoorDash: >99%
   - Grubhub: >95%
3. Check dashboard loads correctly with complete data

---

## 📋 REQUIRED CSV REPORTS TO DOWNLOAD TONIGHT

### Uber Eats
- **Report Type:** Payment Report  
- **Date Range:** August 25 - October 19, 2025  
- **Download From:** Uber Eats Restaurant Manager → Finances → Payment Reports  
- **Note:** Get ALL weeks, not just missing ones (to ensure consistency after mapping fix)

### Grubhub
- **Report Type:** Transaction Report  
- **Date Range:** October 13 - October 19, 2025 (missing week)  
- **Download From:** Grubhub for Restaurants → Reports → Transactions  

### DoorDash
- **Status:** ✅ Complete - No action needed  

---

## 🔧 TECHNICAL FIXES NEEDED (If Code Changes Required)

### If Location Extraction is Broken

**File:** `server/routes.ts` (Uber Eats upload section)

Check this logic:
```typescript
// Should extract "FL100238" from "Capriotti's Sandwich Shop (FL100238)"
const storeCodeMatch = locationString.match(/\(([A-Z]{2}\d+)\)/);
```

If broken, locations need to be re-mapped after code fix.

---

## ✅ SUCCESS CRITERIA

Tonight's import is successful when:

- [ ] Uber Eats mapping rate >95% (currently 23.3%)
- [ ] Grubhub mapping rate >95% (currently 84.4%)
- [ ] All weeks from Aug 25 - Oct 19 have data for all 3 platforms
- [ ] Dashboard "Weekly Performance by Location" loads in <2 seconds
- [ ] No "Unmapped Locations" bucket in location dropdowns
- [ ] Cross-platform location consolidation shows accurate totals

---

## 📞 NEXT STEPS AFTER TONIGHT

1. **Establish Weekly Upload Schedule:**
   - Download reports every Monday for previous week
   - Upload within 24 hours to keep dashboard current

2. **Location Master Sheet Maintenance:**
   - Add new locations immediately when opened
   - Include all 3 platform identifiers (Uber store label, DoorDash location, Grubhub store number)

3. **Automated Monitoring:**
   - Run diagnostic weekly to catch mapping issues early
   - Alert if any platform drops below 95% mapping rate

---

## 🆘 TROUBLESHOOTING

### "Re-upload didn't fix Uber Eats mapping"
→ Location master sheet still missing entries. Export unmapped list again and verify each store code exists.

### "Dashboard still shows old data"
→ Clear browser cache or do hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

### "Upload takes too long / times out"
→ Split large CSV files into smaller chunks by date range

### "Some locations still show zero data"
→ These may be genuinely inactive. Add `location_tag: "inactive"` to hide from reports.

---

**Questions? Run the diagnostic anytime:**
```bash
tsx server/quick-diagnostic.ts
```

This provides real-time status on all data quality metrics.
