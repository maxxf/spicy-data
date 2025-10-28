# Spicy Data Multi-Platform Delivery Analytics Dashboard

## Overview
This project is a multi-tenant data analytics dashboard designed for restaurant chains to monitor and optimize performance across major third-party delivery platforms (Uber Eats, DoorDash, Grubhub). It processes CSV payment data to provide comprehensive insights into sales, marketing ROI, and location-specific analytics, aiming to enhance profitability and market understanding for digital storefronts.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18+, TypeScript, and Vite, utilizing `shadcn/ui` (Radix UI) with Tailwind CSS for a custom "New York" design system. It features a data-dense layout, a custom color palette (teal brand, light/dark modes), and is responsive for data visualization. Navigation is handled by a sidebar, leading to key pages like Dashboard, Campaigns, Upload, Locations, Admin, and Income Statement, all supporting comprehensive filtering by week, client, location, platform, and location tags.
- **Weekly Performance Trends Chart (October 28, 2025)**: Enhanced the Weekly Sales Trend chart to display three key metrics simultaneously:
  - **Sales** (left Y-axis): Total weekly sales in dollars
  - **ROAS** (right Y-axis): Return on Ad Spend multiplier
  - **Payout %** (right Y-axis): Net payout percentage
  - Dual-axis configuration with custom formatters for each metric (currency, multiplier, percentage)
  - Color-coded lines with legend for easy differentiation
  - Interactive tooltips showing all three metrics for each week
- **Income Statement Redesign (October 28, 2025)**: Complete UI/UX overhaul inspired by Loop AI design:
  - Clean header with "Balance || Income Statement" title and Link2 icon
  - Streamlined filter bar (client selector + date range only - location/platform filters removed as they don't align with comparative income statement purpose)
  - Blue percentage badges replacing plain text percentages
  - Orange category indicators for main sections (Marketing, Customer Refunds, etc.)
  - Dark background highlighting on Total column for key metrics (slate-700)
  - Improved table spacing, borders, and typography for better readability
  - All interactive elements have data-testid attributes for testing
  - Maintained functional integrity: CSV export, fully wired filters, responsive layout

### Technical Implementations
The backend uses Express.js with TypeScript, providing a RESTful API. It handles robust CSV parsing with platform-specific logic for Uber Eats, DoorDash, and Grubhub, including transaction validation, data normalization, and string similarity for location reconciliation. Data processing is optimized for memory usage and speed using SQL aggregations. Marketing-driven sales attribution logic is consistently applied across platforms. Authentication and authorization are managed via Replit Auth (OIDC) with `express-session`, implementing a three-tier role system and secure session management. A robust data migration system for production deployments ensures data integrity with Zod schema validation, checksum verification, and database transactions.

**Production Upload System (October 28, 2025)**: All upload endpoints secured with authentication middleware. File processing uses `multer.memoryStorage()` for production compatibility - CSV data is parsed in-memory and stored directly to database without relying on workspace file system. Upload routes protected: `/api/upload` and `/api/upload/marketing` require authentication, `/api/admin/import-data` requires super admin role. System is production-ready with comprehensive deployment documentation in PRODUCTION_DEPLOYMENT.md.

### Feature Specifications
Key features include:
- Multi-dimensional filtering for analytics.
- Calculation of ROAS, net payout percentages, and AOV.
- Comprehensive financial breakdown with CSV export via the Income Statement.
- Management of clients, locations, file uploads (transaction and marketing data), analytics, promotions, and paid ads.
- Automated location standardization and master location system with extensive transaction consolidation across platforms using various matching strategies.
- Support for specific CSV report types from Uber Eats, DoorDash, and Grubhub.
- Handling of platform-specific data nuances, such as DoorDash Storefront filtering (Storefront transactions are excluded, only Marketplace transactions processed), merchant store ID mapping, and Uber Eats/Grubhub store code matching.

### System Design Choices
The system uses Drizzle ORM with a PostgreSQL dialect for database interactions, enforced with Zod schemas for validation. The data model includes core entities like Clients, Locations, Transactions, Promotions, and Paid Ad Campaigns, designed to support complex analytics and reporting. A master location system standardizes location names and consolidates transactions from various platform-specific entries, ensuring data accuracy and consistency. Unmapped transactions are assigned to a designated bucket, and referential integrity is strictly maintained across all data operations.

## External Dependencies

### Third-Party Services
- **Neon Database**: Serverless PostgreSQL hosting.
- **Replit**: Development and deployment platform.

### Key NPM Packages
- **Frontend**: `@tanstack/react-query`, `@radix-ui/*`, `tailwindcss`, `class-variance-authority`, `wouter`, `date-fns`.
- **Backend**: `express`, `drizzle-orm`, `@neondatabase/serverless`, `multer`, `csv-parse`, `zod`.
- **Development**: `vite`, `typescript`, `tsx`, `esbuild`, `drizzle-kit`.