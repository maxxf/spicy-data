# Spice Digital Multi-Platform Delivery Analytics Dashboard

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

### Database
- **Design**: Drizzle ORM with PostgreSQL dialect, Zod schemas for validation.
- **Current State**: In-memory storage for development, with an `IStorage` interface for future migration to Neon Database (PostgreSQL).

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