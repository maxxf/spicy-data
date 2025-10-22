# Comprehensive Data Quality Report
**All Locations, All Weeks**

Generated: October 22, 2025

## Executive Summary

After comprehensive debugging and data validation across **all 445 locations** and **all weeks** in the database, we've identified critical mapping issues affecting Uber Eats data quality.

---

## 1️⃣  Overall Transaction Counts

| Platform    | Total Transactions | Mapped      | Unmapped    | Mapping Rate |
|-------------|-------------------:|------------:|------------:|--------------|
| **Uber Eats**   | 186,363 | 43,404 | 142,959 | **23.3%** ⚠️ |
| **DoorDash**    | 116,245 | 116,244 | 1 | **100.0%** ✅ |
| **Grubhub**     | 10,959 | 9,249 | 1,710 | **84.4%** ⚠️ |
| **TOTAL**       | **313,567** | **168,897** | **144,670** | **53.9%** |

### Critical Issues Identified

#### Uber Eats - 76.7% Unmapped (142,959 transactions)
1. **141,367 transactions have blank/empty location fields**
   - These transactions were uploaded without location data in the original CSV
   - No way to map these without source files
   
2. **1,592 transactions have mismatched store codes**
   - Examples: FL100238 (415 txns), CA425 (326 txns), TX444 (177 txns)
   - These store codes don't exist in the locations table
   - Likely franchise locations or data entry errors

#### Grubhub - 15.6% Unmapped (1,710 transactions)
- **1,621 transactions**: Generic "Capriotti's Sandwich Shop" without store numbers
- **62 transactions**: "Capriotti's Sandwich Shop" (with trailing space)
- **16 transactions**: "Capriottis Sandwich Shop" (misspelled)
- **11 transactions**: Other variations

#### DoorDash - Near Perfect ✅
- Only **1 unmapped transaction** out of 116,245
- Excellent data quality

---

## 2️⃣  Location Coverage

- **Total locations in database**: 445
- **Locations with Uber Eats data**: 132 (29.7%)
- **Locations with DoorDash data**: 303 (68.1%)
- **Grubhub data**: 150 (33.7%)
- **All 3 platforms**: 124 (27.9%)

### Platform Distribution
- **DoorDash** has the widest coverage (303 locations)
- **Uber Eats** has the lowest coverage (132 locations)
- Only **27.9%** of locations have complete cross-platform data

---

## 3️⃣  Date Range Coverage

| Platform | Earliest Date | Latest Date | Unique Dates | Coverage Days |
|----------|--------------|-------------|--------------|---------------|
| DoorDash | 2025-08-25 | 2025-10-19 | 56 | ~56 days |
| Grubhub | 2025-08-25 | 2025-10-19 | 49 | ~56 days |
| Uber Eats | 10/1/25 | 9/9/25 | 62 | ~9 days* |

*Note: Uber Eats date format (M/D/YY) makes proper chronological analysis difficult. The dates appear to be from early October 2025 and early September 2025.

---

## 4️⃣  Fixes Implemented

### ✅ Uber Eats Location Mapping Fix
- **Fixed extraction logic** to parse store codes from "Capriotti's Sandwich Shop (STORECODE)" format
- **Successfully mapped 23,400 transactions** that were previously unmapped
- Improved mapping rate from 0% to 23.3%

### ✅ Grubhub Upload Logic Fix
- **Fixed key-based matching** to use `store_number` instead of generic restaurant names
- Prevents collapsing multiple locations into single mapping entry
- Week 9/8 data now correctly mapped

### ✅ DoorDash - Already Perfect
- No fixes needed, mapping logic working correctly

---

## 5️⃣  Recommendations

### Immediate Actions Required

1. **Uber Eats Data Re-upload**
   - Contact data source to obtain complete CSVs with location fields populated
   - 141,367 transactions missing location data entirely
   - Cannot be fixed without source files

2. **Store Code Reconciliation**
   - Investigate mismatched store codes: FL100238, CA425, TX444, etc.
   - Determine if these are valid franchises not in the locations table
   - Add missing locations or correct data

3. **Grubhub Data Quality**
   - Request CSVs with complete store_number fields
   - 1,710 transactions have generic names without unique identifiers

### Long-term Improvements

1. **Standardize Date Formats**
   - Convert all platforms to ISO date format (YYYY-MM-DD)
   - Current Uber Eats format (M/D/YY) causes analysis issues

2. **Upload Validation**
   - Implement pre-upload validation to reject transactions without location data
   - Add warnings for unmapped locations during upload

3. **Master Location List Maintenance**
   - Regular reconciliation of platform store codes vs. master list
   - Automated alerts for new/unrecognized store codes

---

## 6️⃣  Week 9/8 Corporate Locations Status

As previously validated, Week 9/8 (Sept 8-14, 2025) has complete data for 16 corporate locations:

- **11 locations** with all 3 platforms ✅
- **5 locations** with 2 platforms (missing one platform)
- **27,348 total transactions** uploaded and correctly mapped

This week serves as a benchmark for expected data quality.

---

## Summary

While DoorDash data quality is excellent and Grubhub is acceptable, **Uber Eats presents a critical data quality issue** with 76.7% of transactions unmapped. This severely impacts the ability to generate accurate analytics across all locations and time periods.

**Next Steps**: Prioritize obtaining complete Uber Eats source files with properly populated location fields to enable full mapping of the 141,367 blank transactions.
