# Spicy Data Multi-Platform Delivery Analytics Dashboard

## Overview
This project is a multi-tenant data analytics dashboard for restaurant chains, designed to monitor and optimize performance across various third-party delivery platforms (Uber Eats, DoorDash, Grubhub). It processes CSV payment data to provide insights into sales performance, marketing ROI, location-specific analytics, and cross-platform location matching. The primary goal is to deliver granular data to enhance profitability and market understanding for digital storefronts.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology**: React 18+, TypeScript, Vite, Wouter for routing, TanStack Query for state management.
- **UI/UX**: `shadcn/ui` (Radix UI) with Tailwind CSS, custom "New York" design system, data-dense layout, custom color palette (teal brand, light/dark modes), responsive for data visualization.
- **Components**: Modular structure with shared components and dedicated pages (Dashboard, Campaigns, Upload, Locations, Admin, Income Statement), featuring sidebar navigation.
- **Filtering**: Comprehensive filtering by week, client, location, platform, and location tags.
- **Key Pages**: Dashboard (overview), Campaigns (promotions/ads metrics), Income Statement (financial breakdown with CSV export).

### Backend
- **Technology**: Express.js with TypeScript, RESTful API.
- **Data Processing**: CSV parsing with platform-specific logic for Uber Eats, DoorDash, and Grubhub, including transaction validation, data normalization, and string similarity for location reconciliation. Handles platform-specific transaction statuses.
- **API Endpoints**: Manages clients, locations, file uploads (transaction & marketing data), analytics, promotions, and paid ads, supporting multi-dimensional filtering.
- **Performance Optimizations (October 23, 2025)**:
  - **Memory Management**: Replaced array `.length` calls with SQL `COUNT(*)` aggregations to prevent loading 100K+ transactions into memory. Diagnostic endpoint now uses `getTransactionCounts()` method.
  - **Week Calculation**: Rewrote `getAvailableWeeks()` to use SQL `DATE_TRUNC` with database-level aggregation instead of loading all transactions. Reduced execution time from 66.5s (crash) to 2.6s (25x faster).
  - **Date Validation**: Added multi-layer validation for Uber Eats M/D/YY format with regex patterns, two-digit year normalization (25→2025), SQL year ≥ 2020 filtering, and JavaScript safety filter (2020-2030) to eliminate phantom dates (e.g., 2000-12-25).
  - **CSV Export**: Fixed RFC 4180 compliance by properly escaping comma-containing values with double quotes.

### Data Model
- **Core Entities**: Clients, Locations, Transactions, Promotions, Paid Ad Campaigns, Campaign Location Metrics.
- **Location Matching**: Uses a canonical name with platform-specific name mappings, fuzzy string matching, and a tagging system.
- **Analytics**: Calculates ROAS, net payout percentages, AOV, and aggregations at platform/location levels, supporting multi-dimensional filtering and graceful null value handling.

### Marketing-Driven Sales Attribution Logic
- **DoorDash**: Order is marketing-driven if ANY of the following are non-zero: `other_payments` (ad spend), `offers_on_items` (item discounts), `delivery_offer_redemptions` (delivery discounts). Formula applies consistently across all 7 calculation locations.
- **Uber Eats**: Order is marketing-driven if it has promotional offers (`offers_on_items < 0` OR `delivery_offer_redemptions < 0`) OR is ad-driven (Other Payments with ad-related description). Sales use `salesExclTax` (primary) with fallback to `subtotal` for legacy data across all SQL and JavaScript calculations.
- **Fixed October 22, 2025**: Comprehensive update across 7 locations in codebase:
  - `getDashboardOverview` SQL (DoorDash & Uber Eats)
  - `getLocationMetrics` SQL (all platforms) + JavaScript date-filtered path
  - `calculateDoorDashMetrics` helper function
  - `calculateUberEatsMetrics` helper function  
  - Corp locations weekly report (DoorDash & Uber Eats)
- **Accuracy**: DoorDash Week 10/13: 1.1% variance (6,729 orders, $223,443). Uber Eats Week 10/13: 1.5% variance (854 orders, $38,237). All historical data automatically corrected via query-level fixes.

### Authentication & Authorization
- **Technology**: Replit Auth (OIDC) with `express-session` and `connect-pg-simple`.
- **User Roles**: Three-tier role system (user, brand_admin, super_admin) with role-based middleware.
- **Security**: Session regeneration on login, `sameSite='lax'` cookies, `httpOnly` secure cookies, 1-week TTL with PostgreSQL session store.
- **User Management**: Automatic user upsert on OIDC login.
- **Route Protection**: All API routes protected; admin routes use role-based middleware.

### Database
- **Design**: Drizzle ORM with PostgreSQL dialect, Zod schemas for validation.
- **Current State**: Using DbStorage (Neon PostgreSQL) with sessions table for authentication.
- **Tables**: users, sessions, clients, locations, transactions (Uber Eats, DoorDash, Grubhub), promotions, paid ad campaigns, campaign location metrics, location weekly financials.
- **Location Name Standardization & Master Location System (October 23, 2025)**: 
  - Standardized all 444 locations to use "Caps - " prefix for client branding
  - Implemented master location system: **194 master locations** (tagged with `location_tag='master'`) appear in dropdowns
    - **160 verified master locations**: Full format "Caps - STORECODE LocationName" (e.g., "Caps - NV008 Las Vegas Sahara") with `is_verified=true`
    - **7 unverified master locations**: Legacy DoorDash names (e.g., "Frisco", "Plantation") containing 2,486 DoorDash transactions with `is_verified=false`
  - **Transaction Consolidation History**:
    - **Phase 1**: Migrated 22,877 transactions (21,696 Uber Eats + 1,181 Grubhub) from 119 duplicate code-only locations to their matching master locations
    - **Phase 2**: Migrated 23,142 DoorDash transactions from 46 legacy locations to verified masters using substring matching
    - **Phase 3**: Migrated 18,657 DoorDash transactions from 26 legacy locations using word-level and single-word unique matching
    - **Phase 4**: Migrated 33,021 DoorDash transactions from 7 legacy locations using fuzzy string similarity (≥0.90 threshold)
    - **Phase 5 (October 23, 2025)**: Created 6 new verified master locations for Uber Eats using web search (FL100238 Land O'Lakes, CA100455 Murrieta, NJ100518 Princeton, CA100467 Rancho Mirage, TX100529 Abilene, NV100530 Las Vegas Southern Highlands), migrated 1,001 unmapped transactions → **Uber Eats 100% mapped (0 unmapped)**
    - **Phase 6 (October 23, 2025)**: Used web search to find addresses for 24 DoorDash unverified masters, migrated 14,615 transactions to verified masters → **DoorDash 96.27% verified (111,907/116,245), reduced unverified from 34 to 10 locations**
    - **Phase 7 (October 23, 2025)**: Used web search to find addresses for 10 remaining unverified masters, matched 3 to existing verified masters (San Luis Obispo→CA200 SLO Foothill, West Flamingo Road→NV023 Las Vegas Decatur, University Ave→IA190 Clive University), migrated 1,682 transactions → **DoorDash 97.72% verified (113,589/116,245), reduced unverified from 10 to 7 locations**
    - **Total**: Migrated 113,995 transactions across all platforms using 6 pattern-matching strategies
  - **Current Platform Coverage**:
    - **Uber Eats**: 36,484 verified (98.00%) + 746 unverified (2.00%) + 0 unmapped = 37,230 total (100% mapped)
    - **DoorDash**: 113,589 verified (97.72%) + 2,486 unverified (2.14%) + 170 unmapped (0.15%) = 116,245 total
    - **Grubhub**: 11,437 verified (91.72%) + 0 unverified + 1,027 unmapped (8.24%) = 12,469 total
  - **Remaining DoorDash Unverified Masters (7 locations, 2,486 txns)**: Collier Pkwy-Lutz (671), Frisco (489), West Avera Dr (471), E Robindale Road (376), South Eastern Ave (226), Plantation (178), Regional Justice Ctr (75)
  - **Unmapped Transactions (Fixed October 23, 2025)**: 
    - **CSV Upload Bug**: Fixed `findOrCreateLocation` function returning empty string instead of unmapped bucket ID (`f534a2cf-12f6-4052-9d3e-d885211183ee`), which caused NULL location_ids
    - **Retroactive Fix**: Updated 142,472 NULL location_id transactions to unmapped bucket
    - **All platforms now have 0 NULL location_ids, 0 duplicates, 0 orphaned transactions** - referential integrity validated
  - Dropdown filtering: `LocationSelector` shows only locations where `locationTag === "master"` (167 total: 160 verified + 7 unverified)
  - 250 non-master locations hidden from dropdowns (migrated/empty locations) but retained for data integrity

### File Upload Processing
- **Transaction Data Upload**: Supports CSV upload by platform and client. Server-side parsing, validation, and transaction creation. Location matching uses a master sheet; unmapped transactions are assigned to an "Unmapped Locations" bucket. Duplicate prevention uses upsert logic with platform-specific unique constraints.
- **DoorDash Storefront Filtering**: Filters out all DoorDash Storefront channel transactions during CSV processing, saving only Marketplace orders.
- **DoorDash Merchant Store ID Mapping**: Uses `doordash_store_key` for location attribution.
- **Marketing Data Upload**: Supports platform and data type selection, fuzzy location matching, and deduplication for campaign records and location metrics.
- **Uber Eats Mapping**: Extracts store codes from "Capriotti's Sandwich Shop (STORECODE)" format and matches against `ubereats_store_label`.
- **Grubhub Mapping**: Uses `store_number` as primary matching key.

### Required CSV Report Types by Platform
- **Uber Eats**: Payment reports.
- **DoorDash**: Financial Report > Transactions Overview.
- **Grubhub**: Transaction reports.

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Replit**: Development and deployment platform.

### Key NPM Packages
- **Frontend**: `@tanstack/react-query`, `@radix-ui/*`, `tailwindcss`, `class-variance-authority`, `wouter`, `date-fns`.
- **Backend**: `express`, `drizzle-orm`, `@neondatabase/serverless`, `multer`, `csv-parse`, `zod`.
- **Development**: `vite`, `typescript`, `tsx`, `esbuild`, `drizzle-kit`.

### Design Assets
- **Custom fonts**: FKGroteskNeue, Berkeley Mono.
- **Platform-specific brand colors**: Uber Green, DoorDash Red, Grubhub Orange.
- **Chart Palette**: 8-color scheme.