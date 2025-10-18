# Location Matching & Data Aggregation Improvements

## Priority 1: Critical Data Integrity (Implement First)

### 1.1 Add Match Confidence Tracking
**What:** Track and expose confidence scores for location matches
**Why:** Prevents silent data errors from bad fuzzy matches
**How:**
- Add `matchConfidence` field to locations table
- Add `matchMethod` enum: 'exact' | 'fuzzy' | 'manual'
- Show confidence in Locations table with visual indicators
- Require manual review for matches < 0.95

```typescript
// Enhanced location schema
export const locations = pgTable("locations", {
  // ... existing fields
  matchConfidence: real("match_confidence"), // 0.0 to 1.0
  matchMethod: text("match_method"), // 'exact' | 'fuzzy' | 'manual'
  lastReviewedAt: timestamp("last_reviewed_at"),
  lastReviewedBy: varchar("last_reviewed_by"),
});
```

### 1.2 Implement Duplicate Order Detection
**What:** Prevent same transaction from being counted twice
**Why:** Ensures accurate sales reporting
**How:**
- Add unique constraint on (platform, orderId, clientId)
- On upload, check for existing orders
- Return report: "150 new orders, 3 duplicates skipped"

```typescript
// Add to transaction tables
export const uberEatsTransactions = pgTable("uber_eats_transactions", {
  // ... existing fields
}, (table) => ({
  uniqueOrder: unique().on(table.clientId, table.orderId),
}));
```

### 1.3 Location Verification Workflow
**What:** Manual review queue for unverified/low-confidence matches
**Why:** User confirms AI matches before trusting data
**How:**
- Enhanced Locations page with tabs: "All" | "Needs Review" | "Verified"
- Show suggested matches with confidence scores
- Allow user to:
  - ✅ Approve match
  - ❌ Reject and split into separate location
  - 🔗 Manually link to different location

## Priority 2: Marketing Attribution

### 2.1 Link Transactions to Campaigns
**What:** Connect transaction-level marketing data to campaign records
**Why:** Enable true campaign ROI calculation
**How:**
- Add `promotionId` and `campaignId` to transaction tables (nullable)
- During CSV upload, attempt to match marketing indicators to campaigns
- Matching rules:
  - Uber Eats: Match by campaign name, date range, location
  - DoorDash: Match by promotion code, date range  
  - Grubhub: Match by promotion name pattern

```typescript
export const uberEatsTransactions = pgTable("uber_eats_transactions", {
  // ... existing fields
  promotionId: varchar("promotion_id").references(() => promotions.id),
  paidAdCampaignId: varchar("paid_ad_campaign_id").references(() => paidAdCampaigns.id),
  attributionConfidence: real("attribution_confidence"), // How sure we are
});
```

### 2.2 Campaign Performance Calculation
**What:** Aggregate transaction data by campaign
**Why:** Show actual ROAS, not estimated
**How:**
- New analytics endpoint: `/api/analytics/campaign-performance/:campaignId`
- Returns:
  - Total orders with this campaignId
  - Total sales from those orders
  - Total marketing spend
  - Actual ROAS (sales / spend)
  - Customer segments (new vs returning)

## Priority 3: Enhanced Location Matching Algorithm

### 3.1 Multi-Factor Matching
**Current:** Only uses string similarity
**Enhanced:** Combine multiple signals

```typescript
function calculateLocationMatchScore(
  locationName: string,
  existingLocation: Location,
  platform: string
): { score: number, factors: MatchFactors } {
  const factors = {
    nameSimilarity: calculateStringSimilarity(locationName, existingLocation.canonicalName),
    platformNameSimilarity: calculatePlatformSimilarity(locationName, existingLocation, platform),
    addressSimilarity: calculateAddressSimilarity(locationName, existingLocation), // New
    brandMatch: checkBrandKeywords(locationName, existingLocation), // New
  };
  
  // Weighted score
  const score = (
    factors.nameSimilarity * 0.4 +
    factors.platformNameSimilarity * 0.3 +
    factors.addressSimilarity * 0.2 +
    factors.brandMatch * 0.1
  );
  
  return { score, factors };
}
```

### 3.2 Smart Name Normalization
**What:** Preprocess location names before comparison
**Why:** "BDS - East Village" should match "Brooklyn Dumpling Shop (East Village)"

```typescript
function normalizeLocationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(|\)|\[|\]/g, '') // Remove brackets
    .replace(/\s-\s/g, ' ') // Remove dashes with spaces
    .replace(/\b(the|and|&)\b/g, '') // Remove common words
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Acronym expansion dictionary
const brandAcronyms: Record<string, string> = {
  'bds': 'brooklyn dumpling shop',
  'bk': 'brooklyn',
  // ... more mappings
};
```

### 3.3 Batch Review UI
**What:** Review all unverified locations at once
**Why:** Faster to verify 50 locations in batch vs one-by-one
**How:**
- Table with columns: Location Name | Platforms | Suggested Merge | Confidence | Action
- Bulk actions: "Verify Selected" | "Split Selected" | "Merge Selected"
- Show transaction counts per location to help user decide

## Priority 4: Data Quality Dashboard

### 4.1 Upload Summary Report
**What:** Show data quality metrics after each upload
**Why:** User knows exactly what happened
**Return:**
```json
{
  "rowsProcessed": 150,
  "successfulTransactions": 147,
  "duplicatesSkipped": 3,
  "locationsMatched": {
    "exact": 120,
    "fuzzy": 25,
    "new": 2
  },
  "unmatchedOrders": 5,
  "warnings": [
    "5 orders could not be matched to any location (confidence < 0.5)"
  ]
}
```

### 4.2 Data Health Metrics
**New Dashboard Section:** "Data Quality"
- **Location Match Rate:** 95% of transactions matched to verified locations
- **Unverified Locations:** 3 locations need review (47 transactions)
- **Potential Duplicates:** 2 location pairs might be the same
- **Missing Marketing Attribution:** 12% of transactions have marketing spend but no campaign link

## Implementation Sequence

**Phase 1: Foundation (Week 1)**
1. Add matchConfidence, matchMethod fields to locations
2. Implement duplicate order detection
3. Show confidence scores in Locations table

**Phase 2: Verification Workflow (Week 2)**
4. Create "Needs Review" tab on Locations page
5. Build approve/reject/merge UI
6. Add bulk actions

**Phase 3: Marketing Attribution (Week 3)**
7. Add promotionId/campaignId to transactions
8. Build matching rules for each platform
9. Create campaign performance endpoints
10. Update Promotions/Ads pages with actual data

**Phase 4: Advanced Matching (Week 4)**
11. Implement multi-factor scoring
12. Add name normalization
13. Create batch review UI
14. Build data quality dashboard

## Testing Strategy

**Synthetic Data Tests:**
- Create locations with similar names (0.75-0.95 similarity)
- Upload CSVs with intentional duplicates
- Test name variations: "NYC" vs "New York City"

**Real-World Data Tests:**
- Use actual Uber Eats CSV from attached files
- Verify Brooklyn Dumpling Shop locations merge correctly
- Check campaign attribution accuracy

## Success Metrics

- **Location Match Accuracy:** >98% of matches verified as correct by human
- **Duplicate Prevention:** 100% of duplicate orders caught
- **Campaign Attribution:** >80% of marketing transactions linked to campaigns
- **User Confidence:** User can trust dashboard numbers without manual validation
