# Marketing Attribution Logic Documentation

## Overview
This document explains how orders are classified as "marketing-driven" vs "organic" across all delivery platforms, and how marketing spend is calculated and attributed to sales.

---

## Platform-Specific Attribution Logic

### **DoorDash**
**Attribution Field**: `other_payments` (stored as "Marketing fees" in CSV)

**Logic**:
```typescript
const hasMarketing = (t.otherPayments || 0) > 0;
```

**Interpretation**:
- `otherPayments = 0` → **Organic order** (no marketing attribution)
- `otherPayments = 0.99` → **Offer redemption order** (promotional discount)
- `otherPayments > 1.00` → **Ad-driven order** (paid advertising)

**Marketing Spend Calculation**:
- **Ad Spend**: Sum of all `other_payments` values (actual advertising charges by DoorDash)
- **Offer Discounts**: Sum of:
  - `abs(offers_on_items)` (item-level promotional discounts)
  - `abs(delivery_offer_redemptions)` (delivery fee discounts)
  - `marketing_credits` (marketing credit redemptions)
  - `third_party_contribution` (third-party promotional contributions)

**Total Marketing Investment** = Ad Spend + Offer Discounts

**CSV Fields**:
- `Marketing fees | (including any applicable taxes)` → `other_payments`
- `Offers on items` → `offers_on_items` (negative values)
- `Delivery Offer Redemptions` → `delivery_offer_redemptions` (negative values)
- `Marketing Credits` → `marketing_credits` (positive values)
- `Third-party contribution` → `third_party_contribution` (positive values)

---

### **Uber Eats**
**Attribution Fields**: 
1. `offers_on_items` (promotional offers - primary)
2. `other_payments_description` (ad-driven orders - rare)

**Logic**:
```typescript
const isAdDriven = t.otherPaymentsDescription && 
                   t.otherPaymentsDescription.toLowerCase().includes('ad spend');
const hasPromotionalOffer = (t.offersOnItems < 0) || (t.deliveryOfferRedemptions < 0);

const hasMarketing = isAdDriven || hasPromotionalOffer;
```

**Interpretation**:
- `offers_on_items < 0` → **Promotional offer order** (most common)
- `delivery_offer_redemptions < 0` → **Delivery offer order** (rare)
- `other_payments_description = "Ad Spend"` → **Ad-driven order** (rare)
- None of the above → **Organic order**

**Marketing Spend Calculation**:
- **Ad Spend**: 
  - Order-level: Sum of `other_payments` where description contains "Ad Spend"
  - Platform-level: Tracked separately in `platform_ad_spend` table (store-level advertising not tied to specific orders)
- **Offer Discounts**: Sum of:
  - `abs(offers_on_items)` (promotional item discounts)
  - `abs(delivery_offer_redemptions)` (delivery fee discounts)

**Total Marketing Investment** = Ad Spend (order + platform) + Offer Discounts

**CSV Fields**:
- `Offers on items (incl. tax)` → `offers_on_items` (negative values) - **Primary attribution signal**
- `Delivery Offer Redemptions (incl. tax)` → `delivery_offer_redemptions` (negative values)
- `Other payments` → `other_payments` (positive for ad spend)
- `Other payments description` → `other_payments_description` (e.g., "Ad Spend", "Customer contribution")

**Ad Spend Pattern Matching** (for legacy support):
```typescript
const adPattern = /\b(ad|ads|advertising|paid\s*promotion|ad\s*spend|ad\s*fee|ad\s*campaign)\b/i;
const adjustmentPattern = /\b(adjust|added|upgrade)\b/i;
const isAdRelated = adPattern.test(desc) && !adjustmentPattern.test(desc);
```

---

### **Grubhub**
**Attribution Field**: `merchant_funded_promotion`

**Logic**:
```typescript
const hasMarketing = t.merchantFundedPromotion !== 0;
```

**Interpretation**:
- `merchant_funded_promotion ≠ 0` → **Marketing-driven order** (merchant-funded promotional discount)
- `merchant_funded_promotion = 0` → **Organic order**

**Marketing Spend Calculation**:
- **Ad Spend**: Not tracked by Grubhub (no separate ad spend field)
- **Offer Discounts**: `abs(merchant_funded_promotion)` (stored as negative values)

**Total Marketing Investment** = Offer Discounts only

**CSV Fields**:
- `Merchant Funded Promotion` → `merchant_funded_promotion` (negative values)

---

## Key Metrics Calculated

### **Marketing-Driven Sales**
Sum of sales (subtotal or sale amount) for all orders where `hasMarketing = true`

### **Organic Sales**
Total Sales - Marketing-Driven Sales

### **Orders from Marketing**
Count of orders where `hasMarketing = true`

### **Organic Orders**
Total Orders - Orders from Marketing

### **Marketing ROAS (Return on Ad Spend)**
```
ROAS = Marketing-Driven Sales / Total Marketing Investment
```

### **Marketing Investment %**
```
Marketing Investment % = (Total Marketing Investment / Total Sales) × 100
```

---

## Important Notes

### **DoorDash Specific**
- **Channel Filtering**: Only "Marketplace" orders are included (Storefront orders are excluded)
- **Status Filtering**: Only completed orders are counted for sales metrics:
  - `transactionType = "Order"` (from Transaction Report CSV), OR
  - `orderStatus = "Delivered"` or `"Picked Up"` (from Store Statement CSV)
- **Payout Handling**: Net payout includes ALL transaction statuses (including refunds/adjustments)

### **Uber Eats Specific**
- **Date Format**: Dates stored as M/D/YY (e.g., "9/8/25") require special parsing
- **Status Filtering**: Only `orderStatus = "Completed"` orders are counted
- **Dual CSV Headers**: Payment report CSVs have 2 header rows (description + actual headers)

### **Grubhub Specific**
- **Transaction Type Filtering**: Only "Prepaid Order" transactions count for sales/orders
- **Payout Handling**: Net payout includes ALL transaction types (Prepaid Order, Order Adjustment, Cancellation)

---

## Data Validation Examples

### **Week 9/8 (Sept 8-14, 2025) - Capriotti's**

**DoorDash**:
- Total Orders: 11,160
- Marketing-Driven Orders: 5,408 (48.5%)
- Marketing-Driven Sales: $177,224
- Total Marketing Investment: $15,917 ($13,744 ad spend + $2,173 offers)
- ROAS: 11.1x

**Uber Eats**:
- Total Orders: 3,586
- Marketing-Driven Orders: 597 (16.6%)
- Marketing-Driven Sales: $25,995
- Total Marketing Investment: $3,961 (all offers, no ad spend)
- ROAS: 6.56x

**Grubhub**:
- Total Orders: 1,493
- Marketing-Driven Orders: 290 (19.4%)
- Marketing-Driven Sales: $12,148
- Total Marketing Investment: $1,631 (all offers)
- ROAS: 7.45x

---

## Code Location

**Attribution Functions**:
- `calculateUberEatsMetrics()` - Line 52 in `server/db-storage.ts`
- `calculateDoorDashMetrics()` - Line 125 in `server/db-storage.ts`
- Grubhub attribution - Inline in `calculatePlatformMetrics()` at line 753 in `server/db-storage.ts`

**Helper Functions**:
- `isUberEatsDateInRange()` - Line 206 in `server/db-storage.ts` (handles M/D/YY date format)

---

## Future Enhancements

1. **UberEats Platform-Level Ad Spend**: Currently tracked separately in `platform_ad_spend` table but not yet uploaded via CSV
2. **Campaign-Level Attribution**: Track which specific promotions/ad campaigns drove each order
3. **Location-Level Ad Spend**: Break down ad spend by location for more granular ROAS analysis
