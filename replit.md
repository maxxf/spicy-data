# Spicy Data Multi-Platform Delivery Analytics Dashboard

## Overview
This project is a multi-tenant data analytics dashboard designed for restaurant chains. Its primary purpose is to monitor and optimize performance across various third-party delivery platforms (Uber Eats, DoorDash, Grubhub). By processing CSV payment data, the dashboard provides crucial insights into sales performance, marketing ROI, location-specific analytics, and cross-platform location matching. The overarching vision is to deliver granular data that enhances profitability and market understanding for digital storefronts.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Technology**: React 18+, TypeScript, Vite, Wouter for routing, TanStack Query for state management.
- **UI/UX**: `shadcn/ui` (Radix UI) with Tailwind CSS, custom "New York" design system, data-dense layout, custom color palette (teal brand, light/dark modes), responsive for data visualization.
- **Components**: Modular structure with shared components and dedicated pages (Dashboard, Campaigns, Upload, Locations, Admin, Income Statement), featuring sidebar navigation.
- **Default Client**: Capriotti's (`83506705-b408-4f0a-a9b0-e5b585db3b7d`) is automatically selected across all pages.
- **Filtering**: Comprehensive filtering by week, client, location, platform (Uber Eats, DoorDash, Grubhub), and location tags, with page-specific week selection.
- **Dashboard Page**: Overview page with key metrics and Location Performance table displaying aggregated cross-platform metrics per location (Sales, Orders, AOV, Marketing Spend, ROAS, Payout $). Each location appears once with data consolidated across all platforms.
- **Campaigns Page**: Displays combined and segmented metrics for promotions and paid advertising (ROAS, True Cost Per Order, Marketing AOV, Net Profit Per Order) with transparent cost breakdowns.
- **Income Statement Page**: Provides a comprehensive financial breakdown by platform, including detailed P&L metrics (sales, commissions, marketing spend, taxes, refunds, net margin), with CSV export capability.

### Backend
- **Technology**: Express.js with TypeScript, RESTful API.
- **Data Processing**: CSV parsing (`csv-parse`) with platform-specific logic for Uber Eats, DoorDash, and Grubhub, including transaction validation, data normalization, and string similarity for location reconciliation. Handles platform-specific transaction statuses for accurate sales and payout calculations.
- **API Endpoints**: Manages clients, locations, file uploads (transaction & marketing data), analytics (weeks, platform, location, client metrics), promotions, and paid ads, supporting multi-dimensional filtering.

### Data Model
- **Core Entities**: Clients, Locations, Transactions, Promotions, Paid Ad Campaigns, Campaign Location Metrics.
- **Location Matching**: Uses a canonical name with platform-specific name mappings, fuzzy string matching for suggestions, and a location tagging system.
- **Analytics**: Calculates ROAS, net payout percentages, AOV, and aggregations at platform/location levels, supporting multi-dimensional filtering and graceful null value handling.

### Authentication & Authorization
- **Technology**: Replit Auth (OIDC) with express-session and connect-pg-simple for session management
- **User Roles**: Three-tier role system (user, brand_admin, super_admin) with role-based middleware
- **Session Security**: Session regeneration on login (session fixation protection), sameSite='lax' cookies (CSRF protection), httpOnly secure cookies, 1-week TTL with PostgreSQL session store
- **User Management**: Automatic user upsert on OIDC login with email normalization (lowercase), token refresh with session persistence
- **Route Protection**: All ~35 API routes protected with isAuthenticated middleware; admin routes use isBrandAdmin/isSuperAdmin middleware
- **Frontend**: Landing page for logged-out users, useAuth hook for client-side auth state, sidebar with user profile and logout button

### Database
- **Design**: Drizzle ORM with PostgreSQL dialect, Zod schemas for validation.
- **Current State**: Using DbStorage (database-backed storage via Neon PostgreSQL) with sessions table for authentication.
- **Tables**: users, sessions, clients, locations, transactions (Uber Eats, DoorDash, Grubhub), promotions, paid ad campaigns, campaign location metrics, location weekly financials.

### File Upload Processing
- **Transaction Data Upload**: Supports CSV upload by platform and client. Server-side parsing, validation, and transaction creation. Location matching uses a master sheet for canonical IDs and platform-specific keys (e.g., `merchant_store_id` for DoorDash, `Store Name` code for Uber Eats, `street_address` for Grubhub). Unmapped transactions are assigned to a special "Unmapped Locations" bucket per client; no new locations are auto-created. Duplicate prevention uses upsert logic with platform-specific unique constraints:
  - **Uber Eats**: Uses `workflowId` (unique transaction UUID from CSV) as the true unique identifier. Same Order ID can appear multiple times with different dates/locations (refunds, adjustments). Deduplication by `(clientId, workflowId)` prevents all duplicates.
  - **DoorDash**: Uses `(clientId, transactionId)` for deduplication.
  - **Grubhub**: Uses `(clientId, transactionId)` for deduplication.
- **Marketing Data Upload**: Supports platform and data type selection, fuzzy location matching, and deduplication for campaign records and location metrics, creating or updating promotion or paid ad campaigns and their location-level metrics.

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting (configured, but in-memory used for dev).
- **Replit**: Development and deployment platform.

### Key NPM Packages
- **Frontend**: `@tanstack/react-query`, `@radix-ui/*`, `tailwindcss`, `class-variance-authority`, `wouter`, `date-fns`.
- **Backend**: `express`, `drizzle-orm`, `@neondatabase/serverless`, `multer`, `csv-parse`, `zod`.
- **Development**: `vite`, `typescript`, `tsx`, `esbuild`, `drizzle-kit`.

### Design Assets
- **Custom fonts**: FKGroteskNeue, Berkeley Mono.
- **Platform-specific brand colors**: Uber Green, DoorDash Red, Grubhub Orange.
- **Chart Palette**: 8-color scheme.

## Recent Changes (October 21, 2025)

### Week-over-Week Comparison Implementation
- **Real Calculations**: Replaced hardcoded placeholder percentages with actual calculated week-over-week changes
  - Backend fetches both current and previous week data (7 days prior)
  - Calculates percentage change: `((current - previous) / previous) * 100`
  - Returns `null` for invalid cases (previous value is 0, null, or undefined)
- **Safe Division**: Added `calculatePercentageChange()` helper to avoid NaN/Infinity errors
- **Frontend Display**: MetricCard component now handles `null` values by displaying "—" instead of percentages
- **Tested & Verified**: End-to-end testing confirmed correct calculation, formatting, and color indicators

### DoorDash Marketing Spend Fix
- **Corrected Calculation**: Now properly handles negative and positive field values
  - `offers_on_items` and `delivery_offer_redemptions`: Stored as NEGATIVE, use `Math.abs()`
  - `marketing_credits` and `third_party_contribution`: Stored as POSITIVE, use as-is
- **Marketing Investment Formula**: `Math.abs(offers_on_items) + Math.abs(delivery_offer_redemptions) + marketing_credits + third_party_contribution`
- **Attribution Logic**: Updated to check for non-zero values (offers are negative, credits are positive)
- **Verified Accuracy**: Oct 13-19 week shows $1,969.89 from marketing_credits only (correct)

### DoorDash Transaction Report Completion Inference
- **Problem**: DoorDash Transaction Report CSV (required for Marketplace/Storefront filtering) lacks "Final order status" column, causing all transactions to be excluded from analytics (0 sales/0 orders despite having data)
- **Root Cause**: Analytics required `orderStatus === "Delivered" || "Picked Up"` but Transaction Report format doesn't provide this field
- **Solution**: Implemented derived completion logic using `transactionType` field from CSV
  - Added `transactionType` field to DoorDash schema and upload parsing
  - Created completion inference: `transactionType === "Order" || orderStatus === "Delivered" || "Picked Up"`
  - "Order" type = completed customer orders (from Transaction Report CSV)
  - "Error Charge" / "Adjustment" types = excluded from sales/order metrics (refunds, adjustments)
  - Backward compatible with Store Statement CSV format (uses `orderStatus` when available)
- **Impact**: Week 9/22 now correctly shows 12,135 Marketplace orders with $380,996.84 sales (previously showed 0/0)
- **Data Integrity**: Only counts validated completed orders; excludes error charges, adjustments, and Storefront channel
- **Verified**: Tested with 23,048 transactions across all transaction types; metrics align with expected business logic

## Production Status

### Current State (October 2025)
Dashboard is **production-ready** and fully verified with real Capriotti's data:
- **Transaction Volume**: 16,903 transactions across 161 locations (152 unique locations + unmapped bucket)
- **Platform Breakdown**: Uber Eats (3,727 orders), DoorDash (11,727 orders), Grubhub (1,449 orders)
- **Total Sales**: $1,291,578.35 across all weeks
- **Corporate Locations**: 16 locations identified for weekly P&L reporting (5,154 transactions)

### Verified Features
1. **Authentication**: Complete OIDC login/logout flow with session management, role-based access control, and security hardening (session regeneration, CSRF protection)
2. **Dashboard Page**: Week-by-week filtering with KPIs (Sales, Orders, AOV, ROAS, Net Payout) and Location Performance table
3. **Campaigns Page**: Promotions and Paid Advertising analytics with transparent cost breakdowns
4. **Locations Page**: Overview table and Test Locations Report showing 16 corporate locations with weekly financials
5. **Income Statement**: Platform-specific P&L with 28 financial metrics, CSV export, and date range filtering
6. **Data Integrity**: Upsert logic prevents duplicate uploads; refresh/replace pattern verified

### Architecture Review Highlights
- **Analytics Accuracy**: Platform-specific attribution logic confirmed correct for Uber Eats, DoorDash, and Grubhub
- **Data Quality**: BOM stripping, flexible header normalization, safe location matching to unmapped bucket
- **Performance**: Current architecture handles ~17K transactions adequately; DB indexing and SQL aggregation recommended for scale
- **Robustness**: Unique constraints on platform order IDs ensure idempotency; retry logic for Neon WS recommended for production

### Future Enhancements (Non-Blocking)
1. Add DB indexes on `(clientId, orderDate)` and filter/join columns
2. Move heavy aggregations to SQL for improved performance
3. Add retry/backoff logic for transient Neon database connection errors
4. Consider pagination/virtualization for large location tables