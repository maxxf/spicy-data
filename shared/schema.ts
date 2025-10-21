import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, timestamp, integer, boolean, uniqueIndex, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"), // "super_admin", "brand_admin", "user"
  clientId: varchar("client_id").references(() => clients.id), // Brand admins are assigned to a client
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Core entity schemas
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  storeId: text("store_id"), // Column C: Master Store Code (canonical ID, e.g., "69|15645")
  canonicalName: text("canonical_name").notNull(),
  address: text("address"), // Column G from master sheet - used for Grubhub matching
  doorDashStoreKey: text("doordash_store_key"), // Column E from master - matches DoorDash "Merchant Store ID"
  uberEatsStoreLabel: text("ubereats_store_label"), // Column E from master - matches UE "Store Name (ID)"
  uberEatsName: text("uber_eats_name"), // Display name from Uber Eats CSV
  doordashName: text("doordash_name"), // Display name from DoorDash CSV
  grubhubName: text("grubhub_name"), // Display name from Grubhub CSV
  isVerified: boolean("is_verified").default(false).notNull(),
  locationTag: text("location_tag"), // e.g., "Corporate", "Franchise"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Platform transaction schemas
export const uberEatsTransactions = pgTable("uber_eats_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  locationId: varchar("location_id").references(() => locations.id),
  orderId: text("order_id").notNull(),
  workflowId: text("workflow_id").notNull(), // Unique transaction identifier from Uber Eats
  orderStatus: text("order_status"), // e.g., "Completed", "Cancelled", "Unfulfilled", "Refund", "Refund Disputed"
  date: text("date").notNull(),
  time: text("time").notNull(),
  location: text("location").notNull(),
  
  // Sales fields (updated methodology)
  salesExclTax: real("sales_excl_tax").notNull().default(0), // "Sales (excl. tax)" - primary sales metric
  subtotal: real("subtotal").notNull(), // "Sales (incl. tax)" - kept for backward compatibility
  tax: real("tax").notNull(),
  
  // Fee fields
  deliveryFee: real("delivery_fee").notNull(),
  serviceFee: real("service_fee").notNull(),
  platformFee: real("platform_fee").notNull(),
  
  // Marketing/Promotional fields (updated methodology)
  offersOnItems: real("offers_on_items").notNull().default(0), // "Offers on items (incl. tax)" - negative for discounts
  deliveryOfferRedemptions: real("delivery_offer_redemptions").notNull().default(0), // "Delivery Offer Redemptions (incl. tax)" - negative for discounts
  marketingPromo: text("marketing_promo"), // Legacy field - kept for backward compatibility
  marketingAmount: real("marketing_amount").notNull(), // Legacy field - kept for backward compatibility
  
  // Other payments (Ad Spend, Credits, Fees, etc.)
  otherPayments: real("other_payments").notNull().default(0), // "Other payments" - can be positive or negative
  otherPaymentsDescription: text("other_payments_description"), // "Other payments description" - e.g., "Ad Spend", "Ad Credits"
  
  // Payout
  netPayout: real("net_payout").notNull(),
  
  // Other
  customerRating: integer("customer_rating"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate transactions - use workflowId as unique identifier
  uniqueTransaction: uniqueIndex("uber_eats_unique_transaction").on(table.clientId, table.workflowId),
}));

export const doordashTransactions = pgTable("doordash_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  locationId: varchar("location_id").references(() => locations.id),
  
  // Order identification
  transactionId: text("transaction_id").notNull(), // DoorDash transaction ID - unique per transaction
  orderNumber: text("order_number").notNull(),
  transactionDate: text("transaction_date").notNull(),
  storeLocation: text("store_location").notNull(),
  
  // Order status and channel (for filtering per new methodology)
  channel: text("channel"), // e.g., "Marketplace", "Caviar", etc.
  orderStatus: text("order_status"), // e.g., "Completed", "Cancelled", "Refund", etc.
  transactionType: text("transaction_type"), // e.g., "Customer Delivery", "Customer Pickup", "Refund", etc.
  
  // Sales metrics (updated methodology)
  salesExclTax: real("sales_excl_tax").notNull().default(0), // Primary sales metric per new methodology
  orderSubtotal: real("order_subtotal").notNull().default(0), // Legacy field
  taxes: real("taxes").notNull().default(0),
  
  // Fees and charges
  deliveryFees: real("delivery_fees").notNull().default(0),
  commission: real("commission").notNull().default(0),
  errorCharges: real("error_charges").notNull().default(0),
  
  // Marketing and promotional fields (new methodology)
  offersOnItems: real("offers_on_items").notNull().default(0), // Negative for discounts
  deliveryOfferRedemptions: real("delivery_offer_redemptions").notNull().default(0), // Negative for discounts
  marketingCredits: real("marketing_credits").notNull().default(0),
  thirdPartyContribution: real("third_party_contribution").notNull().default(0),
  
  // Other payments (ad spend, credits, fees - new methodology)
  otherPayments: real("other_payments").notNull().default(0), // Absolute value of misc payments
  otherPaymentsDescription: text("other_payments_description"), // Description of payment type
  
  // Legacy marketing field
  marketingSpend: real("marketing_spend").notNull().default(0),
  
  // Payout (new methodology uses totalPayout for all statuses)
  totalPayout: real("total_payout").notNull().default(0), // Includes all statuses
  netPayment: real("net_payment").notNull().default(0), // Legacy field
  
  // Source
  orderSource: text("order_source"),
  
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicate transactions - using transactionId since multiple transactions can exist per order
  uniqueTransaction: uniqueIndex("doordash_unique_transaction").on(table.clientId, table.transactionId),
}));

export const grubhubTransactions = pgTable("grubhub_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  locationId: varchar("location_id").references(() => locations.id),
  
  // Order identification
  orderId: text("order_id").notNull(),
  orderDate: text("order_date").notNull(),
  transactionType: text("transaction_type").notNull(), // "Prepaid Order", "Order Adjustment", etc.
  transactionId: text("transaction_id").notNull(), // Unique transaction identifier from Grubhub
  
  // Location and order details
  restaurant: text("restaurant").notNull(),
  orderChannel: text("order_channel"),
  fulfillmentType: text("fulfillment_type"),
  
  // Financial details (from CSV columns)
  subtotal: real("subtotal").notNull().default(0),
  subtotalSalesTax: real("subtotal_sales_tax").notNull().default(0),
  saleAmount: real("sale_amount").notNull().default(0), // subtotal + subtotalSalesTax
  commission: real("commission").notNull().default(0),
  deliveryCommission: real("delivery_commission").notNull().default(0),
  processingFee: real("processing_fee").notNull().default(0),
  merchantFundedPromotion: real("merchant_funded_promotion").notNull().default(0),
  merchantNetTotal: real("merchant_net_total").notNull().default(0),
  transactionNote: text("transaction_note"),
  
  // Customer info
  customerType: text("customer_type").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint on transaction_id to allow multiple rows per order
  uniqueTransaction: uniqueIndex("grubhub_unique_transaction").on(table.clientId, table.transactionId),
}));

export const promotions = pgTable("promotions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id"), // External campaign ID from platform
  clientId: varchar("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  platforms: text("platforms").array().notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  discountPercent: real("discount_percent"),
  discountAmount: real("discount_amount"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const paidAdCampaigns = pgTable("paid_ad_campaigns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id"), // External campaign ID from platform
  clientId: varchar("client_id").notNull().references(() => clients.id),
  name: text("name").notNull(),
  platform: text("platform").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  budget: real("budget"),
  impressions: integer("impressions").default(0).notNull(),
  clicks: integer("clicks").default(0).notNull(),
  ctr: real("ctr").default(0).notNull(),
  cpc: real("cpc").default(0).notNull(),
  orders: integer("orders").default(0).notNull(),
  conversionRate: real("conversion_rate").default(0).notNull(),
  spend: real("spend").default(0).notNull(),
  revenue: real("revenue").default(0).notNull(),
  roas: real("roas").default(0).notNull(),
  cpa: real("cpa").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Campaign location metrics - stores location-level performance for campaigns
export const campaignLocationMetrics = pgTable("campaign_location_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: varchar("campaign_id").notNull(),
  campaignType: text("campaign_type").notNull(), // 'promotion' or 'paid_ad'
  clientId: varchar("client_id").notNull().references(() => clients.id),
  locationId: varchar("location_id").references(() => locations.id),
  locationName: text("location_name").notNull(),
  platform: text("platform").notNull(),
  dateStart: text("date_start"),
  dateEnd: text("date_end"),
  impressions: integer("impressions").default(0),
  clicks: integer("clicks").default(0),
  orders: integer("orders").default(0).notNull(),
  revenue: real("revenue").default(0).notNull(),
  spend: real("spend").default(0).notNull(),
  discount: real("discount").default(0),
  roas: real("roas").default(0),
  ctr: real("ctr").default(0),
  conversionRate: real("conversion_rate").default(0),
  cpc: real("cpc").default(0),
  cpa: real("cpa").default(0),
  newCustomers: integer("new_customers").default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

// Platform ad spend - stores location-level ad spend not tied to specific orders
export const platformAdSpend = pgTable("platform_ad_spend", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  locationId: varchar("location_id").references(() => locations.id),
  platform: text("platform").notNull(), // 'ubereats', 'doordash', 'grubhub'
  date: text("date").notNull(), // Format: M/D/YY (UberEats) or YYYY-MM-DD
  adSpend: real("ad_spend").notNull().default(0), // Ad spend amount (absolute value)
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => ({
  // Unique constraint to prevent duplicates
  uniqueAdSpend: uniqueIndex("platform_ad_spend_unique").on(table.clientId, table.locationId, table.platform, table.date),
}));

// Location weekly financials - stores weekly financial summary per location
export const locationWeeklyFinancials = pgTable("location_weekly_financials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  weekStartDate: text("week_start_date").notNull(), // Format: YYYY-MM-DD
  weekEndDate: text("week_end_date").notNull(), // Format: YYYY-MM-DD
  sales: real("sales").default(0).notNull(), // Total sales excluding tax
  marketingSales: real("marketing_sales").default(0).notNull(), // Sales from marketing campaigns
  marketingSpend: real("marketing_spend").default(0).notNull(), // Total marketing spend
  marketingPercent: real("marketing_percent").default(0).notNull(), // Marketing % of total sales
  roas: real("roas").default(0).notNull(), // Return on ad spend
  payout: real("payout").default(0).notNull(), // Net payout amount
  payoutPercent: real("payout_percent").default(0).notNull(), // Payout as % of sales
  payoutWithCogs: real("payout_with_cogs").default(0).notNull(), // Payout minus COGS (46%)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas
export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  createdAt: true,
});

export const insertUberEatsTransactionSchema = createInsertSchema(uberEatsTransactions).omit({
  id: true,
  uploadedAt: true,
});

export const insertDoordashTransactionSchema = createInsertSchema(doordashTransactions).omit({
  id: true,
  uploadedAt: true,
});

export const insertGrubhubTransactionSchema = createInsertSchema(grubhubTransactions).omit({
  id: true,
  uploadedAt: true,
});

export const insertPromotionSchema = createInsertSchema(promotions).omit({
  id: true,
  createdAt: true,
});

export const insertPaidAdCampaignSchema = createInsertSchema(paidAdCampaigns).omit({
  id: true,
  createdAt: true,
});

export const insertCampaignLocationMetricSchema = createInsertSchema(campaignLocationMetrics).omit({
  id: true,
  uploadedAt: true,
});

export const insertLocationWeeklyFinancialSchema = createInsertSchema(locationWeeklyFinancials).omit({
  id: true,
  createdAt: true,
});

// TypeScript types
export type Client = typeof clients.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type UberEatsTransaction = typeof uberEatsTransactions.$inferSelect;
export type InsertUberEatsTransaction = z.infer<typeof insertUberEatsTransactionSchema>;

export type DoordashTransaction = typeof doordashTransactions.$inferSelect;
export type InsertDoordashTransaction = z.infer<typeof insertDoordashTransactionSchema>;

export type GrubhubTransaction = typeof grubhubTransactions.$inferSelect;
export type InsertGrubhubTransaction = z.infer<typeof insertGrubhubTransactionSchema>;

export type Promotion = typeof promotions.$inferSelect;
export type InsertPromotion = z.infer<typeof insertPromotionSchema>;

export type PaidAdCampaign = typeof paidAdCampaigns.$inferSelect;
export type InsertPaidAdCampaign = z.infer<typeof insertPaidAdCampaignSchema>;

export type CampaignLocationMetric = typeof campaignLocationMetrics.$inferSelect;
export type InsertCampaignLocationMetric = z.infer<typeof insertCampaignLocationMetricSchema>;

export type LocationWeeklyFinancial = typeof locationWeeklyFinancials.$inferSelect;
export type InsertLocationWeeklyFinancial = z.infer<typeof insertLocationWeeklyFinancialSchema>;

// Analytics types
export type PlatformMetrics = {
  platform: "ubereats" | "doordash" | "grubhub";
  totalSales: number;
  marketingDrivenSales: number;
  organicSales: number;
  totalOrders: number;
  ordersFromMarketing: number;
  organicOrders: number;
  aov: number;
  adSpend: number;
  offerDiscountValue: number;
  totalMarketingInvestment: number;
  marketingInvestmentPercent: number;
  marketingRoas: number;
  netPayout: number;
  netPayoutPercent: number;
};

export type LocationMetrics = {
  locationId: string;
  locationName: string;
  platform: "ubereats" | "doordash" | "grubhub";
  totalSales: number;
  marketingDrivenSales: number;
  organicSales: number;
  totalOrders: number;
  ordersFromMarketing: number;
  organicOrders: number;
  aov: number;
  adSpend: number;
  offerDiscountValue: number;
  totalMarketingInvestment: number;
  marketingInvestmentPercent: number;
  marketingRoas: number;
  netPayout: number;
  netPayoutPercent: number;
};

export type ConsolidatedLocationMetrics = {
  canonicalName: string | null;
  location: string;
  totalSales: number;
  totalOrders: number;
  aov: number;
  totalMarketingInvestment: number;
  marketingDrivenSales?: number;
  marketingRoas: number;
  netPayout: number;
  netPayoutPercent: number;
  platformBreakdown: {
    ubereats?: PlatformMetrics;
    doordash?: PlatformMetrics;
    grubhub?: PlatformMetrics;
  };
};

export type DashboardOverview = {
  totalSales: number;
  totalOrders: number;
  averageAov: number;
  totalMarketingInvestment: number;
  blendedRoas: number;
  netPayoutPercent: number;
  platformBreakdown: PlatformMetrics[];
  comparison?: {
    totalSales: number | null;
    totalOrders: number | null;
    averageAov: number | null;
    totalMarketingInvestment: number | null;
    blendedRoas: number | null;
    netPayout: number | null;
  };
};

export type LocationMatchSuggestion = {
  locationName: string;
  platform: "ubereats" | "doordash" | "grubhub";
  matchedLocationId?: string;
  matchedLocationName?: string;
  confidence: number;
  orderCount: number;
};

export type PromotionMetrics = Promotion & {
  orders: number;
  revenueImpact: number;
  discountCost: number;
  marketingFees: number; // Platform marketing fees
  totalCost: number; // discountCost + marketingFees
  newCustomers: number;
  roi: number;
};

export type PaidAdCampaignMetrics = PaidAdCampaign;

// Analytics filters schema
export const analyticsFiltersSchema = z.object({
  clientId: z.string().optional(),
  locationId: z.string().optional(), // Filter by specific location
  platform: z.enum(["ubereats", "doordash", "grubhub"]).optional(),
  weekStart: z.string().optional(), // ISO date format: YYYY-MM-DD (Monday)
  weekEnd: z.string().optional(), // ISO date format: YYYY-MM-DD (Sunday)
  locationTag: z.string().optional(), // e.g., "Corporate"
});

export type AnalyticsFilters = z.infer<typeof analyticsFiltersSchema>;
