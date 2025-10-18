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
- Custom components like MetricCard, DataTable, PlatformBadge, FileUploadZone, ClientSelector, PlatformSelector
- Page-based routing: Dashboard, Campaigns, Upload, Locations
- Sidebar navigation with a responsive context
- Comprehensive filtering system:
  - Client filtering via ClientSelector component
  - Platform filtering via PlatformSelector component (All, Uber Eats, DoorDash, Grubhub)
  - Location tag filtering (e.g., "Corporate" tag for 16 corporate locations)
  - Date range filtering (planned for weekStart/weekEnd)

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
- **DoorDash Attribution Methodology (Updated)**:
  - Order Filtering: Only Marketplace channel + Completed status counted for sales/order metrics
  - Sales Calculation: Uses "Sales (excl. tax)" as primary metric
  - Marketing Investment: Ad Spend (from "Other payments") + Offer Value (promotional discounts + credits)
  - Marketing Attribution: Orders with promotional offers, delivery offers, marketing credits, or third-party contributions
  - Net Payout: Sums ALL order statuses (including refunds, cancellations)

**API Endpoints:**
- `/api/clients`: Client management
- `/api/locations`: Location management and matching
- `/api/locations/suggestions`: Fuzzy matching for unlinked locations
- `/api/upload`: CSV file upload for transaction data
- `/api/upload/marketing`: Marketing CSV upload
- `/api/analytics/*`: Aggregated platform-level, location-level, and client performance metrics with filtering support
  - Query parameters: `clientId`, `platform` (ubereats|doordash|grubhub), `locationTag`, `weekStart`, `weekEnd`
  - Filters apply consistently across dashboard overview and location metrics
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
  - By client/brand
  - By platform (Uber Eats, DoorDash, Grubhub)
  - By location tag (e.g., Corporate locations only)
  - By date range (planned)

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
- Server-side parsing, column validation, location matching, and transaction record creation.
- Success/error feedback via toast notifications.

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