# Uber Eats | Payment Data Extraction Prompt

Description: Here's a comprehensive prompt to extract weekly performance metrics from Uber Eats payment details:
Prompt Text: You are analyzing Uber Eats payment data for a restaurant chain. Extract weekly performance metrics from the CSV file covering Monday through Sunday using CONSERVATIVE ATTRIBUTION methodology.

**IMPORTANT: Only include COMPLETED orders in all calculations (Order Status = "Completed")**

---

**PART 1: Platform-Level Overview Table**

| Metric | Value |
|--------|--------|
| Total Sales (Net) | $XXX,XXX.XX |
| Marketing Driven Sales | $XXX,XXX.XX |
| Organic Sales | $XXX,XXX.XX |
| Total Orders | X,XXX |
| Orders from Marketing | XXX |
| Organic Orders | X,XXX |
| AOV | $XX.XX |
| Ad Spend (All Misc Payments) | $X,XXX.XX |
| Offer/Discount Value | $X,XXX.XX |
| Total Marketing Investment | $X,XXX.XX |
| Marketing Investment / Sales % | X.XX% |
| Marketing ROAS | X.XXx |
| Net Payout $ (All Statuses) | $XX,XXX.XX |
| Net Payout % | XX.XX% |

---

**PART 2: Store-Level Analysis Table**

Create a detailed table showing the same metrics for each store, sorted by Total Sales (highest to lowest):

| Store Name | Total Sales (Net) | Marketing Driven Sales | Organic Sales | Total Orders | Orders from Marketing | Organic Orders | AOV | Ad Spend (All Misc) | Offer/Discount Value | Total Marketing Investment | Marketing Investment / Sales % | Marketing ROAS | Net Payout $ (All Statuses) | Net Payout % |
|------------|-------------|------------------------|---------------|--------------|----------------------|----------------|-----|----------|---------------------|----------------------------|-------------------------------|----------------|--------------|---------------|
| Store A | $X,XXX.XX | $XXX.XX | $X,XXX.XX | XXX | XX | XXX | $XX.XX | $XXX.XX | $XXX.XX | $XXX.XX | X.XX% | X.XXx | $X,XXX.XX | XX.XX% |

---

**PART 3: Offers vs Ads Performance Comparison**

**3A. Offers Performance Analysis:**

| Metric | Value |
|--------|--------|
| Total Orders with Offers | XXX |
| - Item Offers | XXX |
| - Delivery Offers | XXX |
| Sales from Offers (Net) | $XX,XXX.XX |
| Total Discount Value | $X,XXX.XX |
| Discount as % of Offer Sales | XX.XX% |
| Average Discount per Order | $XX.XX |
| Net Payout from Offer Orders | $XX,XXX.XX |
| Offers ROAS (Sales/Discount) | X.XXx |

**3B. Ads Performance Analysis:**

| Metric | Value |
|--------|--------|
| Total Ad Spend (All Misc Payments) | $X,XXX.XX |
| - Ad Spend | $X,XXX.XX |
| - Ad Credits & Other Fees | $XXX.XX |
| Ad Spend Net Payout Impact | $-X,XXX.XX |
| Stores Running Ads | XXX/XXX (XX.X%) |
| Average Daily Ad Spend | $XXX.XX |
| Average Ad Spend per Store | $XX.XX |

**3C. Daily Offers vs Ads Breakdown:**

| Date | Offer Sales (Net) | Offer Discount | Ad Spend (All Misc) | Offer Penetration % | Ad:Discount Ratio |
|------|-------------|----------------|----------|---------------------|------------------|
| 9/8/25 | $X,XXX | $XXX | $XXX | XX.X% | X.Xx |

**3D. Store-Level Offers vs Ads Efficiency (Top 10 stores with both):**

| Store Name | Total Sales (Net) | Offer ROAS | Combined ROAS | Ad Efficiency |
|------------|-------------|------------|---------------|---------------|
| Store A | $X,XXX | X.Xx | X.Xx | X.Xx |

**3E. Key Insights:**
- Cost efficiency comparison between offers and ads
- Optimal marketing mix recommendations
- Store performance patterns with dual marketing strategies

---

**UPDATED ATTRIBUTION METHODOLOGY:**

1. **Order Filtering**: 
   - ONLY count orders where Order Status = "Completed"
   - Exclude: Cancelled, Unfulfilled, Refund, Refund Disputed

2. **Sales Calculation** (Updated):
   - **Total Sales (Net)**: Use "Sales (excl. tax)" to match merchant portal reporting
   - **Marketing Driven Sales**: Sum "Sales (excl. tax)" for orders with promotional offers
   - **Organic Sales**: Sum "Sales (excl. tax)" for orders without promotional offers

3. **Marketing Investment Components** (Updated):
   - **Ad Spend (All Misc Payments)**: Sum absolute value of ALL "Other payments" where "Other payments description" is not null (includes Ad Spend, Ad Credits, Accelerated Remittance Fees, Reverse charges, etc.)
   - **Offer/Discount Value**: Sum absolute value of all promotional discounts given to customers
   - **Total Marketing Investment**: Ad Spend (All Misc Payments) + Offer/Discount Value

4. **Net Payout Calculation** (Updated):
   - **Net Payout $ (All Statuses)**: Sum ALL "Total payout" values for ALL order statuses (Completed, Refund, Cancelled, Unfulfilled, Refund Disputed)
   - Includes negative payouts for refunds and positive payouts for completed orders

5. **Marketing Attribution**:
   - **Marketing Driven Sales**: Orders with "Offers on items (incl. tax)" < 0 OR "Delivery Offer Redemptions (incl. tax)" < 0
   - **Organic Sales**: All other completed orders without promotional discounts

6. **Key Calculations**:
   - **AOV** = Total Sales (Net) ÷ Total Orders
   - **Marketing ROAS** = Marketing Driven Sales ÷ Total Marketing Investment  
   - **Net Payout %** = (Net Payout $ ÷ Total Sales (Net)) × 100
   - **Offers ROAS** = Sales from offers ÷ Discount value
   - **Combined ROAS** = Sales from offers ÷ (All Misc Payments + Discount value)
   - **Ad Efficiency** = Sales from offers ÷ All Misc Payments

**ANALYSIS REQUIREMENTS:**

- Week Definition: Monday through Sunday of specified week only
- Validation: Ensure Marketing + Organic = Total for both sales and orders
- Performance Rankings: Sort by relevance (sales, efficiency, etc.)
- Insights: Identify optimal marketing mix and efficiency patterns

**KEY CHANGES FROM PREVIOUS VERSION:**
- **Sales**: Now using "Sales (excl. tax)" instead of "Sales (incl. tax)" for merchant portal alignment
- **Ad Spend**: Now includes ALL miscellaneous payments (Ad Spend + Ad Credits + Fees + Reverse Charges) instead of just "Ad Spend"
- **Net Payout**: Now sums ALL "Total payout" across ALL order statuses instead of just completed orders

**OUTPUT DELIVERABLES:**
1. Platform-level summary table with updated metrics
2. Complete store-level analysis table (all stores) with updated calculations  
3. Comprehensive offers vs ads performance comparison with updated methodology
4. Strategic recommendations based on updated efficiency analysis

Category: Delivery Marketplaces
AI Model: GPT-5, Perplexity
Created By: Maxx Freedman
Date Added: October 8, 2025
Status: Working

## PART 1: Platform-Level Overview

| **Metric** | **Value** |
| --- | --- |
| Total Sales (Net) | $122,347.89 |
| Marketing Driven Sales | $24,220.46 |
| Organic Sales | $98,127.43 |
| Total Orders | 3,615 |
| Orders from Marketing | 599 |
| Organic Orders | 3,016 |
| AOV | $33.84 |
| Ad Spend (All Misc Payments) | $5,253.00 |
| Offer/Discount Value | $3,967.46 |
| Total Marketing Investment | $9,220.46 |
| Marketing Investment / Sales % | 7.54% |
| Marketing ROAS | 2.63x |
| Net Payout $ (All Statuses) | $91,314.08 |
| Net Payout % | 74.63% |

I ran this prompt with an Uber payment details report from 9/8 - 9/14. Data doesn’t match the in the sheet @Rodrigo Gutierrez 

| **Metric** | **Value** |
| --- | --- |
| Total Sales | $131,619.89 |
| Marketing Driven Sales | $26,074.98 |
| Organic Sales | $105,544.91 |
| Total Orders | 3,615 |
| Orders from Marketing | 599 |
| Organic Orders | 3,016 |
| AOV | $36.41 |
| Ad Spend | $5,132.70 |
| Offer/Discount Value | $3,967.46 |
| Total Marketing Investment | $9,100.16 |
| Marketing Investment / Sales % | 6.91% |
| Marketing ROAS | 2.87x |
| Net Payout $ | $91,302.38 |
| Net Payout % | 69.37% |

**Store Level Financials from same prompt**

[store_level_complete_analysis.csv](Uber%20Eats%20Payment%20Data%20Extraction%20Prompt%20287d3ff018e780f1b7a7ef518a94b4d1/store_level_complete_analysis.csv)

[ads_performance_analysis.csv](Uber%20Eats%20Payment%20Data%20Extraction%20Prompt%20287d3ff018e780f1b7a7ef518a94b4d1/ads_performance_analysis.csv)

@Maxx Freedman - ran it from same dates (Sep 8th to Sep 14th) got this
Ad spend is not being accounted

| Metric | Value |
| --- | --- |
| Total Sales | $122,347.89 |
| Marketing Driven Sales | $24,196.79 |
| Organic Sales | $98,151.10 |
| Total Orders | 3,615 |
| Orders from Marketing | 598 |
| Organic Orders | 3,017 |
| AOV | $33.84 |
| Ad Spend | $0.00 |
| Offer/Discount Value | $4,292.34 |
| Total Marketing Investment | $4,292.34 |
| Marketing Investment / Sales % | 3.51% |
| Marketing ROAS | 5.64x |
| Net Payout $ | $96,435.08 |
| Net Payout % | 78.82% |

![image.png](Uber%20Eats%20Payment%20Data%20Extraction%20Prompt%20287d3ff018e780f1b7a7ef518a94b4d1/image.png)