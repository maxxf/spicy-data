import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Core entity schemas
export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  canonicalName: text("canonical_name").notNull(),
  uberEatsName: text("uber_eats_name"),
  doordashName: text("doordash_name"),
  grubhubName: text("grubhub_name"),
  isVerified: boolean("is_verified").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Platform transaction schemas
export const uberEatsTransactions = pgTable("uber_eats_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  locationId: varchar("location_id").references(() => locations.id),
  orderId: text("order_id").notNull(),
  date: text("date").notNull(),
  time: text("time").notNull(),
  location: text("location").notNull(),
  subtotal: real("subtotal").notNull(),
  tax: real("tax").notNull(),
  deliveryFee: real("delivery_fee").notNull(),
  serviceFee: real("service_fee").notNull(),
  marketingPromo: text("marketing_promo"),
  marketingAmount: real("marketing_amount").notNull(),
  platformFee: real("platform_fee").notNull(),
  netPayout: real("net_payout").notNull(),
  customerRating: integer("customer_rating"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const doordashTransactions = pgTable("doordash_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  locationId: varchar("location_id").references(() => locations.id),
  orderNumber: text("order_number").notNull(),
  transactionDate: text("transaction_date").notNull(),
  storeLocation: text("store_location").notNull(),
  orderSubtotal: real("order_subtotal").notNull(),
  taxes: real("taxes").notNull(),
  deliveryFees: real("delivery_fees").notNull(),
  commission: real("commission").notNull(),
  marketingSpend: real("marketing_spend").notNull(),
  errorCharges: real("error_charges").notNull(),
  netPayment: real("net_payment").notNull(),
  orderSource: text("order_source").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export const grubhubTransactions = pgTable("grubhub_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => clients.id),
  locationId: varchar("location_id").references(() => locations.id),
  orderId: text("order_id").notNull(),
  orderDate: text("order_date").notNull(),
  restaurant: text("restaurant").notNull(),
  saleAmount: real("sale_amount").notNull(),
  taxAmount: real("tax_amount").notNull(),
  deliveryCharge: real("delivery_charge").notNull(),
  processingFee: real("processing_fee").notNull(),
  promotionCost: real("promotion_cost").notNull(),
  netSales: real("net_sales").notNull(),
  customerType: text("customer_type").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

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

export type DashboardOverview = {
  totalSales: number;
  totalOrders: number;
  averageAov: number;
  totalMarketingInvestment: number;
  blendedRoas: number;
  netPayoutPercent: number;
  platformBreakdown: PlatformMetrics[];
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
  newCustomers: number;
  roi: number;
};

export type PaidAdCampaignMetrics = PaidAdCampaign;
