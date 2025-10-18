# Spice Digital Multi-Platform Delivery Analytics Dashboard

## Overview

This is a data analytics dashboard for restaurant chains to track performance across third-party delivery platforms (Uber Eats, DoorDash, and Grubhub). The application processes CSV payment data from each platform and provides comprehensive metrics including sales performance, marketing ROI, location-level analytics, and cross-platform location matching.

The system serves multi-tenant use cases where a single instance manages data for multiple restaurant clients, each with multiple locations across different delivery platforms.

## Recent Changes (October 18, 2025)

**Phase 3 - Location Weekly Financials Feature (COMPLETED):**
- **Weekly Financial Summary Table**: New table on Locations page showing weekly financial snapshots per location
- **Schema Addition**: locationWeeklyFinancials table tracking 8 key metrics per location per week:
  - Sales (excl. tax), Marketing Sales, Marketing Spend, Marketing %, ROAS
  - Payout $, Payout %, Payout with COGS (46%)
- **Color-Coded Metrics**: Visual indicators for performance tracking:
  - Marketing %: Yellow background highlighting
  - Payout %: Red (<75%), Orange (75-82%), Yellow (82-86%), Green (≥86%)
- **API Endpoints**: 
  - GET /api/analytics/location-weekly-financials (query by clientId or locationId)
  - POST /api/location-weekly-financials (create weekly financial records)
- **Data Generation**: Script at scripts/generate-weekly-financials.ts populates sample weekly data via API
- **UI Implementation**: Responsive table with location grouping, metric rows, and week columns showing 6 weeks of data

**Phase 2 - Marketing Data Upload System (COMPLETED):**
- **Campaign Tracking**: Added campaignId field to promotions and paidAdCampaigns tables for linking platform campaign identifiers
- **Campaign Location Metrics Table**: New table storing location-level performance data per campaign (impressions, clicks, orders, revenue, spend, ROAS, etc.)
- **CSV Upload Implementation**: Completed marketing data upload for all 4 supported formats:
  - DoorDash Promotions: Promotional campaign performance by store
  - DoorDash Paid Ads: Paid advertising campaign performance by store
  - Uber Campaign Locations: Campaign performance data per location
  - Uber Offers/Campaigns: Offer-based campaign aggregated data
- **Deduplication Logic**:
  - Campaign records deduplicated by campaignId (prevents duplicate campaign creation on re-upload)
  - Location metrics deduplicated by (campaignId, locationId, dateStart) tuple
  - Upsert logic ensures re-uploads update existing metrics instead of duplicating
- **Data Aggregation**: Campaign-level totals automatically calculated from location-level data
- **Location Matching**: Marketing data uses same fuzzy matching algorithm (0.8 threshold) to link store names to canonical locations
- **Upload UI**: Marketing upload section on Upload page with platform selector, data type selector, and file upload zone

**Phase 1 - Read-Only Reporting Dashboard (COMPLETED):**
- **Purpose Clarification**: This is strictly a reporting and insights dashboard (not for campaign/promotion creation)
- **Primary Client**: Capriotti's configured as the main client for data ingestion
- **Client Selection System**: 
  - Added ClientSelector component for switching between portfolio view and client-specific views
  - Default view starts with Capriotti's selected
  - Admin/portfolio view available via "All Clients" option
  - Client filtering implemented across Dashboard, Promotions, and Paid Ads pages via query parameters
- **Read-Only UI Implementation**:
  - Removed ALL mutations (useMutation, apiRequest POST/PATCH/DELETE) from Promotions and Paid Ads pages
  - Removed ALL form components, dialog components, and creation/editing UI from Promotions and Paid Ads
  - Changed empty states to guide users to upload marketing data files
  - Retained "View Details" buttons as read-only navigation actions
  - Removed "Client" columns from Promotions and Paid Ads tables (filtering happens at API query level)
  - Client filtering works via useQuery with clientId parameter passed to backend endpoints
- **Dashboard Client Filtering**:
  - Client Performance Matrix conditionally renders only in portfolio view (when selectedClientId is null/"All Clients")
  - When specific client selected, dashboard shows only that client's metrics
  - All metric cards, charts, and tables respect client filter state
- **Marketing Data Structure**:
  - Promotions table with metrics (impressions, clicks, redemptions, discount, revenue, ROI)
  - Paid Ad Campaigns table with performance metrics (CTR, CPC, conversion rate, spend, revenue, ROAS, CPA)
  - Both tables include platform, status, dates, and client relationships

**Previous Changes (October 17, 2025):**
- Portfolio-level metrics: Portfolio Sales, Active Clients, Portfolio ROAS, Net Payout Rate
- Client Performance Matrix with multi-client comparison bar chart
- Weekly Sales Trend and Platform Distribution charts
- Enhanced MetricCard component with subtitle and trend indicator support

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18+ with TypeScript for type safety and modern React patterns
- Vite as the build tool and development server for fast hot module replacement
- Wouter for lightweight client-side routing
- TanStack Query (React Query) for server state management and caching

**UI Framework:**
- shadcn/ui component library built on Radix UI primitives
- Tailwind CSS for utility-first styling with custom design system
- Design system follows "New York" style with data-dense dashboard patterns
- Custom color palette supporting light/dark modes with teal brand colors
- Responsive layout system optimized for data visualization

**Component Architecture:**
- Modular component structure with shared UI components in `/components/ui`
- Custom business components (MetricCard, DataTable, PlatformBadge, FileUploadZone, ClientSelector)
- Page-based routing with five main views: Dashboard, Upload, Locations, Promotions, Paid Ads
- Sidebar navigation with SidebarProvider context for responsive behavior
- Client filtering: All analytics pages support client-specific views via ClientSelector component

### Backend Architecture

**Server Framework:**
- Express.js server with TypeScript
- In-memory storage implementation (MemStorage class) designed for easy migration to PostgreSQL
- RESTful API design with clear separation of concerns

**Data Processing Pipeline:**
- CSV parsing using csv-parse library
- Platform-specific parsing logic for Uber Eats, DoorDash, and Grubhub data formats
- String similarity matching algorithm for automatic location reconciliation across platforms
- Transaction validation and data normalization before storage

**API Endpoints:**
- `/api/clients` - Client management (GET, POST)
- `/api/locations` - Location management and cross-platform matching (GET, POST)
- `/api/locations/suggestions` - Fuzzy matching suggestions for unlinked locations
- `/api/upload` - CSV file upload with multipart form data handling for transaction data
- `/api/upload/marketing` - Marketing CSV upload with platform/data type detection and campaign creation
- `/api/analytics/overview` - Aggregated platform-level metrics (supports ?clientId filter)
- `/api/analytics/locations` - Location-level performance metrics (supports ?clientId filter)
- `/api/analytics/client-performance` - Multi-client performance comparison
- `/api/analytics/promotions` - Promotional campaign metrics (supports ?clientId filter)
- `/api/analytics/paid-ads` - Paid advertising campaign metrics (supports ?clientId filter)
- `/api/promotions` - Promotion management (GET, POST, PATCH, DELETE)
- `/api/paid-ads` - Paid ad campaign management (GET, POST, PATCH, DELETE)

### Data Model

**Core Entities:**
1. **Clients** - Restaurant brands/chains (Primary: Capriotti's)
2. **Locations** - Physical restaurant locations with platform-specific name mappings
3. **Transactions** - Platform-specific payment/order records (separate tables per platform: uberEatsTransactions, doordashTransactions, grubhubTransactions)
4. **Promotions** - Marketing promotional campaigns with performance metrics and campaignId for platform tracking
5. **Paid Ad Campaigns** - Paid advertising campaigns with performance metrics (impressions, clicks, spend, revenue, ROAS) and campaignId
6. **Campaign Location Metrics** - Location-level performance data for each campaign (links campaigns to specific store locations with detailed metrics)

**Location Matching Strategy:**
- Canonical name serves as the single source of truth
- Platform-specific names (uberEatsName, doordashName, grubhubName) map to canonical location
- Fuzzy string matching algorithm suggests potential matches based on similarity scores
- Manual verification workflow with isVerified flag

**Analytics Calculations:**
- Conservative attribution methodology for marketing vs organic sales
- ROAS (Return on Ad Spend) calculations
- Net payout percentages
- Average Order Value (AOV)
- Platform-level and location-level aggregations

### Database Design (Drizzle ORM)

**Schema Definition:**
- Uses Drizzle ORM with PostgreSQL dialect
- Schema defined in `/shared/schema.ts` for sharing between client and server
- Zod schemas derived from Drizzle tables for runtime validation
- UUID primary keys with automatic generation

**Current State:**
- In-memory storage implementation for development
- Database configuration ready for PostgreSQL via `@neondatabase/serverless`
- Migration system configured with drizzle-kit

**Migration Path:**
- Storage interface (IStorage) allows swapping implementations without code changes
- MemStorage class mirrors the structure needed for SQL-based implementation
- Connection string expected via DATABASE_URL environment variable

### File Upload Processing

**Transaction Data Upload Flow:**
1. Client selects CSV file via drag-and-drop or file picker
2. File validated for CSV format
3. Multipart form data sent to server with platform identifier and client ID
4. Server parses CSV and validates column structure
5. Location name extraction and fuzzy matching against existing locations
6. Transaction records created with locationId references (or null if unmatched)
7. Client receives success/error feedback via toast notifications

**Platform-Specific Transaction Parsing:**
- Each platform has unique CSV column structures documented in attached_assets
- Conservative filtering: only "Marketplace" channel and "Completed" status orders
- Marketing attribution based on promotional fields and discount columns
- Metadata extraction includes order IDs, dates, fees, and payout calculations

**Marketing Data Upload (COMPLETED):**
1. User selects platform (DoorDash, Uber Eats) and data type (Promotions, Ads, Campaigns, Offers)
2. Uploads CSV file via drag-and-drop or file picker on Upload page
3. Multipart form data sent to server with platform, clientId, dataType, and file
4. Server processes CSV based on platform/data type:
   - **DoorDash Promotions**: Campaign Id, Campaign Name, Store Name, dates, Sales, Discounts, ROAS, New Customers
   - **DoorDash Ads**: Campaign Id, Campaign Name, Store Name, dates, Clicks, Orders, Sales, Marketing Fees, ROAS, CPA
   - **Uber Campaigns**: Campaign UUID, Campaign name, Location name, dates, Impressions, Clicks, Orders, Sales, Ad spend, ROAS, CTR, CPC
   - **Uber Offers**: Campaign UUID, Campaign name, dates, Sales, Orders, New customers (aggregated across all stores)
5. Location matching: Uses fuzzy matching (0.8 threshold) to link store names to existing canonical locations
6. Campaign aggregation: Calculates campaign-level totals from location-level rows
7. Deduplication:
   - Campaign records checked by campaignId (skip if exists)
   - Location metrics checked by (campaignId, locationId, dateStart) tuple (upsert logic)
8. Storage:
   - Creates/updates promotion or paidAdCampaign records
   - Stores location-level metrics in campaignLocationMetrics table
9. Client receives success feedback via toast with rowsProcessed count

## External Dependencies

### Third-Party Services
- **Neon Database** - Serverless PostgreSQL hosting (configured but using in-memory storage currently)
- **Replit** - Development and deployment platform with custom Vite plugins

### Key NPM Packages

**Frontend:**
- `@tanstack/react-query` - Server state management, caching, and automatic refetching
- `@radix-ui/*` - Accessible, unstyled UI primitives (17+ components)
- `tailwindcss` - Utility-first CSS framework
- `class-variance-authority` - Type-safe variant styling
- `wouter` - Minimal routing library
- `date-fns` - Date manipulation and formatting

**Backend:**
- `express` - Web server framework
- `drizzle-orm` - TypeScript ORM with type-safe query builder
- `@neondatabase/serverless` - PostgreSQL driver for serverless environments
- `multer` - Multipart form data handling for file uploads
- `csv-parse` - CSV parsing with streaming support
- `zod` - Schema validation and TypeScript type inference

**Development:**
- `vite` - Build tool and dev server
- `typescript` - Static type checking
- `tsx` - TypeScript execution for development
- `esbuild` - Fast bundling for production server code
- `drizzle-kit` - Database migration tool

### Design Assets
- Custom font: FKGroteskNeue (primary)
- Monospace font: Berkeley Mono (for numerical data)
- Platform colors: Uber Green (#45B85A), DoorDash Red (#FF3008), Grubhub Orange (#F86734)
- 8-color chart palette for data visualization