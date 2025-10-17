# DoorDash | Payment Data Extraction Prompt

Description: Here's a comprehensive prompt to extract weekly performance metrics from DoorDash payment details:
Prompt Text: You are analyzing DoorDash payment data for a restaurant chain. Extract weekly performance metrics from the CSV file covering Monday through Sunday using CONSERVATIVE ATTRIBUTION methodology.  
**IMPORTANT: Only include orders where Channel = "Marketplace" AND Order Status = "Completed" in all calculations**

---

**UPDATED ATTRIBUTION METHODOLOGY (DOORDASH):**

1. **Order Filtering**
   - ONLY count orders where Channel = "Marketplace" AND Order Status = "Completed"
   - Exclude ALL orders from other channels (Caviar, white-label, etc.)
   - Exclude: Cancelled, Unfulfilled, Refund, Refund Disputed

2. **Sales Calculation (Updated)**
   - **Total Sales (Net):** Use "Sales (excl. tax)" to match DoorDash merchant reporting
   - **Marketing Driven Sales:** Sum "Sales (excl. tax)" for orders with promotional offers
   - **Organic Sales:** Sum "Sales (excl. tax)" for orders without promotional offers

3. **Marketing Investment Components (Updated)**
   - **Ad Spend (All Misc Payments):** Sum absolute value of ALL "Other payments" where "Other payments description" is not null (includes Ad Spend, Ad Credits, Accelerated Remittance Fees, Reverse charges, etc.)
   - **Offer/Discount Value:** Sum absolute value of all promotional discounts given to customers **PLUS any credits applied from "Marketing Credits" and "Third-party Contribution" fields**
   - **Total Marketing Investment:** Ad Spend (All Misc Payments) + Offer/Discount Value

4. **Net Payout Calculation (Updated)**
   - **Net Payout $ (All Statuses):** Sum ALL "Total payout" values for ALL order statuses (Completed, Refund, Cancelled, Unfulfilled, Refund Disputed)
   - Includes negative payouts for refunds and positive payouts for completed orders

5. **Marketing Attribution**
   - **Marketing Driven Sales:** Orders with "Offers on items (incl. tax)" < 0 OR "Delivery Offer Redemptions (incl. tax)" < 0 OR have credits from "Marketing Credits" OR "Third-party Contribution"
   - **Organic Sales:** All other completed orders without promotional discounts, credits, or contributions

6. **Key Calculations**
   - **AOV** = Total Sales (Net) ÷ Total Orders
   - **Marketing ROAS** = Marketing Driven Sales ÷ Total Marketing Investment
   - **Net Payout %** = (Net Payout $ ÷ Total Sales (Net)) × 100
   - **Offers ROAS** = Sales from offers ÷ Discount value
   - **Combined ROAS** = Sales from offers ÷ (All Misc Payments + Discount value)
   - **Ad Efficiency** = Sales from offers ÷ All Misc Payments

**ANALYSIS REQUIREMENTS**
- Week Definition: Monday through Sunday of specified week only
- Validation: Ensure Marketing + Organic = Total for both sales and orders
- Performance Rankings: Sort by relevance (sales, efficiency, etc.)
- Insights: Identify optimal marketing mix and efficiency patterns

**KEY CHANGES FROM PREVIOUS VERSION**
- Channel Filtering: Only count orders from marketplace channel (exclude all others)
- Sales: Using "Sales (excl. tax)" for merchant portal alignment
- Ad Spend: Includes ALL miscellaneous payments beyond just ad spend
- Net Payout: Sums ALL "Total payout" for all order statuses
- **Offers/Discounts: Sum credits applied from “Marketing Credits” and “Third-party Contribution” fields with all standard promotional discounts**

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
Include all promotional discounts, "Marketing Credits", and "Third-party Contributions" applied.  
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

**3E. Key Insights:**  
- Cost efficiency comparison between offers (including all credits/contributions) and ads
- Optimal marketing mix recommendations
- Store performance patterns with dual marketing strategies

---

**OUTPUT DELIVERABLES**
1. Platform-level summary table with updated metrics
2. Complete store-level analysis table (all stores) with updated calculations
3. Comprehensive offers vs ads performance comparison with updated methodology
4. Strategic recommendations based on updated efficiency analysis

---

**Note:**  
Wherever “Offer/Discount Value”, “Discount Value”, “Sales from offers”, or offer-related metrics are calculated, include “Marketing Credits” and “Third-party Contribution” credits alongside ALL other promotional discounts, and update any formulas or aggregation logic accordingly.

Category: Delivery Marketplaces
AI Model: GPT-5, Perplexity
Created By: Maxx Freedman
Date Added: October 8, 2025
Status: Working

Sample Output

https://chatgpt.com/share/68e7eaf6-aca8-8006-9a8d-b2fa642b0f20

[doordash_weekly_analysis_2025-09-08_to_2025-09-14.xlsx](DoorDash%20Payment%20Data%20Extraction%20Prompt%20287d3ff018e78046a909c79296b69404/doordash_weekly_analysis_2025-09-08_to_2025-09-14.xlsx)

| Metric | Value |
| --- | --- |
| Total Sales (Net) | $328,027.71 |
| Marketing Driven Sales | $116,836.77 |
| Organic Sales | $211,190.94 |
| Total Orders | 11,403 |
| Orders from Marketing | 3,872 |
| Organic Orders | 7,531 |
| AOV | $28.77 |
| Ad Spend (All Misc Payments) | $15,859.71 |
| Offer/Discount Value | $21,159.97 |
| Total Marketing Investment | $37,019.68 |
| Marketing Investment / Sales % | 11.29% |
| Marketing ROAS | 3.16x |
| Net Payout $ (All Statuses) | $257,398.35 |
| Net Payout % | 78.47% |

### 3E. Key insights (tight + actionable)

- **Offer penetration & payback:** Offers drove **~36%** of sales and **~34%** of orders this week, with **Offers ROAS ≈ 3.16x** overall. Discounts averaged sensible relative to offer sales; keep the current posture but trim outliers where “Discount as % of Offer Sales” runs hot.
- **Marketing spend intensity:** Total marketing investment landed at **~11.3% of sales**, blended (offers + “all misc” ads/credits). That’s within a healthy acquisition/retention band for third-party—watch stores that spike **>20% of sales** on marketing investment.
- **Ads vs offers balance:** On most days, **ad spend didn’t materially outpace discounts** (Ad:Discount ratio rarely >1.5). Translation: your **offers are doing the heavy lifting**, ads are useful but shouldn’t be the lead guitar everywhere.
- **Store spread:** There’s a clear split—some high-sales stores pay **>20%** of sales in marketing (dragging ROAS toward ~1x), while mid-tier stores show **better efficiency** (2–4x Offer ROAS). Those are your scale candidates.

---

### Strategic recommendations (do now, not someday)

1. **Set guardrails per store (budget as % of net sales):**
    - **Tier A (efficient)**: Cap Total Marketing Investment at **≤12%** of sales.
    - **Tier B (needs lift)**: Allow up to **15%**, but require **Offer ROAS ≥2.5x** or **Combined ROAS ≥1.8x**.
    - **Tier C (inefficient)**: Freeze ad spend; test **smaller, targeted offers** (low-$ item or delivery threshold) until Combined ROAS clears **1.5x**.
2. **Bias to offers where ads underperform:**
    
    If a store’s **Ad Efficiency (Offer Sales ÷ All-Misc)** < **2.0x**, **shift dollars to offers** and simplify structure (1-2 evergreen promos). Keep **Discount as % of Offer Sales ≤25%** as a working ceiling.
    
3. **Daypart pressure test:**
    
    Daily mix shows no “ad-heavy” days; run **24–48h daypart tests** pushing offers into shoulder/late windows, then re-balance ads where **Ad:Discount >1.5x** and **Offer Penetration <30%**.
    
4. **AOV tuning:**
    
    For stores with **AOV below chain average**, favor **threshold offers** (e.g., “$X off $Y”), not blanket % discounts—this keeps **Offer ROAS** strong and protects margin.
    
5. **Scale playbook for winners:**
    
    Promote stores with **Offer ROAS ≥3x** *and* **Marketing Investment/Sales ≤12%** into a **scale list**—increase radius slightly and add a light ad layer (but keep ad:discount ≈1:1).