# Spice Digital Multi-Platform Delivery Analytics Dashboard

## Overview
This project is a multi-tenant data analytics dashboard for restaurant chains, enabling them to monitor and optimize performance across various third-party delivery platforms (Uber Eats, DoorDash, Grubhub). It processes CSV payment data to provide insights into sales performance, marketing ROI, location-specific analytics, and cross-platform location matching. The vision is to offer granular data to enhance profitability and market understanding for digital storefronts.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology**: React 18+, TypeScript, Vite, Wouter for routing, TanStack Query for state management.
- **UI/UX**: `shadcn/ui` (Radix UI) with Tailwind CSS, custom "New York" design system, data-dense layout, custom color palette (teal brand, light/dark modes), responsive for data visualization.
- **Components**: Modular structure with shared components (e.g., MetricCard, DataTable, PlatformBadge), dedicated pages (Dashboard, Campaigns, Upload, Locations, Admin, Income Statement), sidebar navigation.
- **Default Client**: Capriotti's (ID: `83506705-b408-4f0a-a9b0-e5b585db3b7d`) is automatically selected as the default client across all pages (Dashboard, Campaigns, Locations, Upload, Admin, Income Statement).
- **Filtering**: Comprehensive filtering by week, client, location, platform (Uber Eats, DoorDash, Grubhub), and location tags. Week selection is page-specific.
- **Campaigns Page**: Displays combined and segmented metrics for promotions and paid advertising, including ROAS, True Cost Per Order, Marketing AOV, and Net Profit Per Order, with transparent cost breakdowns.
- **Income Statement Page**: Comprehensive financial breakdown by platform showing detailed P&L metrics including sales, commissions, marketing spend breakdown, taxes, refunds, and net margin calculations with CSV export capability.

### Backend
- **Technology**: Express.js with TypeScript, RESTful API.
- **Data Processing**:
    - CSV parsing (`csv-parse`) with platform-specific logic for Uber Eats, DoorDash, and Grubhub.
    - Transaction validation, data normalization, and string similarity for location reconciliation.
    - **Platform-Specific Transaction Status Handling**:
        - **Uber Eats**: All transactions from CSV exports are counted as completed.
        - **DoorDash**: Filters for Marketplace channel and 'Completed' status (Delivered/Picked Up) for sales; Marketing Investment includes Ad Spend and Offer Value; Net Payout sums all order statuses for Marketplace.
        - **Grubhub**: Sales/Orders count `transaction_type = "Prepaid Order"`; Net Payout includes all transaction types for finance reconciliation. `saleAmount` calculated from `subtotal` and `subtotalSalesTax`.
- **API Endpoints**: Manages clients, locations, file uploads (transaction & marketing data), analytics (weeks, platform, location, client metrics), promotions, and paid ads. Supports multi-dimensional filtering.

### Data Model
- **Core Entities**: Clients, Locations, Transactions, Promotions, Paid Ad Campaigns, Campaign Location Metrics.
- **Location Matching**: Uses a canonical name with platform-specific name mappings. Employs fuzzy string matching for suggestions and a location tagging system.
- **Analytics**: Calculates ROAS, net payout percentages, AOV, and aggregations at platform/location levels, all supporting multi-dimensional filtering. Handles null values gracefully.

### Database
- **Design**: Drizzle ORM with PostgreSQL dialect, Zod schemas for validation.
- **Current State**: In-memory storage for development, configured for future migration to Neon Database (PostgreSQL). `IStorage` interface for implementation swapping.

### File Upload Processing
- **Transaction Data Upload**:
    - CSV upload identifies platform and client. Server-side parsing, validation, and transaction creation.
    - **Location Matching**: Uses a master sheet for canonical IDs and platform-specific keys.
        - **DoorDash**: Matches `merchant_store_id` (CSV) to `doorDashStoreKey` (master sheet) with numeric ID fallback and store name matching for edge cases.
        - **Uber Eats**: Extracts code from `Store Name` (CSV) to match `uberEatsStoreLabel` (master sheet).
        - **Grubhub**: Exact match of `street_address` (CSV) to `address` (master sheet).
    - **Unmapped Locations**: Transactions failing to match are assigned to a special "Unmapped Locations" bucket per client; no new locations are auto-created. Hardcoded mappings handle specific DoorDash store name edge cases.
- **Performance**: Batch optimization for high-volume imports using location caching and batch inserts with upsert logic for deduplication.
- **Marketing Data Upload**: Supports platform and data type selection. Uses fuzzy location matching and deduplication for campaign records and location metrics. Creates/updates promotion or paid ad campaigns and their location-level metrics.

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting (configured, but in-memory used for dev).
- **Replit**: Development and deployment platform.

### Key NPM Packages
- **Frontend**: `@tanstack/react-query`, `@radix-ui/*`, `tailwindcss`, `class-variance-authority`, `wouter`, `date-fns`.
- **Backend**: `express`, `drizzle-orm`, `@neondatabase/serverless`, `multer`, `csv-parse`, `zod`.
- **Development**: `vite`, `typescript`, `tsx`, `esbuild`, `drizzle-kit`.

### Design Assets
- Custom fonts: FKGroteskNeue, Berkeley Mono.
- Platform-specific brand colors (Uber Green, DoorDash Red, Grubhub Orange).
- 8-color chart palette.

## Recent Changes

### October 20, 2025 - Transaction Deletion & Data Re-import
- **New Deletion Capabilities**: Added transaction deletion methods to storage layer
  - Methods: `deleteUberEatsTransactionsByDateRange()`, `deleteDoordashTransactionsByDateRange()`, `deleteGrubhubTransactionsByDateRange()`
  - Implemented in both MemStorage and DbStorage classes with proper IStorage interface
  - API Endpoint: `DELETE /api/transactions/:platform/:clientId?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
  - Platform-specific column handling: UberEats uses `date`, DoorDash uses `transaction_date`, Grubhub uses `order_date`
  - Deletion scripts: `scripts/delete-all-week-9-29.ts`, `scripts/test-deletion.ts`
- **Week 9/29 Data Re-import**: Successfully deleted and re-imported clean data for Sept 29 - Oct 5, 2025
  - Deleted 19,874 DoorDash transactions from previous import
  - Re-imported fresh data: 7,525 UberEats, 19,874 DoorDash, 1,498 Grubhub transactions
  - Total week 9/29: 25,162 transactions, $841,133.51 sales (excl. tax), $24,192.07 marketing spend
  - Import script: `scripts/import-week-9-29.ts`
  - Verification script: `scripts/verify-import.ts`

### October 20, 2025 - Income Statement Page
- **Implementation**: Created comprehensive financial breakdown page showing P&L metrics by platform
  - Endpoint: `GET /api/analytics/income-statement?clientId=<id>&startDate=<date>&endDate=<date>`
  - Aggregates transaction data across Uber Eats, DoorDash, and Grubhub
  - Real-time calculation from transaction data (no pre-computed tables)
- **Metrics Displayed** (28 line items):
  - Revenue: Number of Transactions, Sales (Incl/Excl Tax), Unfulfilled Sales/Refunds
  - Taxes: Taxes, Taxes Withheld, Taxes Backup (Uber Eats specific)
  - Costs: Commissions, Restaurant Delivery Charge
  - Marketing: Total Marketing, Loyalty, Ad Spend, Promo Spend, DoorDash Marketing Fee, Merchant Funded Discount, 3P Funded Discount
  - Refunds: Customer Refunds, Won Disputes
  - Other: Customer Tip, Restaurant Fees, Miscellaneous, Unaccounted
  - Bottom Line: Net Payout, Cost of Goods Sold (46%), Net Margin
- **Features**:
  - Side-by-side comparison of all three platforms plus total column
  - Percentage of Sales Incl. Tax shown for each metric
  - Tooltips for complex metrics (Taxes Backup, DoorDash Marketing Fee, discounts)
  - CSV export functionality with formatted data
  - Hierarchical display with indented sub-metrics
  - Highlighted rows for key metrics (Sales, Commissions, Marketing, Net Payout, Net Margin)
  - Negative values displayed in red
- **Platform-Specific Calculations**:
  - Follows existing transaction filtering rules (Marketplace for DD, Prepaid for Grub, all for UE)
  - Maps transaction fields to standardized metric categories
  - Handles platform differences (e.g., Uber Eats tax handling, DoorDash marketing fees)

### October 20, 2025 - Test Locations (Corp Locations) Weekly Financial Report
- **Implementation**: Built live-calculated financial report for 16 designated corp locations
  - Endpoint: `GET /api/analytics/test-locations-report`
  - Calculates metrics directly from transaction data (Uber Eats, DoorDash, Grubhub)
  - No pre-computed tables required - always reflects latest transaction data
- **Metrics Calculated**:
  - Sales (excl. tax)
  - Marketing Sales
  - Marketing Spend
  - Marketing % (marketing spend / marketing sales)
  - ROAS (marketing sales / marketing spend)
  - Payout $ (net payout)
  - Payout % (payout / sales)
  - Payout with COGS (payout - sales * 46%)
- **Features**:
  - Auto-aggregates by location and week (Monday-Sunday)
  - Flexible week-range selection (4, 6, 8, 12 weeks, or all available)
  - CSV export with formatted currency and percentages
  - Accessible via Locations page → "Test Locations Report" tab
  - **Data Quality Alerts**: Automatically detects and displays potential issues:
    - Missing weeks (incomplete data uploads)
    - Zero sales with positive payout (refunds/adjustments)
    - Unusually high ROAS >20x (incomplete marketing data)
    - Negative payout after 46% COGS (unprofitable locations)
    - Low payout percentage <30% (high platform fees)
    - Marketing spend exceeding marketing sales (ROAS <1)
- **Corp Locations** (16 stores):
  - AZ900482, NV008, NV036, NV051, NV054, NV067, NV079, NV103, NV111, NV121, NV126, NV151, NV152, NV191, NV900467, NV900478