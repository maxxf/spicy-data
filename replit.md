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
  - Implemented master location system: **279 master locations** (tagged with `location_tag='master'`) appear in dropdowns
    - **160 verified master locations**: Full format "Caps - STORECODE LocationName" (e.g., "Caps - NV008 Las Vegas Sahara") with `is_verified=true`
    - **119 unverified master locations**: Legacy DoorDash names (e.g., "Caps - North Union St") still containing 70,369 DoorDash transactions with `is_verified=false`
  - **Transaction Consolidation History**:
    - **Phase 1**: Migrated 22,877 transactions (21,696 Uber Eats + 1,181 Grubhub) from 119 duplicate code-only locations to their matching master locations
    - **Phase 2**: Pattern-matched 46 legacy DoorDash locations to verified masters, migrating 23,142 DoorDash transactions and removing master tag from 44 empty legacy locations
  - **DoorDash Coverage**: 45,706 transactions on verified masters + 70,369 on unverified masters + 169 in unmapped bucket = 116,244/116,245 total (99.9%)
  - **CRITICAL DATA QUALITY ISSUE**: 
    - **142,213 Uber Eats transactions (79.6%)** have NULL location_id - invisible in analytics
    - **258 Grubhub transactions (2.1%)** have NULL location_id - invisible in analytics
    - These unmapped transactions represent significant missing revenue data requiring location mapping fixes
  - Dropdown filtering: `LocationSelector` shows only locations where `locationTag === "master"` (279 total: 160 verified + 119 unverified)
  - 165 non-master locations hidden from dropdowns (migrated/empty locations) but retained for data integrity

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