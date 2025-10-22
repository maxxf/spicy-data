# Corporate Locations Data Completeness & Accuracy Report
**Generated:** October 22, 2025

## Executive Summary

### ⚠️ CRITICAL DATA GAPS IDENTIFIED

**Corporate locations (16 stores) have INCOMPLETE data coverage:**
- **DoorDash:** Missing 6 out of 8 weeks (75% gap)
- **Grubhub:** Missing 1 out of 8 weeks (12.5% gap)
- **Uber Eats:** Complete coverage ✅

---

## 1. Store Identification (✅ VERIFIED)

All 16 corporate stores correctly identified:
- AZ900482 (Tucson Broadway)
- NV008, NV036, NV051, NV054, NV067, NV079, NV103, NV111, NV121, NV126, NV151, NV152, NV191 (Nevada)
- NV900467, NV900478 (Nevada)

---

## 2. Platform Coverage Summary

| Platform | Date Range | Unique Days | Total Transactions |
|----------|------------|-------------|-------------------|
| **Uber Eats** | Aug 22 - Oct 19 | 58 days ✅ | 6,121 |
| **DoorDash** | Aug 25 - Oct 19 | **14 days ⚠️** | 2,157 |
| **Grubhub** | Aug 25 - Oct 19 | 49 days ✅ | 1,143 |

---

## 3. Week-by-Week Coverage Analysis

| Week Start | Uber Eats | DoorDash | Grubhub | Status |
|------------|-----------|----------|---------|---------|
| **Oct 13** | 815 txns ✅ | 806 txns ✅ | 153 txns ✅ | **COMPLETE** |
| **Oct 6** | 1,276 txns ✅ | **MISSING ❌** | 166 txns ✅ | Incomplete |
| **Sep 29** | 817 txns ✅ | **MISSING ❌** | 136 txns ✅ | Incomplete |
| **Sep 22** | 913 txns ✅ | **MISSING ❌** | 175 txns ✅ | Incomplete |
| **Sep 15** | 566 txns ✅ | **MISSING ❌** | **MISSING ❌** | Incomplete |
| **Sep 8** | 709 txns ✅ | **MISSING ❌** | 185 txns ✅ | Incomplete |
| **Sep 1** | 498 txns ✅ | **MISSING ❌** | 172 txns ✅ | Incomplete |
| **Aug 25** | 524 txns ✅ | 1,351 txns ✅ | 156 txns ✅ | **COMPLETE** |

**Summary:** Only 2 out of 8 weeks have complete data from all 3 platforms (25% completeness)

---

## 4. Week 10/13 (Oct 13-19) - Detailed Analysis

### Platform Totals
| Platform | Orders | Sales | % of Total |
|----------|--------|-------|------------|
| Uber Eats | 815 | $15,459.50 | 35.6% |
| DoorDash | 806 | $23,447.80 | 54.0% |
| Grubhub | 153 | $4,505.69 | 10.4% |
| **TOTAL** | **1,774** | **$43,412.99** | **100%** |

### Per-Location Breakdown

| Location | UE Orders | DD Orders | GH Orders | Total Orders | Total Sales |
|----------|-----------|-----------|-----------|--------------|-------------|
| AZ900482 Tucson Broadway | 48 | 99 | 16 | 163 | $4,489.11 |
| NV008 Las Vegas Sahara | 59 | 45 | 6 | 110 | $3,677.52 |
| NV036 Las Vegas Silverado | 71 | 32 | 6 | 109 | $2,408.55 |
| NV051 Henderson Horizon | 65 | 27 | 3 | 95 | $2,065.83 |
| NV054 Sparks Stanford | 35 | 79 | 12 | 126 | $3,015.83 |
| NV067 Reno Meadows | 47 | 101 | 11 | 159 | $3,658.02 |
| NV079 Reno Sierra St | 59 | **0 ❌** | 32 | 91 | $2,510.61 |
| NV103 Henderson Boulder Hwy | 48 | 52 | 11 | 111 | $2,799.59 |
| NV111 NLV Craig Mitchell | 85 | **0 ❌** | 8 | 93 | $1,781.51 |
| NV121 LV Downtown Summerlin | 60 | 34 | 3 | 97 | $2,176.20 |
| NV126 NLV Aliante Nature Park | 82 | **0 ❌** | 6 | 88 | $1,913.69 |
| NV151 LV Maryland Pkwy | 67 | 42 | 4 | 113 | $1,967.43 |
| NV152 Reno Plumb Virginia | 24 | 61 | 4 | 89 | $2,288.11 |
| NV191 Carson City William | 10 | 72 | 9 | 91 | $2,323.79 |
| NV900467 Sparks Los Altos | **0 ❌** | 162 | 13 | 175 | $5,002.34 |
| NV900478 LV S Las Vegas | 55 | **0 ❌** | 9 | 64 | $1,334.87 |

**Missing Store Coverage for Week 10/13:**
- 4 stores missing DoorDash (NV079, NV111, NV126, NV900478)
- 1 store missing Uber Eats (NV900467)

---

## 5. Required Actions

### Immediate Priority: Upload Missing DoorDash Data

**Missing Weeks (6 total):**
1. ✅ Week 10/13 (Oct 13-19) - **UPLOADED**
2. ⚠️ Week 10/6 (Oct 6-12) - **NEEDED**
3. ⚠️ Week 9/29 (Sep 29 - Oct 5) - **NEEDED**
4. ⚠️ Week 9/22 (Sep 22-28) - **NEEDED**
5. ⚠️ Week 9/15 (Sep 15-21) - **NEEDED**
6. ⚠️ Week 9/8 (Sep 8-14) - **NEEDED**
7. ⚠️ Week 9/1 (Sep 1-7) - **NEEDED**

**Report Type:** Financial Report > Transactions Overview

### Secondary Priority: Upload Missing Grubhub Data

**Missing Week:**
- ⚠️ Week 9/15 (Sep 15-21) - **NEEDED**

**Report Type:** Transaction reports

---

## 6. Accuracy Verification

### ✅ Verified Calculation Methods:
- Sales metrics use correct fields (sales_excl_tax for UE/DD, subtotal for GH)
- Transaction filtering properly excludes DoorDash Storefront
- Location mapping working correctly (96%+ match rate)

### ⚠️ Potential Discrepancy:
- Week 10/13 total: $43,412.99 (actual from database)
- Expected value referenced: ~$168K
- **Need clarification on expected vs actual**

---

## 7. Recommendation

**Before relying on corporate locations financial reporting:**
1. Upload missing DoorDash CSVs for weeks 9/1, 9/8, 9/15, 9/22, 9/29, 10/6
2. Upload missing Grubhub CSV for week 9/15
3. Verify individual store DoorDash/Uber Eats accounts for stores showing $0 in week 10/13

**Current Data Completeness Score: 25%** (2 out of 8 weeks complete)
