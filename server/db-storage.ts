import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, or, sql, desc, inArray, gte, lte } from "drizzle-orm";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
import {
  users,
  clients,
  locations,
  uberEatsTransactions,
  doordashTransactions,
  grubhubTransactions,
  promotions,
  paidAdCampaigns,
  campaignLocationMetrics,
  platformAdSpend,
  locationWeeklyFinancials,
  type User,
  type UpsertUser,
  type Client,
  type InsertClient,
  type Location,
  type InsertLocation,
  type UberEatsTransaction,
  type InsertUberEatsTransaction,
  type DoordashTransaction,
  type InsertDoordashTransaction,
  type GrubhubTransaction,
  type InsertGrubhubTransaction,
  type Promotion,
  type InsertPromotion,
  type PromotionMetrics,
  type PaidAdCampaign,
  type InsertPaidAdCampaign,
  type PaidAdCampaignMetrics,
  type CampaignLocationMetric,
  type InsertCampaignLocationMetric,
  type LocationWeeklyFinancial,
  type InsertLocationWeeklyFinancial,
  type DashboardOverview,
  type LocationMetrics,
  type ConsolidatedLocationMetrics,
  type PlatformMetrics,
  type LocationMatchSuggestion,
  type AnalyticsFilters,
} from "@shared/schema";
import type { IStorage } from "./storage";
import { getUniqueWeeks } from "../shared/week-utils";

// Helper function to detect if an UberEats description is ad-related
export function isUberEatsAdRelatedDescription(description: string | null | undefined): boolean {
  if (!description) return false;
  
  const desc = description.toLowerCase().trim();
  
  // Use word boundaries to match ad-related terms while excluding "adjustment", "added", etc.
  // Matches: "ad", "ads", "ad fee", "ad campaign", "advertising", "paid promotion"
  // Excludes: "adjustment", "adjustments", "added", "upgraded"
  const adPattern = /\b(ad|ads|advertising|paid\s*promotion|ad\s*spend|ad\s*fee|ad\s*campaign)\b/i;
  const adjustmentPattern = /\b(adjust|added|upgrade)\b/i;
  
  return adPattern.test(desc) && !adjustmentPattern.test(desc);
}

// Helper function to calculate UberEats metrics using updated attribution methodology
export function calculateUberEatsMetrics(txns: UberEatsTransaction[]) {
  let totalOrders = 0;
  let totalSales = 0;
  let marketingDrivenSales = 0;
  let adSpend = 0;
  let offerDiscountValue = 0;
  let netPayout = 0;
  let ordersFromMarketing = 0;

  txns.forEach((t) => {
    // Ad Spend: Process FIRST (includes rows with NULL order_status)
    // Check "Other payments" for advertising charges (positive values only)
    // otherPayments can be positive (ad spend) or negative (ad credits)
    if (t.otherPaymentsDescription && (t.otherPayments || 0) > 0) {
      if (isUberEatsAdRelatedDescription(t.otherPaymentsDescription)) {
        adSpend += t.otherPayments;
      }
    }
    
    // Uber Eats: Only count completed orders for sales/order metrics
    // Note: Ad spend rows have NULL order_status and are excluded from order counts
    if (t.orderStatus !== 'Completed') {
      return;
    }
    
    totalOrders++;
    
    // Sales Calculation: Use subtotal as primary metric for Uber Eats
    const sales = t.subtotal || 0;
    totalSales += sales;
    
    // Net Payout: Sum all payouts
    netPayout += t.netPayout || 0;
    
    // Offer/Discount Value: Sum absolute values of promotional discounts and fees
    // Note: offersOnItems and deliveryOfferRedemptions are stored as NEGATIVE values
    // offerRedemptionFee is stored as POSITIVE value (fee charged for redemptions)
    const offersValue = Math.abs(t.offersOnItems || 0) + 
                        Math.abs(t.deliveryOfferRedemptions || 0) +
                        Math.abs(t.offerRedemptionFee || 0);
    offerDiscountValue += offersValue;
    
    // Marketing Attribution: Uber Eats uses two distinct signals
    // 1. Promotional offers: offers_on_items < 0 (promotions/offers spend & attribution)
    // 2. Ad-driven orders: Other Payments Description matches ad-related patterns
    const isAdDriven = (t.otherPayments || 0) > 0 && 
                       isUberEatsAdRelatedDescription(t.otherPaymentsDescription);
    const hasPromotionalOffer = (t.offersOnItems < 0) || (t.deliveryOfferRedemptions < 0);
    
    const hasMarketing = isAdDriven || hasPromotionalOffer;
    
    if (hasMarketing) {
      marketingDrivenSales += sales;
      ordersFromMarketing++;
    }
  });

  return {
    totalOrders,
    totalSales,
    marketingDrivenSales,
    adSpend,
    offerDiscountValue,
    netPayout,
    ordersFromMarketing,
  };
}

// Helper function to calculate DoorDash metrics using consistent attribution logic
export function calculateDoorDashMetrics(txns: DoordashTransaction[]) {
  let totalOrders = 0;
  let totalSales = 0;
  let marketingDrivenSales = 0;
  let adSpend = 0;
  let offerDiscountValue = 0;
  let netPayout = 0;
  let ordersFromMarketing = 0;

  console.log(`[DoorDash Metrics] Processing ${txns.length} transactions`);

  txns.forEach((t) => {
    const isMarketplace = !t.channel || t.channel === "Marketplace";
    
    // Completion inference: prefer transactionType when available, fall back to orderStatus
    // "Order" transaction type = completed customer orders (from Transaction Report CSV)
    // "Delivered"/"Picked Up" status = completed orders (from Store Statement CSV)
    const isCompleted = 
      t.transactionType === "Order" || 
      t.orderStatus === "Delivered" || 
      t.orderStatus === "Picked Up";
    
    if (totalOrders === 0 && isMarketplace && isCompleted) {
      console.log('[DoorDash Metrics] First valid transaction:', {
        channel: t.channel,
        status: t.orderStatus,
        type: t.transactionType,
        sales: t.salesExclTax || t.orderSubtotal,
        payout: t.totalPayout
      });
    }
    
    // Net payout for Marketplace orders only (all statuses)
    if (isMarketplace) {
      netPayout += t.totalPayout || t.netPayment || 0;
    }
    
    // Only count Marketplace + completed orders for sales and order metrics
    if (isMarketplace && isCompleted) {
      totalOrders++;
      const sales = t.salesExclTax || t.orderSubtotal || 0;
      totalSales += sales;
      
      // DoorDash Marketing Spend Breakdown:
      // Ad Spend = other_payments (actual ad spend charged by DoorDash)
      // Offers = offers_on_items + delivery_offer_redemptions + marketing_credits + third_party
      
      // Ad Spend from other_payments field
      adSpend += Math.abs(t.otherPayments || 0);
      
      // Offer Discount Value (all promotional discounts and credits)
      // Note: offers_on_items and delivery_offer_redemptions are stored as NEGATIVE values
      // marketing_credits and third_party_contribution are stored as POSITIVE values
      const offersValue = Math.abs(t.offersOnItems || 0) + 
                        Math.abs(t.deliveryOfferRedemptions || 0) +
                        (t.marketingCredits || 0) +
                        (t.thirdPartyContribution || 0);
      offerDiscountValue += offersValue;
      
      // Marketing Attribution: Use otherPayments (Marketing fees) as attribution signal
      // Per DoorDash methodology (stored as absolute values):
      //   - otherPayments = 0.99 → order from offer redemption
      //   - otherPayments = larger value → order from ads
      //   - otherPayments = null/0 → organic order (no marketing attribution)
      const hasMarketing = (t.otherPayments || 0) > 0;
      
      if (hasMarketing) {
        marketingDrivenSales += sales;
        ordersFromMarketing++;
      }
    }
  });

  return {
    totalOrders,
    totalSales,
    marketingDrivenSales,
    adSpend,
    offerDiscountValue,
    netPayout,
    ordersFromMarketing,
  };
}

// Helper to parse UberEats date (M/D/YY format) and check if in range
export function isUberEatsDateInRange(dateStr: string, weekStart: string, weekEnd: string): boolean {
  // Parse M/D/YY format to YYYY-MM-DD
  const parts = dateStr.split('/');
  if (parts.length !== 3) return false;
  
  const month = parts[0].padStart(2, '0');
  const day = parts[1].padStart(2, '0');
  const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
  const normalized = `${year}-${month}-${day}`;
  
  return normalized >= weekStart && normalized <= weekEnd;
}

export class DbStorage implements IStorage {
  private db;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not defined");
    }
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.db = drizzle(pool);
  }

  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Normalize email to lowercase for consistency
    const normalizedEmail = userData.email?.toLowerCase() || null;
    
    const [user] = await this.db
      .insert(users)
      .values({
        id: userData.id!,
        email: normalizedEmail,
        firstName: userData.firstName || null,
        lastName: userData.lastName || null,
        profileImageUrl: userData.profileImageUrl || null,
        role: userData.role || "user",
        clientId: userData.clientId || null,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: sql`EXCLUDED.email`,
          firstName: sql`EXCLUDED.first_name`,
          lastName: sql`EXCLUDED.last_name`,
          profileImageUrl: sql`EXCLUDED.profile_image_url`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const [client] = await this.db.insert(clients).values(insertClient).returning();
    return client;
  }

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await this.db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async getAllClients(): Promise<Client[]> {
    return await this.db.select().from(clients);
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const [newLocation] = await this.db.insert(locations).values(location).returning();
    return newLocation;
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await this.db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async getLocationsByClient(clientId: string): Promise<Location[]> {
    return await this.db.select().from(locations).where(eq(locations.clientId, clientId));
  }

  async getAllLocations(): Promise<Location[]> {
    return await this.db.select().from(locations);
  }

  async updateLocation(id: string, updates: Partial<Location>): Promise<Location | undefined> {
    const [updated] = await this.db
      .update(locations)
      .set(updates)
      .where(eq(locations.id, id))
      .returning();
    return updated;
  }

  async deleteLocation(id: string): Promise<boolean> {
    const result = await this.db.delete(locations).where(eq(locations.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async mergeLocations(targetLocationId: string, sourceLocationIds: string[]): Promise<Location> {
    // Update all transactions to point to the target location
    for (const sourceId of sourceLocationIds) {
      await this.db
        .update(uberEatsTransactions)
        .set({ locationId: targetLocationId })
        .where(eq(uberEatsTransactions.locationId, sourceId));
      
      await this.db
        .update(doordashTransactions)
        .set({ locationId: targetLocationId })
        .where(eq(doordashTransactions.locationId, sourceId));
      
      await this.db
        .update(grubhubTransactions)
        .set({ locationId: targetLocationId })
        .where(eq(grubhubTransactions.locationId, sourceId));
      
      await this.db
        .update(campaignLocationMetrics)
        .set({ locationId: targetLocationId })
        .where(eq(campaignLocationMetrics.locationId, sourceId));
      
      // Delete the source location
      await this.deleteLocation(sourceId);
    }
    
    // Return the target location
    const [target] = await this.db.select().from(locations).where(eq(locations.id, targetLocationId));
    return target;
  }

  async getDuplicateLocations(clientId?: string): Promise<Array<{ canonicalName: string; locationIds: string[]; count: number }>> {
    const query = clientId
      ? this.db.select().from(locations).where(eq(locations.clientId, clientId))
      : this.db.select().from(locations);
    
    const allLocations = await query;
    
    // Group by canonical name
    const groups = new Map<string, string[]>();
    for (const loc of allLocations) {
      const name = loc.canonicalName;
      if (!groups.has(name)) {
        groups.set(name, []);
      }
      groups.get(name)!.push(loc.id);
    }
    
    // Return only duplicates (count > 1)
    return Array.from(groups.entries())
      .filter(([_, ids]) => ids.length > 1)
      .map(([canonicalName, locationIds]) => ({
        canonicalName,
        locationIds,
        count: locationIds.length,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async findLocationByName(
    clientId: string,
    name: string,
    platform: "ubereats" | "doordash" | "grubhub"
  ): Promise<Location | undefined> {
    const field =
      platform === "ubereats"
        ? locations.uberEatsName
        : platform === "doordash"
          ? locations.doordashName
          : locations.grubhubName;

    const [location] = await this.db
      .select()
      .from(locations)
      .where(and(eq(locations.clientId, clientId), eq(field, name)));

    return location;
  }

  async createUberEatsTransaction(
    transaction: InsertUberEatsTransaction
  ): Promise<UberEatsTransaction> {
    const [created] = await this.db
      .insert(uberEatsTransactions)
      .values(transaction)
      .returning();
    return created;
  }

  async createUberEatsTransactionsBatch(
    transactions: InsertUberEatsTransaction[]
  ): Promise<void> {
    if (transactions.length === 0) return;
    
    // Insert in chunks of 500, using upsert to prevent duplicates based on workflowId
    const chunkSize = 500;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      await this.db.insert(uberEatsTransactions)
        .values(chunk)
        .onConflictDoUpdate({
          target: [uberEatsTransactions.clientId, uberEatsTransactions.workflowId],
          set: {
            locationId: sql`EXCLUDED.location_id`,
            orderId: sql`EXCLUDED.order_id`,
            orderStatus: sql`EXCLUDED.order_status`,
            date: sql`EXCLUDED.date`,
            time: sql`EXCLUDED.time`,
            location: sql`EXCLUDED.location`,
            salesExclTax: sql`EXCLUDED.sales_excl_tax`,
            subtotal: sql`EXCLUDED.subtotal`,
            tax: sql`EXCLUDED.tax`,
            deliveryFee: sql`EXCLUDED.delivery_fee`,
            serviceFee: sql`EXCLUDED.service_fee`,
            offersOnItems: sql`EXCLUDED.offers_on_items`,
            deliveryOfferRedemptions: sql`EXCLUDED.delivery_offer_redemptions`,
            offerRedemptionFee: sql`EXCLUDED.offer_redemption_fee`,
            marketingPromo: sql`EXCLUDED.marketing_promo`,
            marketingAmount: sql`EXCLUDED.marketing_amount`,
            otherPayments: sql`EXCLUDED.other_payments`,
            otherPaymentsDescription: sql`EXCLUDED.other_payments_description`,
            platformFee: sql`EXCLUDED.platform_fee`,
            netPayout: sql`EXCLUDED.net_payout`,
            customerRating: sql`EXCLUDED.customer_rating`,
            // Keep original uploadedAt on conflict (don't overwrite with new timestamp)
            uploadedAt: sql`uber_eats_transactions.uploaded_at`,
          },
        });
    }
  }

  async getUberEatsTransactionsByClient(clientId: string): Promise<UberEatsTransaction[]> {
    return await this.db
      .select()
      .from(uberEatsTransactions)
      .where(eq(uberEatsTransactions.clientId, clientId));
  }

  async deleteUberEatsTransactionsByDateRange(clientId: string, startDate: string, endDate: string): Promise<number> {
    const result = await this.db
      .delete(uberEatsTransactions)
      .where(
        and(
          eq(uberEatsTransactions.clientId, clientId),
          sql`date >= ${startDate}`,
          sql`date <= ${endDate}`
        )
      );
    return result.rowCount || 0;
  }

  async clearUberEatsTransactions(clientId: string): Promise<number> {
    const result = await this.db
      .delete(uberEatsTransactions)
      .where(eq(uberEatsTransactions.clientId, clientId));
    return result.rowCount || 0;
  }

  async createDoordashTransaction(
    transaction: InsertDoordashTransaction
  ): Promise<DoordashTransaction> {
    const [created] = await this.db
      .insert(doordashTransactions)
      .values(transaction)
      .returning();
    return created;
  }

  async createDoordashTransactionsBatch(
    transactions: InsertDoordashTransaction[]
  ): Promise<void> {
    if (transactions.length === 0) return;
    
    // Insert in chunks of 500, using upsert to prevent duplicates
    const chunkSize = 500;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      await this.db.insert(doordashTransactions)
        .values(chunk)
        .onConflictDoUpdate({
          target: [doordashTransactions.clientId, doordashTransactions.transactionId],
          set: {
            locationId: sql`EXCLUDED.location_id`,
            orderNumber: sql`EXCLUDED.order_number`,
            transactionDate: sql`EXCLUDED.transaction_date`,
            storeLocation: sql`EXCLUDED.store_location`,
            channel: sql`EXCLUDED.channel`,
            orderStatus: sql`EXCLUDED.order_status`,
            transactionType: sql`EXCLUDED.transaction_type`,
            salesExclTax: sql`EXCLUDED.sales_excl_tax`,
            orderSubtotal: sql`EXCLUDED.order_subtotal`,
            taxes: sql`EXCLUDED.taxes`,
            deliveryFees: sql`EXCLUDED.delivery_fees`,
            commission: sql`EXCLUDED.commission`,
            errorCharges: sql`EXCLUDED.error_charges`,
            offersOnItems: sql`EXCLUDED.offers_on_items`,
            deliveryOfferRedemptions: sql`EXCLUDED.delivery_offer_redemptions`,
            marketingCredits: sql`EXCLUDED.marketing_credits`,
            thirdPartyContribution: sql`EXCLUDED.third_party_contribution`,
            otherPayments: sql`EXCLUDED.other_payments`,
            otherPaymentsDescription: sql`EXCLUDED.other_payments_description`,
            marketingSpend: sql`EXCLUDED.marketing_spend`,
            totalPayout: sql`EXCLUDED.total_payout`,
            netPayment: sql`EXCLUDED.net_payment`,
            orderSource: sql`EXCLUDED.order_source`,
            uploadedAt: sql`EXCLUDED.uploaded_at`,
          },
        });
    }
  }

  async getDoordashTransactionsByClient(clientId: string): Promise<DoordashTransaction[]> {
    return await this.db
      .select()
      .from(doordashTransactions)
      .where(eq(doordashTransactions.clientId, clientId));
  }

  async deleteDoordashTransactionsByDateRange(clientId: string, startDate: string, endDate: string): Promise<number> {
    const result = await this.db
      .delete(doordashTransactions)
      .where(
        and(
          eq(doordashTransactions.clientId, clientId),
          sql`CAST(transaction_date AS DATE) >= ${startDate}`,
          sql`CAST(transaction_date AS DATE) <= ${endDate}`
        )
      );
    return result.rowCount || 0;
  }

  async createGrubhubTransaction(
    transaction: InsertGrubhubTransaction
  ): Promise<GrubhubTransaction> {
    const [created] = await this.db
      .insert(grubhubTransactions)
      .values(transaction)
      .returning();
    return created;
  }

  async createGrubhubTransactionsBatch(
    transactions: InsertGrubhubTransaction[]
  ): Promise<void> {
    if (transactions.length === 0) return;
    
    // Insert in chunks of 500, using upsert to prevent duplicates based on transaction_id
    const chunkSize = 500;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      await this.db.insert(grubhubTransactions)
        .values(chunk)
        .onConflictDoUpdate({
          target: [grubhubTransactions.clientId, grubhubTransactions.transactionId],
          set: {
            locationId: sql`EXCLUDED.location_id`,
            orderId: sql`EXCLUDED.order_id`,
            orderDate: sql`EXCLUDED.order_date`,
            transactionType: sql`EXCLUDED.transaction_type`,
            restaurant: sql`EXCLUDED.restaurant`,
            orderChannel: sql`EXCLUDED.order_channel`,
            fulfillmentType: sql`EXCLUDED.fulfillment_type`,
            subtotal: sql`EXCLUDED.subtotal`,
            subtotalSalesTax: sql`EXCLUDED.subtotal_sales_tax`,
            commission: sql`EXCLUDED.commission`,
            deliveryCommission: sql`EXCLUDED.delivery_commission`,
            processingFee: sql`EXCLUDED.processing_fee`,
            merchantFundedPromotion: sql`EXCLUDED.merchant_funded_promotion`,
            merchantNetTotal: sql`EXCLUDED.merchant_net_total`,
            transactionNote: sql`EXCLUDED.transaction_note`,
            customerType: sql`EXCLUDED.customer_type`,
            uploadedAt: sql`EXCLUDED.uploaded_at`,
          },
        });
    }
  }

  async getGrubhubTransactionsByClient(clientId: string): Promise<GrubhubTransaction[]> {
    return await this.db
      .select()
      .from(grubhubTransactions)
      .where(eq(grubhubTransactions.clientId, clientId));
  }

  async deleteGrubhubTransactionsByDateRange(clientId: string, startDate: string, endDate: string): Promise<number> {
    const result = await this.db
      .delete(grubhubTransactions)
      .where(
        and(
          eq(grubhubTransactions.clientId, clientId),
          sql`order_date >= ${startDate}`,
          sql`order_date <= ${endDate}`
        )
      );
    return result.rowCount || 0;
  }

  async getDashboardOverview(filters?: AnalyticsFilters): Promise<DashboardOverview> {
    // Build platform breakdown using SQL aggregation
    const platformBreakdown = [];
    const platforms: Array<"ubereats" | "doordash" | "grubhub"> = filters?.platform 
      ? [filters.platform]
      : ["ubereats", "doordash", "grubhub"];

    for (const platform of platforms) {
      if (platform === "doordash") {
        // DoorDash SQL aggregation
        const conditions = [];
        if (filters?.clientId) {
          conditions.push(eq(doordashTransactions.clientId, filters.clientId));
        }
        if (filters?.weekStart && filters?.weekEnd) {
          conditions.push(
            and(
              sql`${doordashTransactions.transactionDate} != ''`,
              sql`CAST(${doordashTransactions.transactionDate} AS DATE) >= ${filters.weekStart}`,
              sql`CAST(${doordashTransactions.transactionDate} AS DATE) <= ${filters.weekEnd}`
            )!
          );
        }
        if (filters?.locationTag) {
          const taggedLocations = await this.db
            .select({ id: locations.id })
            .from(locations)
            .where(eq(locations.locationTag, filters.locationTag));
          const locationIds = taggedLocations.map(l => l.id);
          if (locationIds.length > 0) {
            conditions.push(inArray(doordashTransactions.locationId, locationIds));
          } else {
            continue; // Skip this platform if no matching locations
          }
        }

        let query = this.db
          .select({
            totalOrders: sql<number>`
              COUNT(CASE 
                WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL)
                  AND ${doordashTransactions.transactionType} = 'Order'
                THEN 1 
              END)::int
            `,
            totalSales: sql<number>`
              COALESCE(SUM(CASE 
                WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL)
                  AND ${doordashTransactions.transactionType} = 'Order'
                THEN COALESCE(${doordashTransactions.salesExclTax}, ${doordashTransactions.orderSubtotal}, 0)
              END), 0)
            `,
            marketingDrivenSales: sql<number>`
              COALESCE(SUM(CASE 
                WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL)
                  AND ${doordashTransactions.transactionType} = 'Order'
                  AND COALESCE(${doordashTransactions.otherPayments}, 0) > 0
                THEN COALESCE(${doordashTransactions.salesExclTax}, ${doordashTransactions.orderSubtotal}, 0)
              END), 0)
            `,
            ordersFromMarketing: sql<number>`
              COUNT(CASE 
                WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL)
                  AND ${doordashTransactions.transactionType} = 'Order'
                  AND COALESCE(${doordashTransactions.otherPayments}, 0) > 0
                THEN 1 
              END)::int
            `,
            adSpend: sql<number>`
              COALESCE(SUM(CASE 
                WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL)
                  AND ${doordashTransactions.transactionType} = 'Order'
                THEN ABS(COALESCE(${doordashTransactions.otherPayments}, 0))
              END), 0)
            `,
            offerDiscountValue: sql<number>`
              COALESCE(SUM(CASE 
                WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL)
                  AND ${doordashTransactions.transactionType} = 'Order'
                THEN ABS(COALESCE(${doordashTransactions.offersOnItems}, 0)) + 
                     ABS(COALESCE(${doordashTransactions.deliveryOfferRedemptions}, 0)) +
                     COALESCE(${doordashTransactions.marketingCredits}, 0) +
                     COALESCE(${doordashTransactions.thirdPartyContribution}, 0)
              END), 0)
            `,
            netPayout: sql<number>`
              COALESCE(SUM(CASE 
                WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL)
                THEN COALESCE(${doordashTransactions.totalPayout}, ${doordashTransactions.netPayment}, 0)
              END), 0)
            `,
          })
          .from(doordashTransactions);
        
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        
        const result = await query;

        const metrics = result[0];
        const totalOrders = metrics.totalOrders || 0;
        const totalSales = metrics.totalSales || 0;
        const marketingDrivenSales = metrics.marketingDrivenSales || 0;
        const ordersFromMarketing = metrics.ordersFromMarketing || 0;
        const adSpend = metrics.adSpend || 0;
        const offerDiscountValue = metrics.offerDiscountValue || 0;
        const netPayout = metrics.netPayout || 0;
        const totalMarketingInvestment = adSpend + offerDiscountValue;

        platformBreakdown.push({
          platform,
          totalSales,
          marketingDrivenSales,
          organicSales: totalSales - marketingDrivenSales,
          totalOrders,
          ordersFromMarketing,
          organicOrders: totalOrders - ordersFromMarketing,
          aov: totalOrders > 0 ? totalSales / totalOrders : 0,
          adSpend,
          offerDiscountValue,
          totalMarketingInvestment,
          marketingInvestmentPercent: totalSales > 0 ? (totalMarketingInvestment / totalSales) * 100 : 0,
          marketingRoas: totalMarketingInvestment > 0 ? marketingDrivenSales / totalMarketingInvestment : 0,
          netPayout,
          netPayoutPercent: totalSales > 0 ? (netPayout / totalSales) * 100 : 0,
        });
      } else if (platform === "ubereats") {
        // For UberEats, we still need JavaScript date filtering due to M/D/YY format
        // But we can at least do SQL aggregation after fetching
        const conditions = [];
        if (filters?.clientId) {
          conditions.push(eq(uberEatsTransactions.clientId, filters.clientId));
        }
        if (filters?.locationTag) {
          const taggedLocations = await this.db
            .select({ id: locations.id })
            .from(locations)
            .where(eq(locations.locationTag, filters.locationTag));
          const locationIds = taggedLocations.map(l => l.id);
          if (locationIds.length > 0) {
            conditions.push(inArray(uberEatsTransactions.locationId, locationIds));
          } else {
            continue;
          }
        }

        const uberTxns = conditions.length > 0
          ? await this.db.select().from(uberEatsTransactions).where(and(...conditions))
          : await this.db.select().from(uberEatsTransactions);

        // Filter by date for UberEats if needed
        const filteredTxns = filters?.weekStart && filters?.weekEnd
          ? uberTxns.filter((t: any) => isUberEatsDateInRange(t.date, filters.weekStart, filters.weekEnd))
          : uberTxns;
        
        const metrics = calculateUberEatsMetrics(filteredTxns as UberEatsTransaction[]);
        
        // Add platform-level ad spend
        const adSpendConditions = [];
        if (filters?.clientId) {
          adSpendConditions.push(eq(platformAdSpend.clientId, filters.clientId));
        }
        adSpendConditions.push(eq(platformAdSpend.platform, 'ubereats'));

        const uberAdSpend = await this.db.select().from(platformAdSpend).where(and(...adSpendConditions));
        
        const platformAdSpendAmount = uberAdSpend
          .filter((ad: any) => filters?.weekStart && filters?.weekEnd
            ? isUberEatsDateInRange(ad.date, filters.weekStart, filters.weekEnd)
            : true)
          .reduce((sum: number, ad: any) => sum + (ad.adSpend || 0), 0);
        
        const totalAdSpend = metrics.adSpend + platformAdSpendAmount;
        const totalMarketingInvestment = totalAdSpend + metrics.offerDiscountValue;

        platformBreakdown.push({
          platform,
          totalSales: metrics.totalSales,
          marketingDrivenSales: metrics.marketingDrivenSales,
          organicSales: metrics.totalSales - metrics.marketingDrivenSales,
          totalOrders: metrics.totalOrders,
          ordersFromMarketing: metrics.ordersFromMarketing,
          organicOrders: metrics.totalOrders - metrics.ordersFromMarketing,
          aov: metrics.totalOrders > 0 ? metrics.totalSales / metrics.totalOrders : 0,
          adSpend: totalAdSpend,
          offerDiscountValue: metrics.offerDiscountValue,
          totalMarketingInvestment,
          marketingInvestmentPercent: metrics.totalSales > 0 ? (totalMarketingInvestment / metrics.totalSales) * 100 : 0,
          marketingRoas: totalMarketingInvestment > 0 ? metrics.marketingDrivenSales / totalMarketingInvestment : 0,
          netPayout: metrics.netPayout,
          netPayoutPercent: metrics.totalSales > 0 ? (metrics.netPayout / metrics.totalSales) * 100 : 0,
        });
      } else if (platform === "grubhub") {
        // Grubhub SQL aggregation
        const conditions = [];
        if (filters?.clientId) {
          conditions.push(eq(grubhubTransactions.clientId, filters.clientId));
        }
        if (filters?.weekStart && filters?.weekEnd) {
          conditions.push(
            and(
              sql`${grubhubTransactions.orderDate} >= ${filters.weekStart}`,
              sql`${grubhubTransactions.orderDate} <= ${filters.weekEnd}`
            )!
          );
        }
        if (filters?.locationTag) {
          const taggedLocations = await this.db
            .select({ id: locations.id })
            .from(locations)
            .where(eq(locations.locationTag, filters.locationTag));
          const locationIds = taggedLocations.map(l => l.id);
          if (locationIds.length > 0) {
            conditions.push(inArray(grubhubTransactions.locationId, locationIds));
          } else {
            continue;
          }
        }

        let grubQuery = this.db
          .select({
            totalOrders: sql<number>`
              COUNT(CASE WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' THEN 1 END)::int
            `,
            totalSales: sql<number>`
              COALESCE(SUM(CASE WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' THEN ${grubhubTransactions.saleAmount} END), 0)
            `,
            marketingDrivenSales: sql<number>`
              COALESCE(SUM(CASE 
                WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' 
                  AND COALESCE(${grubhubTransactions.merchantFundedPromotion}, 0) != 0
                THEN ${grubhubTransactions.saleAmount}
              END), 0)
            `,
            ordersFromMarketing: sql<number>`
              COUNT(CASE 
                WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' 
                  AND COALESCE(${grubhubTransactions.merchantFundedPromotion}, 0) != 0
                THEN 1 
              END)::int
            `,
            offerDiscountValue: sql<number>`
              COALESCE(SUM(CASE 
                WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order'
                THEN ABS(COALESCE(${grubhubTransactions.merchantFundedPromotion}, 0))
              END), 0)
            `,
            netPayout: sql<number>`COALESCE(SUM(${grubhubTransactions.merchantNetTotal}), 0)`,
          })
          .from(grubhubTransactions);
        
        if (conditions.length > 0) {
          grubQuery = grubQuery.where(and(...conditions));
        }
        
        const result = await grubQuery;

        const metrics = result[0];
        const totalOrders = metrics.totalOrders || 0;
        const totalSales = metrics.totalSales || 0;
        const marketingDrivenSales = metrics.marketingDrivenSales || 0;
        const ordersFromMarketing = metrics.ordersFromMarketing || 0;
        const offerDiscountValue = metrics.offerDiscountValue || 0;
        const netPayout = metrics.netPayout || 0;

        platformBreakdown.push({
          platform,
          totalSales,
          marketingDrivenSales,
          organicSales: totalSales - marketingDrivenSales,
          totalOrders,
          ordersFromMarketing,
          organicOrders: totalOrders - ordersFromMarketing,
          aov: totalOrders > 0 ? totalSales / totalOrders : 0,
          adSpend: 0, // Grubhub doesn't have ad spend
          offerDiscountValue,
          totalMarketingInvestment: offerDiscountValue,
          marketingInvestmentPercent: totalSales > 0 ? (offerDiscountValue / totalSales) * 100 : 0,
          marketingRoas: offerDiscountValue > 0 ? marketingDrivenSales / offerDiscountValue : 0,
          netPayout,
          netPayoutPercent: totalSales > 0 ? (netPayout / totalSales) * 100 : 0,
        });
      }
    }

    const totalSales = platformBreakdown.reduce((sum, p) => sum + p.totalSales, 0);
    const totalOrders = platformBreakdown.reduce((sum, p) => sum + p.totalOrders, 0);
    const totalMarketingInvestment = platformBreakdown.reduce(
      (sum, p) => sum + p.totalMarketingInvestment,
      0
    );
    const totalMarketingDrivenSales = platformBreakdown.reduce(
      (sum, p) => sum + p.marketingDrivenSales,
      0
    );
    const totalNetPayout = platformBreakdown.reduce((sum, p) => sum + p.netPayout, 0);

    return {
      totalSales,
      totalOrders,
      averageAov: totalOrders > 0 ? totalSales / totalOrders : 0,
      totalMarketingInvestment,
      blendedRoas:
        totalMarketingInvestment > 0 ? totalMarketingDrivenSales / totalMarketingInvestment : 0,
      netPayoutPercent: totalSales > 0 ? (totalNetPayout / totalSales) * 100 : 0,
      platformBreakdown,
    };
  }

  async getLocationMetrics(filters?: AnalyticsFilters): Promise<LocationMetrics[]> {
    // Build base location query for getting location names
    const locationConditions = [];
    
    if (filters?.clientId) {
      locationConditions.push(eq(locations.clientId, filters.clientId));
    }
    if (filters?.locationTag) {
      locationConditions.push(eq(locations.locationTag, filters.locationTag));
    }
    
    const allLocations = locationConditions.length > 0
      ? await this.db.select().from(locations).where(and(...locationConditions))
      : await this.getAllLocations();

    // Create location ID list for filtering
    const locationIds = allLocations.map(l => l.id);
    if (locationIds.length === 0) {
      return [];
    }

    const metrics: LocationMetrics[] = [];
    const platforms: Array<"ubereats" | "doordash" | "grubhub"> = filters?.platform 
      ? [filters.platform]
      : ["ubereats", "doordash", "grubhub"];

    // Process each platform with SQL aggregation
    for (const platform of platforms) {
      let platformMetrics: any[] = [];

      if (platform === "doordash") {
        // DoorDash SQL aggregation
        const doorConditions = [
          inArray(doordashTransactions.locationId, locationIds),
        ];
        
        if (filters?.clientId) {
          doorConditions.push(eq(doordashTransactions.clientId, filters.clientId));
        }
        if (filters?.weekStart && filters?.weekEnd) {
          doorConditions.push(
            sql`CAST(${doordashTransactions.transactionDate} AS DATE) >= ${filters.weekStart}`
          );
          doorConditions.push(
            sql`CAST(${doordashTransactions.transactionDate} AS DATE) <= ${filters.weekEnd}`
          );
        }

        platformMetrics = await this.db
          .select({
            locationId: doordashTransactions.locationId,
            // Count only Marketplace + Order transactions for order metrics
            totalOrders: sql<number>`COUNT(CASE WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL) AND ${doordashTransactions.transactionType} = 'Order' THEN 1 END)::int`,
            // Sum sales only for Marketplace + Order
            totalSales: sql<number>`COALESCE(SUM(CASE WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL) AND ${doordashTransactions.transactionType} = 'Order' THEN COALESCE(${doordashTransactions.salesExclTax}, ${doordashTransactions.orderSubtotal}, 0) END), 0)`,
            // Ad spend from other_payments (for Marketplace orders)
            adSpend: sql<number>`COALESCE(SUM(CASE WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL) AND ${doordashTransactions.transactionType} = 'Order' THEN ABS(COALESCE(${doordashTransactions.otherPayments}, 0)) END), 0)`,
            // Offer discount value (for Marketplace orders)
            offerDiscountValue: sql<number>`COALESCE(SUM(CASE WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL) AND ${doordashTransactions.transactionType} = 'Order' THEN ABS(COALESCE(${doordashTransactions.offersOnItems}, 0)) + ABS(COALESCE(${doordashTransactions.deliveryOfferRedemptions}, 0)) + COALESCE(${doordashTransactions.marketingCredits}, 0) + COALESCE(${doordashTransactions.thirdPartyContribution}, 0) END), 0)`,
            // Marketing-driven sales (orders with other_payments > 0)
            marketingDrivenSales: sql<number>`COALESCE(SUM(CASE WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL) AND ${doordashTransactions.transactionType} = 'Order' AND COALESCE(${doordashTransactions.otherPayments}, 0) > 0 THEN COALESCE(${doordashTransactions.salesExclTax}, ${doordashTransactions.orderSubtotal}, 0) END), 0)`,
            // Orders from marketing (orders with other_payments > 0)
            ordersFromMarketing: sql<number>`COUNT(CASE WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL) AND ${doordashTransactions.transactionType} = 'Order' AND COALESCE(${doordashTransactions.otherPayments}, 0) > 0 THEN 1 END)::int`,
            // Net payout for all Marketplace transactions (all statuses)
            netPayout: sql<number>`COALESCE(SUM(CASE WHEN (${doordashTransactions.channel} = 'Marketplace' OR ${doordashTransactions.channel} IS NULL) THEN COALESCE(${doordashTransactions.totalPayout}, ${doordashTransactions.netPayment}, 0) END), 0)`,
          })
          .from(doordashTransactions)
          .where(and(...doorConditions))
          .groupBy(doordashTransactions.locationId);

      } else if (platform === "ubereats") {
        // Uber Eats SQL aggregation
        const uberConditions = [
          inArray(uberEatsTransactions.locationId, locationIds),
        ];
        
        if (filters?.clientId) {
          uberConditions.push(eq(uberEatsTransactions.clientId, filters.clientId));
        }
        // Note: Date filtering for Uber Eats happens in JavaScript due to M/D/YY format

        platformMetrics = await this.db
          .select({
            locationId: uberEatsTransactions.locationId,
            // Count only Completed orders
            totalOrders: sql<number>`COUNT(CASE WHEN ${uberEatsTransactions.orderStatus} = 'Completed' THEN 1 END)::int`,
            // Sum sales only for Completed
            totalSales: sql<number>`COALESCE(SUM(CASE WHEN ${uberEatsTransactions.orderStatus} = 'Completed' THEN COALESCE(${uberEatsTransactions.subtotal}, 0) END), 0)`,
            // Ad spend (can include NULL order_status rows)
            adSpend: sql<number>`COALESCE(SUM(CASE WHEN ${uberEatsTransactions.otherPaymentsDescription} IS NOT NULL AND COALESCE(${uberEatsTransactions.otherPayments}, 0) > 0 AND LOWER(${uberEatsTransactions.otherPaymentsDescription}) ~ '\\y(ad|ads|advertising|paid\\s*promotion|ad\\s*spend|ad\\s*fee|ad\\s*campaign)\\y' AND LOWER(${uberEatsTransactions.otherPaymentsDescription}) !~ '\\y(adjust|added|upgrade)\\y' THEN ${uberEatsTransactions.otherPayments} END), 0)`,
            // Offer discount value (for Completed orders)
            offerDiscountValue: sql<number>`COALESCE(SUM(CASE WHEN ${uberEatsTransactions.orderStatus} = 'Completed' THEN ABS(COALESCE(${uberEatsTransactions.offersOnItems}, 0)) + ABS(COALESCE(${uberEatsTransactions.deliveryOfferRedemptions}, 0)) + COALESCE(${uberEatsTransactions.offerRedemptionFee}, 0) END), 0)`,
            // Marketing-driven sales (Completed orders with offers or ads)
            marketingDrivenSales: sql<number>`COALESCE(SUM(CASE WHEN ${uberEatsTransactions.orderStatus} = 'Completed' AND (COALESCE(${uberEatsTransactions.offersOnItems}, 0) != 0 OR COALESCE(${uberEatsTransactions.deliveryOfferRedemptions}, 0) != 0 OR COALESCE(${uberEatsTransactions.offerRedemptionFee}, 0) != 0) THEN COALESCE(${uberEatsTransactions.subtotal}, 0) END), 0)`,
            // Orders from marketing
            ordersFromMarketing: sql<number>`COUNT(CASE WHEN ${uberEatsTransactions.orderStatus} = 'Completed' AND (COALESCE(${uberEatsTransactions.offersOnItems}, 0) != 0 OR COALESCE(${uberEatsTransactions.deliveryOfferRedemptions}, 0) != 0 OR COALESCE(${uberEatsTransactions.offerRedemptionFee}, 0) != 0) THEN 1 END)::int`,
            // Net payout for Completed orders
            netPayout: sql<number>`COALESCE(SUM(CASE WHEN ${uberEatsTransactions.orderStatus} = 'Completed' THEN COALESCE(${uberEatsTransactions.netPayout}, 0) END), 0)`,
          })
          .from(uberEatsTransactions)
          .where(and(...uberConditions))
          .groupBy(uberEatsTransactions.locationId);

        // Apply Uber Eats date filtering in JavaScript if needed
        if (filters?.weekStart && filters?.weekEnd) {
          // Fetch raw data to filter by date
          const rawData = await this.db
            .select()
            .from(uberEatsTransactions)
            .where(and(...uberConditions));
          
          const filteredByDate = rawData.filter(t => 
            isUberEatsDateInRange(t.date, filters.weekStart!, filters.weekEnd!)
          );

          // Recalculate metrics with filtered data
          const metricsByLocation = new Map<string, any>();
          for (const t of filteredByDate) {
            if (!t.locationId) continue;
            
            if (!metricsByLocation.has(t.locationId)) {
              metricsByLocation.set(t.locationId, {
                locationId: t.locationId,
                totalOrders: 0,
                totalSales: 0,
                adSpend: 0,
                offerDiscountValue: 0,
                marketingDrivenSales: 0,
                ordersFromMarketing: 0,
                netPayout: 0,
              });
            }

            const m = metricsByLocation.get(t.locationId)!;
            
            // Ad spend check
            if (t.otherPaymentsDescription && (t.otherPayments || 0) > 0) {
              if (isUberEatsAdRelatedDescription(t.otherPaymentsDescription)) {
                m.adSpend += t.otherPayments;
              }
            }

            // Only count Completed orders
            if (t.orderStatus === 'Completed') {
              m.totalOrders++;
              const sales = t.subtotal || 0;
              m.totalSales += sales;
              m.netPayout += t.netPayout || 0;

              const offersValue = Math.abs(t.offersOnItems || 0) + 
                                Math.abs(t.deliveryOfferRedemptions || 0) +
                                (t.offerRedemptionFee || 0);
              m.offerDiscountValue += offersValue;

              if (offersValue > 0) {
                m.marketingDrivenSales += sales;
                m.ordersFromMarketing++;
              }
            }
          }

          platformMetrics = Array.from(metricsByLocation.values());
        }

      } else if (platform === "grubhub") {
        // Grubhub SQL aggregation
        const grubConditions = [
          inArray(grubhubTransactions.locationId, locationIds),
        ];
        
        if (filters?.clientId) {
          grubConditions.push(eq(grubhubTransactions.clientId, filters.clientId));
        }
        if (filters?.weekStart && filters?.weekEnd) {
          grubConditions.push(
            sql`${grubhubTransactions.orderDate} >= ${filters.weekStart}`
          );
          grubConditions.push(
            sql`${grubhubTransactions.orderDate} <= ${filters.weekEnd}`
          );
        }

        platformMetrics = await this.db
          .select({
            locationId: grubhubTransactions.locationId,
            // Count only Prepaid Order for order metrics
            totalOrders: sql<number>`COUNT(CASE WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' THEN 1 END)::int`,
            // Sum sales only for Prepaid Order
            totalSales: sql<number>`COALESCE(SUM(CASE WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' THEN COALESCE(${grubhubTransactions.saleAmount}, 0) END), 0)`,
            // Offer discount value (for Prepaid Order)
            offerDiscountValue: sql<number>`COALESCE(SUM(CASE WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' AND COALESCE(${grubhubTransactions.merchantFundedPromotion}, 0) != 0 THEN ABS(${grubhubTransactions.merchantFundedPromotion}) END), 0)`,
            // Marketing-driven sales (Prepaid Order with merchant_funded_promotion != 0)
            marketingDrivenSales: sql<number>`COALESCE(SUM(CASE WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' AND COALESCE(${grubhubTransactions.merchantFundedPromotion}, 0) != 0 THEN COALESCE(${grubhubTransactions.saleAmount}, 0) END), 0)`,
            // Orders from marketing
            ordersFromMarketing: sql<number>`COUNT(CASE WHEN ${grubhubTransactions.transactionType} = 'Prepaid Order' AND COALESCE(${grubhubTransactions.merchantFundedPromotion}, 0) != 0 THEN 1 END)::int`,
            // Net payout for ALL transaction types
            netPayout: sql<number>`COALESCE(SUM(COALESCE(${grubhubTransactions.merchantNetTotal}, 0)), 0)`,
            adSpend: sql<number>`0`, // Grubhub doesn't have ad spend
          })
          .from(grubhubTransactions)
          .where(and(...grubConditions))
          .groupBy(grubhubTransactions.locationId);
      }

      // Convert platform metrics to LocationMetrics
      for (const pm of platformMetrics) {
        if (!pm.locationId) continue;
        
        const location = allLocations.find(l => l.id === pm.locationId);
        if (!location) continue;

        const totalMarketingInvestment = (pm.adSpend || 0) + (pm.offerDiscountValue || 0);

        metrics.push({
          locationId: pm.locationId,
          locationName: location.canonicalName,
          platform,
          totalSales: pm.totalSales || 0,
          marketingDrivenSales: pm.marketingDrivenSales || 0,
          organicSales: (pm.totalSales || 0) - (pm.marketingDrivenSales || 0),
          totalOrders: pm.totalOrders || 0,
          ordersFromMarketing: pm.ordersFromMarketing || 0,
          organicOrders: (pm.totalOrders || 0) - (pm.ordersFromMarketing || 0),
          aov: (pm.totalOrders || 0) > 0 ? (pm.totalSales || 0) / (pm.totalOrders || 0) : 0,
          adSpend: pm.adSpend || 0,
          offerDiscountValue: pm.offerDiscountValue || 0,
          totalMarketingInvestment,
          marketingInvestmentPercent: (pm.totalSales || 0) > 0 ? (totalMarketingInvestment / (pm.totalSales || 0)) * 100 : 0,
          marketingRoas: totalMarketingInvestment > 0 ? (pm.marketingDrivenSales || 0) / totalMarketingInvestment : 0,
          netPayout: pm.netPayout || 0,
          netPayoutPercent: (pm.totalSales || 0) > 0 ? ((pm.netPayout || 0) / (pm.totalSales || 0)) * 100 : 0,
        });
      }
    }

    return metrics;
  }

  async getConsolidatedLocationMetrics(filters?: AnalyticsFilters): Promise<ConsolidatedLocationMetrics[]> {
    // Delegate to memory storage implementation by:
    // 1. Get per-platform metrics
    const platformMetrics = await this.getLocationMetrics(filters);
    
    //  2. Get all locations
    let locations = filters?.clientId
      ? await this.getLocationsByClient(filters.clientId)
      : await this.getAllLocations();

    // Filter by locationTag if specified
    if (filters?.locationTag) {
      locations = locations.filter(l => l.locationTag === filters.locationTag);
    }

    // 3. Group by canonical name
    const grouped = new Map<string, ConsolidatedLocationMetrics>();

    for (const metric of platformMetrics) {
      const location = locations.find(l => l.id === metric.locationId);
      if (!location) continue;

      const key = location.canonicalName || metric.locationName;
      
      if (!grouped.has(key)) {
        grouped.set(key, {
          canonicalName: location.canonicalName || null,
          location: key,
          totalSales: 0,
          totalOrders: 0,
          aov: 0,
          totalMarketingInvestment: 0,
          marketingDrivenSales: 0,
          marketingRoas: 0,
          netPayout: 0,
          netPayoutPercent: 0,
          platformBreakdown: {},
        });
      }

      const consolidated = grouped.get(key)!;
      
      // Aggregate totals
      consolidated.totalSales += metric.totalSales;
      consolidated.totalOrders += metric.totalOrders;
      consolidated.totalMarketingInvestment += metric.totalMarketingInvestment;
      consolidated.marketingDrivenSales = (consolidated.marketingDrivenSales || 0) + metric.marketingDrivenSales;
      consolidated.netPayout += metric.netPayout;

      // Store platform-specific metrics
      consolidated.platformBreakdown[metric.platform] = {
        platform: metric.platform,
        totalSales: metric.totalSales,
        marketingDrivenSales: metric.marketingDrivenSales,
        organicSales: metric.organicSales,
        totalOrders: metric.totalOrders,
        ordersFromMarketing: metric.ordersFromMarketing,
        organicOrders: metric.organicOrders,
        aov: metric.aov,
        adSpend: metric.adSpend,
        offerDiscountValue: metric.offerDiscountValue,
        totalMarketingInvestment: metric.totalMarketingInvestment,
        marketingInvestmentPercent: metric.marketingInvestmentPercent,
        marketingRoas: metric.marketingRoas,
        netPayout: metric.netPayout,
        netPayoutPercent: metric.netPayoutPercent,
      };
    }

    // Calculate consolidated metrics
    const results = Array.from(grouped.values()).map((item, index) => {
      return {
        ...item,
        aov: item.totalOrders > 0 ? item.totalSales / item.totalOrders : 0,
        marketingRoas: item.totalMarketingInvestment > 0 ? 
          (item.marketingDrivenSales || 0) / item.totalMarketingInvestment : 0,
        netPayoutPercent: item.totalSales > 0 ? 
          (item.netPayout / item.totalSales) * 100 : 0,
      };
    });

    return results;
  }

  async getLocationMatchSuggestions(clientId?: string): Promise<LocationMatchSuggestion[]> {
    // Get all unlinked transactions
    const [uberTxns, doorTxns, grubTxns, allLocations] = await Promise.all([
      clientId
        ? this.db
            .select()
            .from(uberEatsTransactions)
            .where(
              and(eq(uberEatsTransactions.clientId, clientId), sql`${uberEatsTransactions.locationId} IS NULL`)
            )
        : this.db.select().from(uberEatsTransactions).where(sql`${uberEatsTransactions.locationId} IS NULL`),
      clientId
        ? this.db
            .select()
            .from(doordashTransactions)
            .where(
              and(eq(doordashTransactions.clientId, clientId), sql`${doordashTransactions.locationId} IS NULL`)
            )
        : this.db.select().from(doordashTransactions).where(sql`${doordashTransactions.locationId} IS NULL`),
      clientId
        ? this.db
            .select()
            .from(grubhubTransactions)
            .where(
              and(eq(grubhubTransactions.clientId, clientId), sql`${grubhubTransactions.locationId} IS NULL`)
            )
        : this.db.select().from(grubhubTransactions).where(sql`${grubhubTransactions.locationId} IS NULL`),
      clientId ? this.getLocationsByClient(clientId) : this.getAllLocations(),
    ]);

    const suggestions: LocationMatchSuggestion[] = [];

    // Helper function to calculate string similarity
    const similarity = (s1: string, s2: string): number => {
      const longer = s1.length > s2.length ? s1 : s2;
      const shorter = s1.length > s2.length ? s2 : s1;
      const longerLength = longer.length;
      if (longerLength === 0) return 1.0;
      return (longerLength - editDistance(longer, shorter)) / longerLength;
    };

    const editDistance = (s1: string, s2: string): number => {
      s1 = s1.toLowerCase();
      s2 = s2.toLowerCase();
      const costs: number[] = [];
      for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
          if (i === 0) costs[j] = j;
          else if (j > 0) {
            let newValue = costs[j - 1];
            if (s1.charAt(i - 1) !== s2.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
        if (i > 0) costs[s2.length] = lastValue;
      }
      return costs[s2.length];
    };

    // Process Uber Eats
    const uberLocationCounts = new Map<string, number>();
    uberTxns.forEach((t) => {
      uberLocationCounts.set(t.location, (uberLocationCounts.get(t.location) || 0) + 1);
    });
    uberLocationCounts.forEach((count, locationName) => {
      let bestMatch: { id: string; name: string; confidence: number } | null = null;
      for (const loc of allLocations) {
        const confidence = similarity(locationName, loc.canonicalName);
        if (confidence >= 0.8 && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { id: loc.id, name: loc.canonicalName, confidence };
        }
      }
      suggestions.push({
        locationName,
        platform: "ubereats",
        matchedLocationId: bestMatch?.id,
        matchedLocationName: bestMatch?.name,
        confidence: bestMatch?.confidence || 0,
        orderCount: count,
      });
    });

    // Process DoorDash
    const doorLocationCounts = new Map<string, number>();
    doorTxns.forEach((t) => {
      doorLocationCounts.set(t.storeLocation, (doorLocationCounts.get(t.storeLocation) || 0) + 1);
    });
    doorLocationCounts.forEach((count, locationName) => {
      let bestMatch: { id: string; name: string; confidence: number } | null = null;
      for (const loc of allLocations) {
        const confidence = similarity(locationName, loc.canonicalName);
        if (confidence >= 0.8 && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { id: loc.id, name: loc.canonicalName, confidence };
        }
      }
      suggestions.push({
        locationName,
        platform: "doordash",
        matchedLocationId: bestMatch?.id,
        matchedLocationName: bestMatch?.name,
        confidence: bestMatch?.confidence || 0,
        orderCount: count,
      });
    });

    // Process Grubhub
    const grubLocationCounts = new Map<string, number>();
    grubTxns.forEach((t) => {
      grubLocationCounts.set(t.restaurant, (grubLocationCounts.get(t.restaurant) || 0) + 1);
    });
    grubLocationCounts.forEach((count, locationName) => {
      let bestMatch: { id: string; name: string; confidence: number } | null = null;
      for (const loc of allLocations) {
        const confidence = similarity(locationName, loc.canonicalName);
        if (confidence >= 0.8 && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { id: loc.id, name: loc.canonicalName, confidence };
        }
      }
      suggestions.push({
        locationName,
        platform: "grubhub",
        matchedLocationId: bestMatch?.id,
        matchedLocationName: bestMatch?.name,
        confidence: bestMatch?.confidence || 0,
        orderCount: count,
      });
    });

    return suggestions;
  }

  async getClientPerformance(): Promise<
    Array<{
      clientId: string;
      clientName: string;
      totalSales: number;
      totalOrders: number;
      roas: number;
    }>
  > {
    const allClients = await this.getAllClients();
    const results = [];

    for (const client of allClients) {
      const overview = await this.getDashboardOverview({ clientId: client.id });
      results.push({
        clientId: client.id,
        clientName: client.name,
        totalSales: overview.totalSales,
        totalOrders: overview.totalOrders,
        roas: overview.blendedRoas,
      });
    }

    return results;
  }

  async createPromotion(promotion: InsertPromotion): Promise<Promotion> {
    const [created] = await this.db.insert(promotions).values(promotion).returning();
    return created;
  }

  async getPromotion(id: string): Promise<Promotion | undefined> {
    const [promo] = await this.db.select().from(promotions).where(eq(promotions.id, id));
    return promo;
  }

  async getPromotionByCampaignId(campaignId: string): Promise<Promotion | undefined> {
    const [promo] = await this.db
      .select()
      .from(promotions)
      .where(eq(promotions.campaignId, campaignId));
    return promo;
  }

  async getAllPromotions(clientId?: string): Promise<Promotion[]> {
    if (clientId) {
      return await this.db.select().from(promotions).where(eq(promotions.clientId, clientId));
    }
    return await this.db.select().from(promotions);
  }

  async updatePromotion(
    id: string,
    updates: Partial<InsertPromotion>
  ): Promise<Promotion | undefined> {
    const [updated] = await this.db
      .update(promotions)
      .set(updates)
      .where(eq(promotions.id, id))
      .returning();
    return updated;
  }

  async deletePromotion(id: string): Promise<boolean> {
    const result = await this.db.delete(promotions).where(eq(promotions.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getPromotionMetrics(filters?: AnalyticsFilters): Promise<PromotionMetrics[]> {
    const promos = await this.getAllPromotions(filters?.clientId);
    const metrics: PromotionMetrics[] = [];

    for (const promo of promos) {
      const campaignMetrics = await this.db
        .select()
        .from(campaignLocationMetrics)
        .where(
          and(
            eq(campaignLocationMetrics.campaignId, promo.campaignId || ""),
            eq(campaignLocationMetrics.campaignType, "promotion")
          )
        );

      const orders = campaignMetrics.reduce((sum, m) => sum + m.orders, 0);
      const revenue = campaignMetrics.reduce((sum, m) => sum + m.revenue, 0);
      const spend = campaignMetrics.reduce((sum, m) => sum + m.spend, 0);
      const discount = campaignMetrics.reduce((sum, m) => sum + (m.discount || 0), 0);
      const newCustomers = campaignMetrics.reduce((sum, m) => sum + (m.newCustomers || 0), 0);
      const totalCost = discount + spend;

      metrics.push({
        ...promo,
        orders,
        revenueImpact: revenue,
        discountCost: discount,
        marketingFees: spend,
        totalCost,
        newCustomers,
        roi: totalCost > 0 ? ((revenue - totalCost) / totalCost) * 100 : 0,
      });
    }

    return metrics;
  }

  async createPaidAdCampaign(campaign: InsertPaidAdCampaign): Promise<PaidAdCampaign> {
    const [created] = await this.db.insert(paidAdCampaigns).values(campaign).returning();
    return created;
  }

  async getPaidAdCampaign(id: string): Promise<PaidAdCampaign | undefined> {
    const [campaign] = await this.db.select().from(paidAdCampaigns).where(eq(paidAdCampaigns.id, id));
    return campaign;
  }

  async getPaidAdCampaignByCampaignId(campaignId: string): Promise<PaidAdCampaign | undefined> {
    const [campaign] = await this.db
      .select()
      .from(paidAdCampaigns)
      .where(eq(paidAdCampaigns.campaignId, campaignId));
    return campaign;
  }

  async getAllPaidAdCampaigns(clientId?: string): Promise<PaidAdCampaign[]> {
    if (clientId) {
      return await this.db
        .select()
        .from(paidAdCampaigns)
        .where(eq(paidAdCampaigns.clientId, clientId));
    }
    return await this.db.select().from(paidAdCampaigns);
  }

  async updatePaidAdCampaign(
    id: string,
    updates: Partial<InsertPaidAdCampaign>
  ): Promise<PaidAdCampaign | undefined> {
    const [updated] = await this.db
      .update(paidAdCampaigns)
      .set(updates)
      .where(eq(paidAdCampaigns.id, id))
      .returning();
    return updated;
  }

  async deletePaidAdCampaign(id: string): Promise<boolean> {
    const result = await this.db.delete(paidAdCampaigns).where(eq(paidAdCampaigns.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getPaidAdCampaignMetrics(filters?: AnalyticsFilters): Promise<PaidAdCampaignMetrics[]> {
    return await this.getAllPaidAdCampaigns(filters?.clientId);
  }

  async createCampaignLocationMetric(
    metric: InsertCampaignLocationMetric
  ): Promise<CampaignLocationMetric> {
    const [created] = await this.db
      .insert(campaignLocationMetrics)
      .values(metric)
      .returning();
    return created;
  }

  async getCampaignLocationMetrics(clientId?: string): Promise<CampaignLocationMetric[]> {
    if (clientId) {
      return await this.db
        .select()
        .from(campaignLocationMetrics)
        .where(eq(campaignLocationMetrics.clientId, clientId));
    }
    return await this.db.select().from(campaignLocationMetrics);
  }

  async getCampaignLocationMetricByKey(
    campaignId: string,
    locationId: string | null,
    dateStart: string | null
  ): Promise<CampaignLocationMetric | undefined> {
    const conditions = [eq(campaignLocationMetrics.campaignId, campaignId)];

    if (locationId) {
      conditions.push(eq(campaignLocationMetrics.locationId, locationId));
    } else {
      conditions.push(sql`${campaignLocationMetrics.locationId} IS NULL`);
    }

    if (dateStart) {
      conditions.push(eq(campaignLocationMetrics.dateStart, dateStart));
    } else {
      conditions.push(sql`${campaignLocationMetrics.dateStart} IS NULL`);
    }

    const [metric] = await this.db
      .select()
      .from(campaignLocationMetrics)
      .where(and(...conditions));

    return metric;
  }

  async createLocationWeeklyFinancial(
    financial: InsertLocationWeeklyFinancial
  ): Promise<LocationWeeklyFinancial> {
    const [created] = await this.db
      .insert(locationWeeklyFinancials)
      .values(financial)
      .returning();
    return created;
  }

  async getLocationWeeklyFinancials(locationId: string): Promise<LocationWeeklyFinancial[]> {
    return await this.db
      .select()
      .from(locationWeeklyFinancials)
      .where(eq(locationWeeklyFinancials.locationId, locationId))
      .orderBy(desc(locationWeeklyFinancials.weekStartDate));
  }

  async getLocationWeeklyFinancialsByClient(
    clientId: string
  ): Promise<LocationWeeklyFinancial[]> {
    return await this.db
      .select()
      .from(locationWeeklyFinancials)
      .where(eq(locationWeeklyFinancials.clientId, clientId))
      .orderBy(desc(locationWeeklyFinancials.weekStartDate));
  }

  async deleteLocationWeeklyFinancialsByClient(clientId: string): Promise<number> {
    const result = await this.db
      .delete(locationWeeklyFinancials)
      .where(eq(locationWeeklyFinancials.clientId, clientId));
    return result.rowCount || 0;
  }

  async getAvailableWeeks(): Promise<Array<{ weekStart: string; weekEnd: string }>> {
    const allDates: Date[] = [];

    // Collect dates from Uber Eats transactions
    const uberTxns = await this.db.select().from(uberEatsTransactions);
    uberTxns.forEach(t => {
      if (!t.date || t.date.trim() === '') return;
      const [month, day, year] = t.date.split('/');
      if (!month || !day || !year) return;
      // Convert 2-digit year to 4-digit
      // For years 00-29, assume 2000-2029; for 30-99, assume 1930-1999
      // But since we filter >= 2020, effectively only 20-29 will pass
      let fullYear = year;
      if (year.length === 2) {
        const yearNum = parseInt(year, 10);
        fullYear = yearNum < 30 ? `20${year}` : `19${year}`;
      }
      const date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
        allDates.push(date);
      }
    });

    // Collect dates from DoorDash transactions
    const doorDashTxns = await this.db.select().from(doordashTransactions);
    doorDashTxns.forEach(t => {
      if (!t.transactionDate || t.transactionDate.trim() === '') return;
      const date = new Date(t.transactionDate);
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
        allDates.push(date);
      }
    });

    // Collect dates from Grubhub transactions
    const grubhubTxns = await this.db.select().from(grubhubTransactions);
    grubhubTxns.forEach(t => {
      if (!t.orderDate || t.orderDate.trim() === '') return;
      const date = new Date(t.orderDate);
      if (!isNaN(date.getTime()) && date.getFullYear() >= 2020) {
        allDates.push(date);
      }
    });

    if (allDates.length === 0) {
      return [];
    }

    // Use shared utility to get unique weeks (Monday to Sunday, UTC-safe)
    return getUniqueWeeks(allDates);
  }
}
