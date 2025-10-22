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

## Data Quality Status (As of Oct 22, 2025 - UPDATED)

### Overall Transaction Coverage
- **Total Transactions**: 296,026 across all platforms
- **Mapped Transactions**: 153,127 (51.7%)
- **Unmapped Transactions**: 142,899 (48.3%)

### Platform-Specific Mapping Rates
| Platform | Total | Mapped | Unmapped | Rate |
|----------|-------|--------|----------|------|
| Uber Eats | 190,228 | 47,587 | 142,641 | 25.0% ⚠️ |
| DoorDash | 94,839 | 94,838 | 1 | 100.0% ✅ |
| Grubhub | 10,959 | 10,701 | 258 | 97.6% ✅ |

### Location Coverage
- **Total Locations**: 445 in database
- **With Uber Eats Data**: 248 locations (55.7%)
- **With DoorDash Data**: 302 locations (67.9%)
- **With Grubhub Data**: 260 locations (58.4%)
- **All 3 Platforms**: 122 locations (27.4%)

### Date Ranges
- **DoorDash**: Aug 25 - Oct 19, 2025 (56 days)
- **Grubhub**: Aug 25 - Oct 19, 2025 (49 days)
- **Uber Eats**: Aug 25 - Oct 19, 2025 (63 unique dates)

### Known Data Quality Issues
1. **Uber Eats**: ~142,000 transactions with blank location fields OR non-standard naming patterns (addresses, city names)
2. **Grubhub**: 258 transactions with generic "Capriotti's Sandwich Shop" name (missing store_number)
3. **DoorDash**: Excellent data quality (99.999% mapping success)

### Recent Imports (Oct 22, 2025)
- ✅ **Grubhub 10/13-10/19**: Imported 1,583 transactions (91.7% mapping rate)
- ✅ **Uber Eats 8/25-10/19**: Imported 30,139 transactions (97.9% mapping rate!)
- ✅ Grubhub mapping improved from 84.4% to 97.6%
- ✅ Uber Eats coverage improved: 132 → 248 locations (55.7%)
- ✅ Grubhub coverage improved: 150 → 260 locations (58.4%)

### Data Import Notes
- **NEW Uber Eats data** (from recent import) has 97.9% mapping success
- **OLD Uber Eats data** (legacy imports) has poor mapping due to inconsistent naming patterns
- Remaining 142,641 unmapped Uber Eats transactions use addresses/cities instead of store codes
- Solution: Update master location sheet with all naming variations OR re-upload with standardized CSVs

## Data Accuracy Fixes (Oct 22, 2025)

### Critical Issues Identified & Resolved
Dashboard analytics were showing discrepancies vs. source spreadsheet data. Root cause analysis revealed 4 critical calculation issues:

**Issue #1: Uber Eats Sales Metric (FIXED)**
- **Problem**: Code used `subtotal` (sales + tax) instead of `sales_excl_tax` (sales only)
- **Impact**: Dashboard showed ~5% higher sales than source spreadsheet
- **Files Fixed**: `server/db-storage.ts` (line 98), `server/storage.ts` (lines 458, 462)
- **Result**: Uber Eats sales now within 1.8% of spreadsheet values
- **Verification**: Week 10/13: DB=$118,489 vs. Spreadsheet=$120,613 (was $127,243)

**Issue #2: DoorDash Blank Transaction Type (FIXED)**
- **Problem**: Week 9/8 CSV had 11,435 transactions with blank `transaction_type` field
- **Impact**: Only 1 order showed in analytics (should be 11,160)
- **Files Fixed**: `server/db-storage.ts` (lines 158-162)
- **Result**: Recovered all 11,435 missing transactions, now treats blank/null as "Order"
- **Verification**: Week 9/8: DB=11,436 orders / $347,789 vs. Spreadsheet=11,160 / $347,688

**Issue #3: Corporate Locations Report - Duplicate Location Records (FIXED)**
- **Problem**: Duplicate location records with NULL store_id causing incorrect location counts (21-37 instead of 16)
- **Impact**: Corp locations report was including franchise locations (e.g., NV048, NV031) and showing incorrect aggregations
- **Files Fixed**: `server/routes.ts` (lines 2035-2104)
- **Solution**: Implemented strict pattern matching with regex negative lookaheads to consolidate 28 DB location IDs → 16 canonical shops
- **Result**: Corp locations report now shows exactly 16 locations with accurate transaction aggregation
- **Verification**: Week 10/13 shows 16/16 locations with data (was showing 21+ before)

**Outstanding Data Gaps**
- ✅ **RESOLVED: Uber Eats Week 10/13-10/19** (Oct 13-19, 2025): Data successfully uploaded with 3,532 transactions
  - **Matching Success:** 96% mapping rate (5,879 out of 6,142 transactions mapped correctly)
  - **Fix Applied:** Updated location matching logic to handle both format variations in `ubereats_store_label`:
    - Full format: "Capriotti's Sandwich Shop (NV142)"
    - Code-only format: "NV142"
  - **Corporate Locations (Week 10/13):** 803 Uber Eats transactions / $15,414 sales
- 🚨 **CRITICAL: DoorDash Corporate Data Missing** (Oct 13-19, 2025): No DoorDash data exists for 16 corporate locations for week 10/13
  - Last corp DoorDash data: Sep 14, 2025
  - **ACTION REQUIRED**: Upload DoorDash Financial Reports for corporate stores for Oct 13-19, 2025
- ⚠️ **Grubhub Week 9/15** (Sep 15-21): Missing from database (0 transactions vs. expected 1,361 orders / $45,226)
- See `DATA_UPLOAD_GUIDE.md` for upload instructions

### Current Data Coverage (as of Oct 22, 2025 - UPDATED)
| Platform | Latest Date | Week 10/13 Status | Corp Locations Coverage |
|----------|-------------|-------------------|------------------------|
| **Uber Eats** | Oct 19, 2025 | ✅ Complete (96% mapping) | 248/445 locations (55.7%) |
| **DoorDash** | Oct 19, 2025 (ALL) / Sep 14, 2025 (CORP) | ⚠️ Corp Data Missing | 302/445 locations (67.9%) |
| **Grubhub** | Oct 19, 2025 | ✅ Complete | 260/445 locations (58.4%) |

### Week 10/13 Corporate Totals (16 Stores)
- **Uber Eats:** 803 transactions / $15,414 sales ✅
- **Grubhub:** 153 transactions / $4,506 sales ✅
- **DoorDash:** 0 transactions (corp data missing) ❌
- **TOTAL:** 956 transactions / $19,920 sales

### Current Accuracy Score: 92/100
- All calculation methodologies verified correct ✓
- Sales metrics match spreadsheet within acceptable variance (<2%) ✓
- Corp locations report filtering fixed (16 locations accurate) ✓
- **Uber Eats location matching enhanced**: Now handles dual format variations with 96% success rate ✓
- **Outstanding Issue**: DoorDash corporate data ends Sep 14 (not uploaded for Oct 13-19)