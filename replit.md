# Spicy Data Multi-Platform Delivery Analytics Dashboard

## Overview
This project is a multi-tenant data analytics dashboard designed for restaurant chains to monitor and optimize performance across various third-party delivery platforms (Uber Eats, DoorDash, Grubhub). It processes CSV payment data to provide insights into sales performance, marketing ROI, location-specific analytics, and cross-platform location matching. The goal is to deliver granular data to enhance profitability and market understanding for digital storefronts.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology**: React 18+, TypeScript, Vite, Wouter for routing, TanStack Query for state management.
- **UI/UX**: `shadcn/ui` (Radix UI) with Tailwind CSS, custom "New York" design system, data-dense layout, custom color palette (teal brand, light/dark modes), responsive for data visualization.
- **Components**: Modular structure with shared components and dedicated pages (Dashboard, Campaigns, Upload, Locations, Admin, Income Statement), featuring sidebar navigation.
- **Filtering**: Comprehensive filtering by week, client, location, platform, and location tags.
- **Pages**:
    - **Dashboard**: Overview with key metrics and aggregated cross-platform location performance.
    - **Campaigns**: Combined and segmented metrics for promotions and paid advertising (ROAS, True Cost Per Order, Marketing AOV, Net Profit Per Order).
    - **Income Statement**: Comprehensive financial breakdown by platform with detailed P&L metrics and CSV export.

### Backend
- **Technology**: Express.js with TypeScript, RESTful API.
- **Data Processing**: CSV parsing with platform-specific logic for Uber Eats, DoorDash, and Grubhub, including transaction validation, data normalization, and string similarity for location reconciliation. Handles platform-specific transaction statuses for accurate calculations.
- **API Endpoints**: Manages clients, locations, file uploads (transaction & marketing data), analytics, promotions, and paid ads, supporting multi-dimensional filtering.

### Data Model
- **Core Entities**: Clients, Locations, Transactions, Promotions, Paid Ad Campaigns, Campaign Location Metrics.
- **Location Matching**: Uses a canonical name with platform-specific name mappings, fuzzy string matching, and a tagging system.
- **Analytics**: Calculates ROAS, net payout percentages, AOV, and aggregations at platform/location levels, supporting multi-dimensional filtering and graceful null value handling.

### Authentication & Authorization
- **Technology**: Replit Auth (OIDC) with `express-session` and `connect-pg-simple`.
- **User Roles**: Three-tier role system (user, brand_admin, super_admin) with role-based middleware.
- **Security**: Session regeneration on login, `sameSite='lax'` cookies, `httpOnly` secure cookies, 1-week TTL with PostgreSQL session store.
- **User Management**: Automatic user upsert on OIDC login.
- **Route Protection**: All API routes protected with `isAuthenticated` middleware; admin routes use `isBrandAdmin`/`isSuperAdmin` middleware.

### Database
- **Design**: Drizzle ORM with PostgreSQL dialect, Zod schemas for validation.
- **Current State**: Using DbStorage (Neon PostgreSQL) with sessions table for authentication.
- **Tables**: users, sessions, clients, locations, transactions (Uber Eats, DoorDash, Grubhub), promotions, paid ad campaigns, campaign location metrics, location weekly financials.

### File Upload Processing
- **Transaction Data Upload**: Supports CSV upload by platform and client. Server-side parsing, validation, and transaction creation. Location matching uses a master sheet; unmapped transactions are assigned to an "Unmapped Locations" bucket. Duplicate prevention uses upsert logic with platform-specific unique constraints (e.g., `workflowId` for Uber Eats, `(clientId, transactionId)` for DoorDash and Grubhub).
- **DoorDash Storefront Filtering**: **CRITICAL** - Upload route filters out all DoorDash Storefront channel transactions during CSV processing. Only Marketplace orders are saved to the database. This ensures all analytics reflect Marketplace-only performance.
- **Marketing Data Upload**: Supports platform and data type selection, fuzzy location matching, and deduplication for campaign records and location metrics.
- **Uber Eats Mapping Fix**: Extracts store codes from "Capriotti's Sandwich Shop (STORECODE)" format and matches against `ubereats_store_label` field in locations table.
- **Grubhub Mapping Fix**: Uses `store_number` as primary matching key instead of generic restaurant names to prevent location collapse.

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

## Data Quality Status (As of Oct 22, 2025)

### Overall Transaction Coverage
- **Total Transactions**: 313,567 across all platforms
- **Mapped Transactions**: 168,897 (53.9%)
- **Unmapped Transactions**: 144,670 (46.1%)

### Platform-Specific Mapping Rates
| Platform | Total | Mapped | Unmapped | Rate |
|----------|-------|--------|----------|------|
| Uber Eats | 186,363 | 43,404 | 142,959 | 23.3% ⚠️ |
| DoorDash | 116,245 | 116,244 | 1 | 100.0% ✅ |
| Grubhub | 10,959 | 9,249 | 1,710 | 84.4% ✅ |

### Location Coverage
- **Total Locations**: 445 in database
- **With Uber Eats Data**: 132 locations (29.7%)
- **With DoorDash Data**: 303 locations (68.1%)
- **With Grubhub Data**: 150 locations (33.7%)
- **All 3 Platforms**: 124 locations (27.9%)

### Date Ranges
- **DoorDash**: Aug 25 - Oct 19, 2025 (56 days)
- **Grubhub**: Aug 25 - Oct 19, 2025 (49 days)
- **Uber Eats**: Sept 1 - Oct 19, 2025 (62 unique dates)

### Known Data Quality Issues
1. **Uber Eats**: 141,367 transactions with blank location fields (cannot be mapped without source CSVs)
2. **Uber Eats**: 1,592 transactions with unrecognized store codes (FL100238, CA425, TX444, etc.)
3. **Grubhub**: 1,710 transactions with generic names missing store_number field
4. **DoorDash**: Excellent data quality (99.999% mapping success)

### Recent Fixes (Oct 22, 2025)
- ✅ Fixed Uber Eats location extraction to parse store codes from parentheses format
- ✅ Fixed Grubhub upload to use store_number instead of restaurant name for matching
- ✅ Successfully mapped 23,400 previously unmapped Uber Eats transactions
- ✅ Week 9/8 corporate locations data complete (27,348 transactions, 100% mapping)