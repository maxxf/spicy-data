# Design Guidelines: Spice Digital Multi-Platform Delivery Dashboard

## Design Approach
**Selected Approach:** Design System (Data-First Dashboard)  
**Rationale:** This is a utility-focused analytics platform requiring information density, data visualization clarity, and consistent patterns across multiple complex views. The application prioritizes function over form, with emphasis on data legibility, efficient workflows, and dashboard conventions.

**Inspiration:** Leveraging proven data dashboard patterns from Linear (clean metrics), Stripe Dashboard (financial clarity), and Retool (data-dense tables), adapted to the existing Spice Digital aesthetic shown in the provided mockup.

---

## Core Design Elements

### A. Color Palette

**Preserve Existing Foundation:**
- **Primary Brand:** Teal (210 75% 34% for light mode, 186 66% 49% for dark mode)
- **Surface Colors:** Cream tones (42 43% 99%) for light mode, Charcoal (180 3% 13%) for dark mode
- **Text:** Slate (196 49% 15%) for primary text, reduced opacity for secondary

**Enhancements for Data Visualization:**
- **Chart Palette (8 distinct colors):**
  - Platform indicators: Uber Green (142 71% 45%), DoorDash Red (0 72% 51%), Grubhub Orange (27 87% 67%)
  - Metric categories: Blue (217 91% 60%), Purple (271 81% 56%), Pink (330 81% 60%), Cyan (189 94% 43%), Amber (43 96% 56%)
- **Status Indicators:**
  - Success/Positive: Teal-500 (existing brand color)
  - Warning: Amber (38 92% 50%)
  - Error/Negative: Red (0 84% 60%)
  - Neutral: Gray (210 9% 53%)

### B. Typography

**Font System:**
- **Primary:** FKGroteskNeue (as specified in existing CSS)
- **Monospace:** Berkeley Mono (for numerical data, order IDs, timestamps)

**Hierarchy:**
- **Dashboard Title:** 24px/1.2, weight 600, letter-spacing -0.01em
- **Section Headers:** 18px/1.3, weight 550
- **Metric Labels:** 12px/1.4, weight 500, uppercase with 0.03em tracking
- **Metric Values:** 30px/1.1 for hero metrics, 20px/1.2 for cards, weight 600
- **Body/Table Text:** 14px/1.5, weight 400
- **Small/Secondary:** 12px/1.4, weight 400

### C. Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 8, 12, 16, 20, 24, 32
- **Component padding:** p-4 or p-6 for cards
- **Section spacing:** mb-8 or mb-12 between major sections
- **Element gaps:** gap-4 for grids, gap-2 for tight groupings
- **Container margins:** mx-auto with max-width constraints

**Grid System:**
- **Metrics Grid:** 4 columns on desktop (grid-cols-4), 2 on tablet (md:grid-cols-2), 1 on mobile
- **Data Tables:** Full-width with horizontal scroll on mobile
- **Chart Containers:** 2-column layout for comparison charts (grid-cols-2), single column for main trends

### D. Component Library

**Navigation:**
- **Top Header:** Fixed position with client selector, date range picker, export button, and user account
- **Tab Navigation:** Horizontal tabs with active state indicator (bottom border in primary color)
- **Breadcrumbs:** For nested views (Platform → Location drill-down)

**Data Display:**
- **Metric Cards:** Bordered containers with subtle shadow, containing label (top), large value (center), and change indicator with arrow (bottom)
- **Data Tables:** Striped rows, sticky headers, sortable columns with caret icons, hover states on rows
- **Charts:** Using Chart.js with consistent color palette, grid lines at 20% opacity, labeled axes, legends positioned top-right
- **Trend Indicators:** Up/down arrows with color coding (green for positive, red for negative), percentage change in small text

**Forms & Inputs:**
- **File Upload:** Drag-and-drop zone with dashed border, file type indicators, progress bars
- **Dropdowns:** Native select with custom styling matching mockup (caret icon, border, padding)
- **Date Pickers:** Calendar popup with range selection capability
- **Filter Pills:** Removable chips showing active filters

**Status & Feedback:**
- **Loading States:** Skeleton screens for data tables, spinner for metrics
- **Empty States:** Centered icon + message + CTA button
- **Alerts:** Inline banners with icon, message, and dismiss button (success/warning/error variants)

### E. Animations

**Minimal, Performance-Focused:**
- **Transitions:** 150ms ease-out for hover states, 250ms for tab changes
- **Chart Animations:** Disabled or subtle entrance (300ms) to avoid distraction
- **Data Updates:** Brief highlight flash (500ms fade) on changed values
- **No:** Loading spinners beyond 2 seconds, decorative animations, parallax effects

---

## Dashboard-Specific Patterns

**Multi-Client Architecture:**
- Client selector in global header affects all dashboard views
- Color-coded client indicators in tables (subtle left border)
- Comparison mode toggle to view multiple clients side-by-side

**Data Hierarchy:**
- **Level 1:** Portfolio overview (all clients, all platforms)
- **Level 2:** Platform analysis (Uber/DoorDash/Grubhub breakdown)
- **Level 3:** Location performance (individual store metrics)
- **Level 4:** Transaction detail (drill-down to order level)

**Metric Presentation:**
- Primary KPIs in hero cards at top (4-across)
- Secondary metrics in grid below (8 cards, 4×2 layout)
- Charts in 2-column or full-width sections
- Tables always full-width with pagination

**Responsive Strategy:**
- Desktop (1280px+): Full 4-column metric grid, side-by-side charts
- Tablet (768-1279px): 2-column metrics, stacked charts
- Mobile (<768px): Single column everything, horizontal scroll for tables, condensed metrics

**Dark Mode Implementation:**
- Follow existing CSS variables with prefers-color-scheme and data-attribute support
- Ensure chart colors maintain sufficient contrast in both modes
- Table striping more subtle in dark mode (5% opacity vs 8%)

---

## Images

**No hero images required** – This is a data dashboard, not a marketing site. The visual focus is on charts, metrics, and tables.

**Icon Usage:**
- Tab icons (emoji as placeholders: 📈 📱 📍 🎯 etc.)
- Status indicators (checkmarks, warnings, errors)
- Action buttons (export 📊, upload 📂, settings ⚙️)
- Platform logos (Uber Eats, DoorDash, Grubhub) at 24×24px in platform selectors

**Data Visualizations:**
- Line charts for trends (sales over time, ROAS progression)
- Bar charts for comparisons (platform performance, location ranking)
- Donut charts for distribution (sales mix by platform)
- Scatter plots for efficiency matrices (ROAS vs marketing spend)

---

## Key Design Principles

1. **Data Legibility First:** Every metric must be readable at-a-glance; avoid decorative elements that compete with data
2. **Consistent Metric Formatting:** Currency always with $ prefix, percentages with %, multipliers with x suffix (e.g., 4.2x)
3. **Progressive Disclosure:** Summary cards → detailed tables → transaction drill-down
4. **Comparison-Friendly:** Always show previous period, trend indicators, and variance
5. **Scannable Tables:** Zebra striping, numerical right-alignment, text left-alignment, consistent cell padding
6. **Accessible Interactions:** Keyboard navigation, focus states, sufficient contrast (WCAG AA minimum)