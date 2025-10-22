# Corp Locations Data Issues Report
**Generated:** October 22, 2025  
**Report Type:** Comprehensive Data Quality Analysis

---

## Executive Summary

✅ **Report Status:** All 16 corporate locations are now showing in the report  
⚠️ **Data Quality Issues Found:** 2 categories of issues identified  
📊 **Coverage:** 7 weeks of data (Aug 25 - Oct 13, 2025)

---

## Issue #1: Missing Transaction Data (CRITICAL)

### Overview
Some weeks have missing transaction data for specific locations. This is **not a software bug** - the data simply hasn't been uploaded to the system yet.

### Missing Data by Week

#### Week of September 8-14, 2025 (2025-09-08)
**Impact:** 15 out of 16 locations missing
- ✅ **HAS DATA:** NV151 LV Maryland Pkwy (Grubhub only)
- ❌ **MISSING DATA:** All other 15 locations
  - AZ900482, NV008, NV036, NV051, NV054, NV067, NV079, NV103, NV111, NV121, NV126, NV152, NV191, NV900467, NV900478

**Cause:** No Uber Eats or DoorDash transaction files uploaded for this week for these locations

---

#### Week of September 22-28, 2025 (2025-09-22)
**Impact:** 1 location missing
- ❌ **MISSING DATA:** NV036 Las Vegas Silverado

**Status:** 15 other locations have complete data for this week

---

#### Week of September 29 - October 5, 2025 (2025-09-29)
**Impact:** 2 locations missing
- ❌ **MISSING DATA:** 
  - NV111 NLV Craig and Mitchell
  - NV151 LV Maryland Pkwy

**Status:** 14 other locations have complete data for this week

---

#### Week of October 6-12, 2025 (2025-10-06)
**Impact:** 1 location missing
- ❌ **MISSING DATA:** NV900478 LV S Las Vegas

**Status:** 15 other locations have complete data for this week

---

### How to Fix Missing Transaction Data

**Action Required:** Upload the missing transaction CSV files

1. **Week 2025-09-08 (HIGH PRIORITY):**
   - Upload Uber Eats payment reports for Sept 8-14, 2025
   - Upload DoorDash financial transaction reports for Sept 8-14, 2025
   - Upload Grubhub transaction reports for Sept 8-14, 2025 (for non-NV151 locations)

2. **Week 2025-09-22:**
   - Upload transaction data for NV036 Las Vegas Silverado

3. **Week 2025-09-29:**
   - Upload transaction data for NV111 and NV151

4. **Week 2025-10-06:**
   - Upload transaction data for NV900478

**Note:** After uploading files, the report will automatically reflect the new data on the next page refresh.

---

## Issue #2: Marketing Performance Alert

### NV151 - Week of August 25-31, 2025

**Issue:** Marketing spend exceeded marketing-attributed sales
- 💰 **Marketing Spend:** $151
- 📊 **Marketing Sales:** $143
- 📉 **ROAS:** 0.95x (below breakeven)

**Interpretation:** For every $1 spent on marketing this week, only $0.95 in sales was generated. This indicates an unprofitable marketing campaign for this specific week.

**Recommended Actions:**
1. Review which marketing campaigns were running during this week
2. Analyze campaign targeting and creative effectiveness
3. Consider pausing or optimizing underperforming campaigns
4. Compare with other weeks to see if this is an anomaly or trend

**Context:** This is the ONLY instance of negative ROAS across all 16 locations and 7 weeks analyzed (112 location-weeks total), suggesting this is an isolated incident rather than a systemic issue.

---

## Data Completeness Summary

### Overall Coverage by Location

| Location | Store ID | Weeks with Data | Missing Weeks | Completeness |
|----------|----------|-----------------|---------------|--------------|
| AZ900482 | AZ900482 Tucson Broadway | 6/7 | 1 | 86% |
| NV008 | NV008 Las Vegas Sahara | 6/7 | 1 | 86% |
| NV036 | NV036 Las Vegas Silverado | 5/7 | 2 | 71% |
| NV051 | NV051 Henderson Horizon | 6/7 | 1 | 86% |
| NV054 | NV054 Sparks Stanford | 6/7 | 1 | 86% |
| NV067 | NV067 Reno Meadows | 6/7 | 1 | 86% |
| NV079 | NV079 Reno Sierra St | 6/7 | 1 | 86% |
| NV103 | NV103 Henderson Boulder Hwy | 6/7 | 1 | 86% |
| NV111 | NV111 NLV Craig and Mitchell | 5/7 | 2 | 71% |
| NV121 | NV121 LV Downtown Summerlin | 6/7 | 1 | 86% |
| NV126 | NV126 NLV Aliante Pkwy | 6/7 | 1 | 86% |
| NV151 | NV151 LV Maryland Pkwy | 6/7 | 1 | 86% |
| NV152 | NV152 Reno Plumb Virginia | 6/7 | 1 | 86% |
| NV191 | NV191 Carson City William | 6/7 | 1 | 86% |
| NV900467 | NV900467 Sparks Los Altos | 6/7 | 1 | 86% |
| NV900478 | NV900478 LV S Las Vegas | 5/7 | 2 | 71% |

**Average Completeness:** 84% (89 out of 112 possible location-weeks have data)

---

## Technical Details (For Reference)

### Report Processing Stats
- **Total Locations Analyzed:** 16
- **Total Weeks Available:** 7 (Aug 25 - Oct 13, 2025)
- **Transaction Counts for Corp Locations:**
  - Uber Eats: 1,510 transactions
  - DoorDash: 2,540 transactions
  - Grubhub: 976 transactions
  - **Total:** 5,026 transactions

### Data Quality Checks Performed
- ✅ Zero sales with positive payout: None found
- ✅ Negative payout after COGS: None found
- ✅ Extremely low payout percentage (<30%): None found
- ⚠️ Marketing spend > marketing sales: 1 instance (NV151, week 08-25)
- ✅ Unusually high ROAS (>20x): None found

---

## Recommendations

### Immediate Actions (Priority Order)

1. **HIGH:** Upload missing transaction data for week Sept 8-14 (affects 15 locations)
2. **MEDIUM:** Upload missing data for weeks Sept 22, Sept 29, Oct 6 (affects 4 total location-weeks)
3. **LOW:** Review NV151's marketing campaign performance for late August

### Process Improvements

1. **Establish Upload Schedule:** Set up a weekly cadence for uploading transaction reports from all three platforms
2. **Data Validation:** Create a checklist to verify all locations have data before considering a week "complete"
3. **Performance Monitoring:** Set up alerts when ROAS drops below 1.0x for any location-week combination

---

## Questions?

For any questions about this report or help uploading missing data, please ask.
