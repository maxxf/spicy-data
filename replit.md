# Spice Digital Multi-Platform Delivery Analytics Dashboard

## Overview

This project is a data analytics dashboard designed for restaurant chains to monitor and analyze their performance across various third-party delivery platforms (Uber Eats, DoorDash, and Grubhub). It processes CSV payment data from these platforms to provide comprehensive metrics, including sales performance, marketing ROI, location-specific analytics, and cross-platform location matching.

The application supports multi-tenant use cases, managing data for multiple restaurant clients, each with numerous locations operating on different delivery platforms. The business vision is to provide granular insights into delivery operations, enabling restaurants to optimize strategies, improve profitability, and understand market potential across their digital storefronts.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18+ with TypeScript
- Vite for building and development
- Wouter for client-side routing
- TanStack Query for server state management and caching

**UI Framework:**
- shadcn/ui component library built on Radix UI
- Tailwind CSS for styling with a custom design system ("New York" style, data-dense)
- Custom color palette with light/dark modes and teal brand colors
- Responsive layout optimized for data visualization

**Component Architecture:**
- Modular structure with shared UI components
- Custom components like MetricCard, DataTable, PlatformBadge, FileUploadZone, ClientSelector, PlatformSelector, WeekSelector
- Page-based routing: Dashboard, Campaigns, Upload, Locations, Admin
- Sidebar navigation with a responsive context
- **Admin Page**: One-time client onboarding features including master location list import from Google Sheets
- Comprehensive filtering system:
  - **Week filtering** via WeekSelector component - defaults to most recent week from transaction data
  - Client filtering via ClientSelector component
  - **Location filtering** via LocationSelector component - only appears when a specific client is selected (not "All Clients")
  - Platform filtering via PlatformSelector component (All, Uber Eats, DoorDash, Grubhub)
  - Location tag filtering (e.g., "Corporate" tag for 16 corporate locations)
  - Each page independently manages its own week selection (no cross-page persistence)

**Campaigns Page Features:**
- **Combined Overview** tab (default): Shows unified metrics for paid ads and promotional offers
  - Combined ROAS: Overall return on total marketing investment (ads + offers)
  - True Cost Per Order (CPO): Total marketing investment ÷ total orders
  - Marketing AOV: Average order value from marketing-driven sales
  - Net Profit Per Order: Marketing AOV - True CPO
  - Marketing Mix Breakdown: Side-by-side comparison of ads vs offers with revenue contribution %
- **Promotions** tab: Individual promotional campaigns with ROAS metrics (not ROI percentage)
  - Total Cost calculation includes both customer discounts AND platform marketing fees
  - ROAS calculated as: revenue / (discountCost + marketingFees)
- **Paid Advertising** tab: Individual ad campaigns with ROAS, CTR, impressions, clicks
- All aggregate metrics display ROAS as multipliers (e.g., "2.5x") rather than percentages
- Promotion cost breakdown transparently shows discounts vs. marketing fees

### Backend Architecture

**Server Framework:**
- Express.js server with TypeScript
- In-memory storage (MemStorage) designed for future migration to PostgreSQL
- RESTful API design

**Data Processing Pipeline:**
- CSV parsing using `csv-parse`
- Platform-specific parsing logic for Uber Eats, DoorDash, and Grubhub
- String similarity matching for location reconciliation
- Transaction validation and data normalization
- **Platform-Specific Transaction Status Handling**:
  - **Uber Eats**: No orderStatus field exists in CSV data → All transactions counted (CSV exports only include completed orders)
  - **DoorDash**: Filters to Marketplace channel + Completed status (Delivered or Picked Up) for sales/order metrics
    - Sales Calculation: Uses "Sales (excl. tax)" as primary metric
    - Marketing Investment: Ad Spend (from "Other payments") + Offer Value (promotional discounts + credits)
    - Marketing Attribution: Orders with promotional offers, delivery offers, marketing credits, or third-party contributions
    - Net Payout: Sums ALL order statuses (including refunds, cancellations) for Marketplace channel only
  - **Grubhub**: Filters by transaction_type field for sales/order metrics vs net payout
    - **Sales/Orders**: Only counts `transaction_type = "Prepaid Order"` (completed orders) 
    - **Net Payout**: Includes ALL transaction types (Prepaid Order, Order Adjustment, Cancellation) for finance reconciliation
    - `saleAmount` = `subtotal` + `subtotalSalesTax` (calculated during CSV import)
    - This filtering prevents adjustments (-$516) and cancellations (-$376) from inflating sales metrics while maintaining accurate net payout totals

**API Endpoints:**
- `/api/clients`: Client management
- `/api/locations`: Location management and matching
- `/api/locations/suggestions`: Fuzzy matching for unlinked locations
- `/api/upload`: CSV file upload for transaction data
- `/api/upload/marketing`: Marketing CSV upload
- `/api/analytics/weeks`: Returns available weeks from transaction data (sorted by most recent first)
- `/api/analytics/*`: Aggregated platform-level, location-level, and client performance metrics with filtering support
  - Query parameters: `clientId`, `locationId`, `platform` (ubereats|doordash|grubhub), `locationTag`, `weekStart`, `weekEnd`
  - Filters apply consistently across dashboard overview and location metrics
  - LocationSelector automatically resets when client selection changes
- `/api/promotions`: Promotion management
- `/api/paid-ads`: Paid ad campaign management

### Data Model

**Core Entities:**
- **Clients**: Restaurant brands/chains (e.g., Capriotti's)
- **Locations**: Physical restaurant locations with platform-specific name mappings
- **Transactions**: Platform-specific payment/order records
- **Promotions**: Marketing campaigns with performance metrics
- **Paid Ad Campaigns**: Advertising campaigns with performance metrics
- **Campaign Location Metrics**: Location-level performance data per campaign

**Location Matching Strategy:**
- Canonical name as the single source of truth
- Platform-specific names (uberEatsName, doordashName, grubhubName) map to canonical locations
- Fuzzy string matching for suggestions and manual verification workflow
- Location tagging system for grouping (e.g., "Corporate" tag applied to 16 corporate locations)

**Analytics Calculations:**
- ROAS (Return on Ad Spend)
- Net payout percentages
- Average Order Value (AOV)
- Platform-level and location-level aggregations
- All metrics support multi-dimensional filtering:
  - By week (defaults to most recent week with available transaction data)
  - By client/brand
  - By platform (Uber Eats, DoorDash, Grubhub)
  - By location tag (e.g., Corporate locations only)
- Defensive null handling: All numeric formatters return em dash (—) for missing/undefined values to prevent crashes

### Database Design (Drizzle ORM)

**Schema Definition:**
- Drizzle ORM with PostgreSQL dialect, defined in `/shared/schema.ts`
- Zod schemas for runtime validation
- UUID primary keys

**Current State & Migration:**
- In-memory storage for development, with a database configuration ready for PostgreSQL via `@neondatabase/serverless`.
- `IStorage` interface allows swapping implementations.
- Drizzle-kit for migration management.

### File Upload Processing

**Transaction Data Upload:**
- CSV file upload with platform and client ID identification
- Server-side parsing, column validation, location matching, and transaction record creation
- **Location Matching Strategy (Platform-Specific):**

**Master Sheet Structure:**
  - **Column C**: "Shop IDs Owned" - Master Store Code (canonical ID, e.g., "69|15645")
  - **Column E**: Platform-specific matching keys for DoorDash and Uber Eats
  - **Column G**: Address for Grubhub matching

**Platform Matching Logic:**
  - **DoorDash**: "Merchant Store ID" from CSV → Column E (doorDashStoreKey) with dual-strategy fallback ✅
    - CSV Field: `merchant_store_id` (e.g., "IA069", "8", "467")
    - **Strategy 1 (Primary)**: Exact match to doorDashStoreKey field (Column E from master sheet)
    - **Strategy 2 (Numeric IDs only)**: If merchant_store_id is numeric-only (e.g., "8", "467"):
      - First try matching with leading zeros removed (e.g., "8" → "NV008", "121" → "NV121")
      - Then fallback to store_name matching if numeric match fails (e.g., "467" + "Los Altos" → "NV900467 Sparks Los Altos")
    - This handles cases where DoorDash CSVs have incomplete store IDs (numeric-only instead of alphanumeric)
    - No match → transaction goes to "Unmapped Locations" bucket
    
  - **Uber Eats**: Extract code from "Store Name" → Column E (uberEatsStoreLabel) ✅
    - CSV Field: `Store Name` (e.g., "Capriotti's Sandwich Shop (IA069)")
    - Extraction: Regex extracts code from parentheses → "IA069"
    - Matches to: uberEatsStoreLabel field (Column E from master sheet)
    - NOTE: CSV "Store ID" column is auxiliary data, NOT used for matching
    - Direct exact match by extracted code ensures accurate consolidation
    - No match → transaction goes to "Unmapped Locations" bucket
    
  - **Grubhub**: "street_address" from CSV → Column G (address) exact match only
    - CSV Field: `store_address` or `Address` or `Store_Address`
    - Matches to: address field (Column G from master sheet)
    - Exact address match (case-insensitive) - NO fuzzy matching
    - No match → transaction goes to "Unmapped Locations" bucket
    
**Unmapped Location Bucket:**
  - System creates one special "Unmapped Locations" location per client
  - All transactions that fail to match the master location list go here
  - Tagged with `locationTag: "unmapped_bucket"` for easy identification
  - NO auto-creation of new locations beyond the master list
  - Unmapped transactions can be reviewed and manually reassigned to correct locations
- **Batch optimization for high-volume imports:**
  - Location caching: Collects unique locations upfront and batch creates/finds them to eliminate N+1 query problems
  - Batch insert: Processes transactions in chunks of 500 with upsert logic to prevent duplicates
  - Performance: DoorDash (21,762 txns in 17.5s), Grubhub (1,602 txns in 105s), Uber Eats (3,726 txns in 20.7s)
  - DoorDash: Uses unique `transactionId` field to support multiple transaction types per order
  - Uber Eats: Automatic deduplication for multi-row CSV structure (reduces duplicates within batch)
  - Grubhub: Uses unique `transactionId` field to support multiple transaction types per order
- Success/error feedback via toast notifications

**Marketing Data Upload:**
- Supports platform and data type selection (DoorDash/Uber Eats; Promotions/Ads/Campaigns/Offers).
- CSV processing based on platform/data type, extracting campaign and location-level metrics.
- Fuzzy location matching (0.8 threshold) to link store names to canonical locations.
- Deduplication logic for campaign records (by `campaignId`) and location metrics (by `campaignId`, `locationId`, `dateStart`) using upsert logic.
- Creates/updates promotion or paid ad campaign records and stores location-level metrics in the `campaignLocationMetrics` table.

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting (configured, but currently using in-memory for development).
- **Replit**: Development and deployment platform.

### Key NPM Packages

**Frontend:**
- `@tanstack/react-query`
- `@radix-ui/*`
- `tailwindcss`
- `class-variance-authority`
- `wouter`
- `date-fns`

**Backend:**
- `express`
- `drizzle-orm`
- `@neondatabase/serverless`
- `multer`
- `csv-parse`
- `zod`

**Development:**
- `vite`
- `typescript`
- `tsx`
- `esbuild`
- `drizzle-kit`

### Design Assets
- Custom font: FKGroteskNeue
- Monospace font: Berkeley Mono
- Platform colors: Uber Green, DoorDash Red, Grubhub Orange
- 8-color chart palette for data visualization