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
- **Marketing Data Upload**: Supports platform and data type selection, fuzzy location matching, and deduplication for campaign records and location metrics.

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