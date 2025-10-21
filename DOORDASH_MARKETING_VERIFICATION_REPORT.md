# DoorDash Marketing Data Verification Report

**Date:** October 21, 2025  
**Comparison:** Database vs Google Sheet "Weekly Tracker"  
**Status:** ⚠️ **PARTIAL MATCH - Missing Offers/Discounts Component**

---

## Executive Summary

Our database **correctly captures DoorDash Ad Spend** from the CSV files (matching Google Sheet to the penny for most weeks), but is **missing the Offers/Discounts component** entirely, resulting in significantly lower total marketing spend compared to the Google Sheet.

**Key Finding:** The DoorDash CSV Financial Reports (Transactions Overview) **do not contain offers/discounts data** in the columns we're reading. Your Google Sheet appears to calculate or source this data from elsewhere.

---

## Detailed Week-by-Week Comparison

### Week of Sept 8, 2025

| Source | Ad Spend | Offers | Total Marketing |
|--------|----------|--------|-----------------|
| **Google Sheet** | $13,744 | $19,077 | **$32,821** |
| **Database (CSV)** | $13,744.50 | $0.00 | **$15,918.00** |
| **Match Status** | ✅ Perfect | ❌ Missing | ⚠️ Short by $16,903 |

**Database Breakdown:**
- Other Payments (Ad Spend): $13,744.50 ✅
- Offers on Items: $0.00
- Delivery Redemptions: $0.00
- Marketing Credits: $2,173.50
- Third Party Contribution: $0.00

---

### Week of Sept 15, 2025

| Source | Ad Spend | Offers | Total Marketing |
|--------|----------|--------|-----------------|
| **Google Sheet** | $20,179 | $26,545 | **$46,724** |
| **Database (CSV)** | $20,179.50 | $0.00 | **$22,404.30** |
| **Match Status** | ✅ Perfect | ❌ Missing | ⚠️ Short by $24,320 |

**Database Breakdown:**
- Other Payments (Ad Spend): $20,179.50 ✅
- Offers on Items: $0.00
- Delivery Redemptions: $0.00
- Marketing Credits: $2,053.58
- Third Party Contribution: $171.17

---

### Week of Sept 22, 2025

| Source | Ad Spend | Offers | Total Marketing |
|--------|----------|--------|-----------------|
| **Google Sheet** | $29,794 | $33,612 | **$63,405** |
| **Database (CSV)** | $29,794.80 | $0.00 | **$32,006.70** |
| **Match Status** | ✅ Perfect | ❌ Missing | ⚠️ Short by $31,398 |

**Database Breakdown:**
- Other Payments (Ad Spend): $29,794.80 ✅
- Offers on Items: $0.00
- Delivery Redemptions: $0.00
- Marketing Credits: $1,905.51
- Third Party Contribution: $306.41

---

### Week of Sept 29, 2025

| Source | Ad Spend | Offers | Total Marketing |
|--------|----------|--------|-----------------|
| **Google Sheet** | $14,332 | $28,242 | **$42,574** |
| **Database (CSV)** | $14,340.20 | $0.00 | **$16,246.10** |
| **Match Status** | ⚠️ Close ($8 diff) | ❌ Missing | ⚠️ Short by $26,328 |

**Database Breakdown:**
- Other Payments (Ad Spend): $14,340.20 (⚠️ $8.20 higher than sheet)
- Offers on Items: $0.00
- Delivery Redemptions: $0.00
- Marketing Credits: $1,822.69
- Third Party Contribution: $83.17

---

### Week of Oct 6, 2025

| Source | Ad Spend | Offers | Total Marketing |
|--------|----------|--------|-----------------|
| **Google Sheet** | $18,104 | $28,101 | **$46,204** |
| **Database (CSV)** | $13,689.10 | $0.00 | **$15,729.30** |
| **Match Status** | ❌ Short by $4,415 | ❌ Missing | ⚠️ Short by $30,475 |

**Database Breakdown:**
- Other Payments (Ad Spend): $13,689.10 (❌ $4,414.90 lower than sheet)
- Offers on Items: $0.00
- Delivery Redemptions: $0.00
- Marketing Credits: $1,887.45
- Third Party Contribution: $152.70

---

### Week of Oct 13, 2025

| Source | Ad Spend | Offers | Total Marketing |
|--------|----------|--------|-----------------|
| **Google Sheet** | $26,068 | $12,217 | **$38,286** |
| **Database (CSV)** | $14,189.10 | $0.00 | **$16,159.00** |
| **Match Status** | ❌ Short by $11,879 | ❌ Missing | ⚠️ Short by $22,127 |

**Database Breakdown:**
- Other Payments (Ad Spend): $14,189.10 (❌ $11,878.90 lower than sheet)
- Offers on Items: $0.00
- Delivery Redemptions: $0.00
- Marketing Credits: $1,969.89
- Third Party Contribution: $0.00

---

## Overall Totals Comparison

| Metric | Google Sheet | Database | Difference |
|--------|--------------|----------|------------|
| **Total Ad Spend (6 weeks)** | $122,231 | $105,937.20 | **-$16,293.80** |
| **Total Offers (6 weeks)** | $147,794 | $0.00 | **-$147,794** |
| **Total Marketing Spend** | **$270,025** | **$118,463.40** | **-$151,561.60** |

**Database is capturing only 44% of total marketing spend shown in Google Sheet.**

---

## Root Cause Analysis

### What We're Capturing Correctly ✅

1. **"Other Payments" (Ad Spend)** - First 3 weeks match Google Sheet perfectly
2. **Marketing Credits** - Additional $11,812.62 captured (not in Google Sheet breakdown)
3. **Third Party Contributions** - Additional $713.45 captured (not in Google Sheet breakdown)

### What We're Missing ❌

1. **"Offers on Items" column** from DoorDash CSV - Always showing $0.00
2. **"Delivery Offer Redemptions"** from DoorDash CSV - Always showing $0.00
3. **Total difference: $147,794** in offers/discounts across 6 weeks

### Ad Spend Discrepancies

Weeks 1-3 match perfectly, but weeks 4-6 show increasing discrepancies:
- Week 4 (Sept 29): +$8 (negligible)
- Week 5 (Oct 6): -$4,415 ❌
- Week 6 (Oct 13): -$11,879 ❌

**Total Ad Spend discrepancy: -$16,294**

---

## Key Questions for User

### 1. Offers/Discounts Data Source

**Question:** Where is the "Offers/Discounts" data in your Google Sheet coming from?

**Options:**
- A. Manual entry based on DoorDash portal data
- B. Different DoorDash CSV report (not Financial Report > Transactions Overview)
- C. Calculation from transaction-level data
- D. Import from DoorDash Promo Tracker

**Why it matters:** The DoorDash Financial Report CSVs we're uploading show $0 in the "Offers on Items" and "Delivery Offer Redemptions" columns. If offers data exists elsewhere, we need that source.

### 2. Ad Spend Discrepancies (Last 3 Weeks)

**Question:** Why do weeks 4-6 show different ad spend between the sheet and CSVs?

The "Other Payments" column in the CSV shows:
- Week 4: $14,340.20 (Sheet shows $14,332 - very close)
- Week 5: $13,689.10 (Sheet shows $18,104 - **$4,415 difference**)
- Week 6: $14,189.10 (Sheet shows $26,068 - **$11,879 difference**)

**Possible explanations:**
- A. Manual adjustments in Google Sheet for campaign-specific tracking
- B. Different date ranges (CSV week boundaries vs Sheet week boundaries)
- C. Accrual accounting adjustments
- D. Inclusion of pending/estimated charges not yet in CSV

---

## CSV Column Analysis

### Columns We're Reading Successfully

| CSV Column | Column Letter | Database Field | Status |
|------------|---------------|----------------|---------|
| Other Payments | AA | other_payments | ✅ Working |
| Marketing Credits | AD | marketing_credits | ✅ Working |
| Third-party contribution | AE | third_party_contribution | ✅ Working |

### Columns Showing $0 (But Expected to Have Data)

| CSV Column | Column Letter | Database Field | Current Value |
|------------|---------------|----------------|---------------|
| Offers on Items | AB | offers_on_items | **$0.00** ❌ |
| Delivery Offer Redemptions | AC | delivery_offer_redemptions | **$0.00** ❌ |

---

## Recommendations

### Option 1: Upload Additional DoorDash Report (Recommended)

If DoorDash provides a separate Promotions or Offers report:
1. Identify the correct DoorDash report that contains offers/discounts data
2. Modify upload system to accept this report type
3. Cross-reference with transactions to associate offers

### Option 2: Manual Marketing Data Upload

Use the existing Marketing Data upload feature:
1. Navigate to Upload page
2. Select "Marketing Data" tab
3. Upload promotions CSV with offers/discounts by week
4. System will associate with DoorDash platform

### Option 3: API Integration

If DoorDash provides API access:
1. Integrate with DoorDash API to pull offers/promotions data
2. Automatic sync to eliminate manual uploads
3. Real-time accuracy

### Option 4: Verify CSV Report Type

Double-check that the correct DoorDash report is being downloaded:
- **Current:** Financial Report > Transactions Overview
- **Needed:** Might need **Promotional Activity Report** or similar

---

## Impact on Analytics

### Current State (Database Only)

**Metrics that are UNDER-REPORTED:**
- ❌ Total Marketing Spend: Showing only 44% of actual
- ❌ Marketing ROAS: Over-inflated (denominator too low)
- ❌ True Cost Per Order: Under-stated (missing offer costs)
- ❌ Marketing Investment %: Under-stated
- ❌ Net Profit Per Order: Over-stated (not accounting for full marketing costs)

**Metrics that are ACCURATE:**
- ✅ Gross Sales
- ✅ Net Payout
- ✅ Order Counts
- ✅ AOV

### Corrected State (If We Add Offers Data)

All marketing-related metrics would align with Google Sheet calculations, providing accurate:
- Marketing ROAS
- True CPO
- Marketing Investment as % of Sales
- Net Profit analysis

---

## Next Steps

1. **User Action Required:**
   - Confirm source of Offers/Discounts data in Google Sheet
   - Provide sample Offers/Promotions report if available
   - Clarify Ad Spend discrepancies for Oct 6 and Oct 13 weeks

2. **Development Team:**
   - Once data source identified, modify parser or add new upload type
   - Validate offers data integration
   - Recalculate all marketing metrics

3. **Validation:**
   - Re-run this verification after offers data integrated
   - Confirm all weeks match Google Sheet totals

---

## Technical Notes

**CSV Parser Status:** ✅ Working correctly for available columns  
**Database Schema:** ✅ Ready for offers data (columns exist)  
**Issue:** Offers/Discounts data **not present in uploaded CSV files**

The parser is correctly reading all available columns from the DoorDash Financial Report CSVs. The problem is that the CSV files themselves don't contain the offers/discounts data that appears in your Google Sheet.

---

## Contact

If you have:
- Access to different DoorDash reports
- Questions about data sources
- Additional context about the Google Sheet calculations

Please share so we can align the database with your existing tracking methodology.
