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
