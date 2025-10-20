import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, sql, desc, inArray, gte, lte } from "drizzle-orm";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
import {
  clients,
  locations,
  uberEatsTransactions,
  doordashTransactions,
  grubhubTransactions,
  promotions,
  paidAdCampaigns,
  campaignLocationMetrics,
  locationWeeklyFinancials,
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
    // Order Filtering: ONLY count "Completed" orders for sales metrics
    const isCompleted = t.orderStatus === "Completed";
    
    // Net Payout: Sum ALL order statuses (Completed, Refund, Cancelled, etc.)
    netPayout += t.netPayout || 0;
    
    // Only count Completed orders for sales and order metrics
    if (isCompleted) {
      totalOrders++;
      
      // Sales Calculation: Use "Sales (excl. tax)" as primary metric
      const sales = t.salesExclTax || t.subtotal || 0;
      totalSales += sales;
      
      // Ad Spend: Sum ALL "Other payments" where description is not null
      if (t.otherPaymentsDescription) {
        adSpend += Math.abs(t.otherPayments || 0);
      }
      
      // Offer/Discount Value: Sum absolute value of all promotional discounts
      const offersValue = Math.abs(t.offersOnItems || 0) + 
                        Math.abs(t.deliveryOfferRedemptions || 0);
      offerDiscountValue += offersValue;
      
      // Marketing Attribution: Orders with promotional offers < 0
      const hasMarketing = (t.offersOnItems < 0) || (t.deliveryOfferRedemptions < 0);
      
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

// Helper function to calculate DoorDash metrics using consistent attribution logic
export function calculateDoorDashMetrics(txns: DoordashTransaction[]) {
  let totalOrders = 0;
  let totalSales = 0;
  let marketingDrivenSales = 0;
  let adSpend = 0;
  let offerDiscountValue = 0;
  let netPayout = 0;
  let ordersFromMarketing = 0;

  txns.forEach((t) => {
    const isMarketplace = !t.channel || t.channel === "Marketplace";
    const isCompleted = t.orderStatus === "Completed";
    
    // Net payout for Marketplace orders only (all statuses)
    if (isMarketplace) {
      netPayout += t.totalPayout || t.netPayment || 0;
    }
    
    // Only count Marketplace + Completed for sales and order metrics
    if (isMarketplace && isCompleted) {
      totalOrders++;
      const sales = t.salesExclTax || t.orderSubtotal || 0;
      totalSales += sales;
      
      // Ad Spend: Sum ALL "Other payments" where description is not null (updated methodology)
      if (t.otherPaymentsDescription) {
        adSpend += Math.abs(t.otherPayments || 0);
      }
      
      // Offer/Discount Value: Promotional discounts + credits (absolute values)
      const offersValue = Math.abs(t.offersOnItems || 0) + 
                        Math.abs(t.deliveryOfferRedemptions || 0) +
                        Math.abs(t.marketingCredits || 0) +
                        Math.abs(t.thirdPartyContribution || 0);
      offerDiscountValue += offersValue;
      
      // Marketing Attribution: Orders with promotional offers < 0 OR credits > 0
      const hasMarketing = (t.offersOnItems < 0) || 
                          (t.deliveryOfferRedemptions < 0) || 
                          (t.marketingCredits !== 0) || 
                          (t.thirdPartyContribution !== 0);
      
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
    
    // Insert in chunks of 500, using upsert to prevent duplicates
    const chunkSize = 500;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      await this.db.insert(uberEatsTransactions)
        .values(chunk)
        .onConflictDoUpdate({
          target: [uberEatsTransactions.clientId, uberEatsTransactions.orderId, uberEatsTransactions.date],
          set: {
            locationId: sql`EXCLUDED.location_id`,
            time: sql`EXCLUDED.time`,
            location: sql`EXCLUDED.location`,
            subtotal: sql`EXCLUDED.subtotal`,
            tax: sql`EXCLUDED.tax`,
            deliveryFee: sql`EXCLUDED.delivery_fee`,
            serviceFee: sql`EXCLUDED.service_fee`,
            marketingPromo: sql`EXCLUDED.marketing_promo`,
            marketingAmount: sql`EXCLUDED.marketing_amount`,
            platformFee: sql`EXCLUDED.platform_fee`,
            netPayout: sql`EXCLUDED.net_payout`,
            customerRating: sql`EXCLUDED.customer_rating`,
            uploadedAt: sql`EXCLUDED.uploaded_at`,
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
          sql`transaction_date >= ${startDate}`,
          sql`transaction_date <= ${endDate}`
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
    // Build query conditions for each platform
    const uberConditions = [];
    const doorConditions = [];
    const grubConditions = [];

    if (filters?.clientId) {
      uberConditions.push(eq(uberEatsTransactions.clientId, filters.clientId));
      doorConditions.push(eq(doordashTransactions.clientId, filters.clientId));
      grubConditions.push(eq(grubhubTransactions.clientId, filters.clientId));
    }

    // Add date range filtering
    if (filters?.weekStart && filters?.weekEnd) {
      doorConditions.push(
        and(
          sql`${doordashTransactions.transactionDate} >= ${filters.weekStart}`,
          sql`${doordashTransactions.transactionDate} <= ${filters.weekEnd}`
        )!
      );
      grubConditions.push(
        and(
          sql`${grubhubTransactions.orderDate} >= ${filters.weekStart}`,
          sql`${grubhubTransactions.orderDate} <= ${filters.weekEnd}`
        )!
      );
      // UberEats dates are in different format (M/D/YY), handled differently
    }

    if (filters?.locationTag) {
      const taggedLocations = await this.db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.locationTag, filters.locationTag));
      const locationIds = taggedLocations.map(l => l.id);
      
      if (locationIds.length > 0) {
        uberConditions.push(inArray(uberEatsTransactions.locationId, locationIds));
        doorConditions.push(inArray(doordashTransactions.locationId, locationIds));
        grubConditions.push(inArray(grubhubTransactions.locationId, locationIds));
      } else {
        // No locations match the tag - return empty data
        return {
          totalSales: 0,
          totalOrders: 0,
          averageAov: 0,
          totalMarketingInvestment: 0,
          blendedRoas: 0,
          netPayoutPercent: 0,
          platformBreakdown: [],
        };
      }
    }

    // Fetch filtered transactions
    const [uberTxns, doorTxns, grubTxns] = await Promise.all([
      uberConditions.length > 0
        ? this.db.select().from(uberEatsTransactions).where(and(...uberConditions))
        : this.db.select().from(uberEatsTransactions),
      doorConditions.length > 0
        ? this.db.select().from(doordashTransactions).where(and(...doorConditions))
        : this.db.select().from(doordashTransactions),
      grubConditions.length > 0
        ? this.db.select().from(grubhubTransactions).where(and(...grubConditions))
        : this.db.select().from(grubhubTransactions),
    ]);

    const calculatePlatformMetrics = (
      txns: any[],
      platform: "ubereats" | "doordash" | "grubhub",
      dateFilter?: { weekStart: string; weekEnd: string }
    ) => {
      if (platform === "ubereats") {
        // Filter by date for UberEats if needed
        const filteredTxns = dateFilter 
          ? txns.filter((t: any) => isUberEatsDateInRange(t.date, dateFilter.weekStart, dateFilter.weekEnd))
          : txns;
        
        // Use shared helper for consistent UberEats attribution
        const metrics = calculateUberEatsMetrics(filteredTxns as UberEatsTransaction[]);
        return {
          platform,
          totalSales: metrics.totalSales,
          marketingDrivenSales: metrics.marketingDrivenSales,
          organicSales: metrics.totalSales - metrics.marketingDrivenSales,
          totalOrders: metrics.totalOrders,
          ordersFromMarketing: metrics.ordersFromMarketing,
          organicOrders: metrics.totalOrders - metrics.ordersFromMarketing,
          aov: metrics.totalOrders > 0 ? metrics.totalSales / metrics.totalOrders : 0,
          adSpend: metrics.adSpend,
          offerDiscountValue: metrics.offerDiscountValue,
          totalMarketingInvestment: metrics.adSpend + metrics.offerDiscountValue,
          marketingInvestmentPercent:
            metrics.totalSales > 0 ? ((metrics.adSpend + metrics.offerDiscountValue) / metrics.totalSales) * 100 : 0,
          marketingRoas:
            (metrics.adSpend + metrics.offerDiscountValue) > 0
              ? metrics.marketingDrivenSales / (metrics.adSpend + metrics.offerDiscountValue)
              : 0,
          netPayout: metrics.netPayout,
          netPayoutPercent: metrics.totalSales > 0 ? (metrics.netPayout / metrics.totalSales) * 100 : 0,
        };
      }

      if (platform === "doordash") {
        // Use shared helper for consistent DoorDash attribution
        const metrics = calculateDoorDashMetrics(txns as DoordashTransaction[]);
        return {
          platform,
          totalSales: metrics.totalSales,
          marketingDrivenSales: metrics.marketingDrivenSales,
          organicSales: metrics.totalSales - metrics.marketingDrivenSales,
          totalOrders: metrics.totalOrders,
          ordersFromMarketing: metrics.ordersFromMarketing,
          organicOrders: metrics.totalOrders - metrics.ordersFromMarketing,
          aov: metrics.totalOrders > 0 ? metrics.totalSales / metrics.totalOrders : 0,
          adSpend: metrics.adSpend,
          offerDiscountValue: metrics.offerDiscountValue,
          totalMarketingInvestment: metrics.adSpend + metrics.offerDiscountValue,
          marketingInvestmentPercent:
            metrics.totalSales > 0 ? ((metrics.adSpend + metrics.offerDiscountValue) / metrics.totalSales) * 100 : 0,
          marketingRoas:
            (metrics.adSpend + metrics.offerDiscountValue) > 0
              ? metrics.marketingDrivenSales / (metrics.adSpend + metrics.offerDiscountValue)
              : 0,
          netPayout: metrics.netPayout,
          netPayoutPercent: metrics.totalSales > 0 ? (metrics.netPayout / metrics.totalSales) * 100 : 0,
        };
      }

      // Grubhub: inline calculation
      let totalOrders = 0;
      let totalSales = 0;
      let marketingDrivenSales = 0;
      let adSpend = 0;
      let offerDiscountValue = 0;
      let netPayout = 0;
      let ordersFromMarketing = 0;

      txns.forEach((t) => {
        if (platform === "grubhub") {
          // Grubhub Platform-Specific Status Handling:
          // - Sales/Orders: Only count "Prepaid Order" transaction types (completed orders)
          // - Net Payout: Include ALL transaction types (Prepaid Order, Order Adjustment, Cancellation) for finance reconciliation
          const isPrepaidOrder = t.transactionType === "Prepaid Order";
          
          // Always include net payout for ALL transaction types
          netPayout += t.merchantNetTotal || 0;
          
          // Only count Prepaid Orders for sales and order metrics
          if (isPrepaidOrder) {
            totalOrders++;
            totalSales += t.saleAmount;
            const promoAmount = t.merchantFundedPromotion || 0;
            // Grubhub promos are stored as negative values, use absolute value for tracking
            offerDiscountValue += Math.abs(promoAmount);
            if (promoAmount !== 0) {
              marketingDrivenSales += t.saleAmount;
              ordersFromMarketing++;
            }
          }
        }
      });

      const organicSales = totalSales - marketingDrivenSales;
      const organicOrders = totalOrders - ordersFromMarketing;
      const totalMarketingInvestment = adSpend + offerDiscountValue;

      return {
        platform,
        totalSales,
        marketingDrivenSales,
        organicSales,
        totalOrders,
        ordersFromMarketing,
        organicOrders,
        aov: totalOrders > 0 ? totalSales / totalOrders : 0,
        adSpend,
        offerDiscountValue,
        totalMarketingInvestment,
        marketingInvestmentPercent: totalSales > 0 ? (totalMarketingInvestment / totalSales) * 100 : 0,
        marketingRoas: totalMarketingInvestment > 0 ? marketingDrivenSales / totalMarketingInvestment : 0,
        netPayout,
        netPayoutPercent: totalSales > 0 ? (netPayout / totalSales) * 100 : 0,
      };
    };

    const dateFilter = filters?.weekStart && filters?.weekEnd 
      ? { weekStart: filters.weekStart, weekEnd: filters.weekEnd }
      : undefined;

    let platformBreakdown = [
      calculatePlatformMetrics(uberTxns, "ubereats", dateFilter),
      calculatePlatformMetrics(doorTxns, "doordash", dateFilter),
      calculatePlatformMetrics(grubTxns, "grubhub", dateFilter),
    ];

    // Filter by platform if specified
    if (filters?.platform) {
      platformBreakdown = platformBreakdown.filter(p => p.platform === filters.platform);
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
    // Build base location query
    let locationQuery = this.db.select().from(locations);
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

    // Build transaction query conditions
    const uberConditions = [];
    const doorConditions = [];
    const grubConditions = [];

    if (filters?.clientId) {
      uberConditions.push(eq(uberEatsTransactions.clientId, filters.clientId));
      doorConditions.push(eq(doordashTransactions.clientId, filters.clientId));
      grubConditions.push(eq(grubhubTransactions.clientId, filters.clientId));
    }

    // Add date range filtering
    if (filters?.weekStart && filters?.weekEnd) {
      doorConditions.push(
        and(
          sql`${doordashTransactions.transactionDate} >= ${filters.weekStart}`,
          sql`${doordashTransactions.transactionDate} <= ${filters.weekEnd}`
        )!
      );
      grubConditions.push(
        and(
          sql`${grubhubTransactions.orderDate} >= ${filters.weekStart}`,
          sql`${grubhubTransactions.orderDate} <= ${filters.weekEnd}`
        )!
      );
    }

    const [uberTxns, doorTxns, grubTxns] = await Promise.all([
      uberConditions.length > 0
        ? this.db.select().from(uberEatsTransactions).where(and(...uberConditions))
        : this.db.select().from(uberEatsTransactions),
      doorConditions.length > 0
        ? this.db.select().from(doordashTransactions).where(and(...doorConditions))
        : this.db.select().from(doordashTransactions),
      grubConditions.length > 0
        ? this.db.select().from(grubhubTransactions).where(and(...grubConditions))
        : this.db.select().from(grubhubTransactions),
    ]);

    const metrics: LocationMetrics[] = [];

    for (const location of allLocations) {
      let platforms: Array<{ name: "ubereats" | "doordash" | "grubhub"; txns: any[] }> = [
        { name: "ubereats", txns: uberTxns.filter((t) => t.locationId === location.id) },
        { name: "doordash", txns: doorTxns.filter((t) => t.locationId === location.id) },
        { name: "grubhub", txns: grubTxns.filter((t) => t.locationId === location.id) },
      ];

      // Filter by platform if specified
      if (filters?.platform) {
        platforms = platforms.filter(p => p.name === filters.platform);
      }

      for (const { name: platform, txns } of platforms) {
        if (txns.length === 0) continue;

        let totalOrders = 0;
        let totalSales = 0;
        let marketingDrivenSales = 0;
        let adSpend = 0;
        let offerDiscountValue = 0;
        let netPayout = 0;
        let ordersFromMarketing = 0;

        if (platform === "ubereats") {
          // Filter by date for UberEats if needed
          const filteredTxns = (filters?.weekStart && filters?.weekEnd)
            ? txns.filter((t: any) => isUberEatsDateInRange(t.date, filters.weekStart!, filters.weekEnd!))
            : txns;
          
          // Use shared helper for consistent UberEats attribution
          const ueMetrics = calculateUberEatsMetrics(filteredTxns as UberEatsTransaction[]);
          totalOrders = ueMetrics.totalOrders;
          totalSales = ueMetrics.totalSales;
          marketingDrivenSales = ueMetrics.marketingDrivenSales;
          adSpend = ueMetrics.adSpend;
          offerDiscountValue = ueMetrics.offerDiscountValue;
          netPayout = ueMetrics.netPayout;
          ordersFromMarketing = ueMetrics.ordersFromMarketing;
        } else if (platform === "doordash") {
          // Use shared helper for consistent DoorDash attribution
          const ddMetrics = calculateDoorDashMetrics(txns as DoordashTransaction[]);
          totalOrders = ddMetrics.totalOrders;
          totalSales = ddMetrics.totalSales;
          marketingDrivenSales = ddMetrics.marketingDrivenSales;
          adSpend = ddMetrics.adSpend;
          offerDiscountValue = ddMetrics.offerDiscountValue;
          netPayout = ddMetrics.netPayout;
          ordersFromMarketing = ddMetrics.ordersFromMarketing;
        } else {
          txns.forEach((t) => {
            if (platform === "grubhub") {
              // Grubhub Platform-Specific Status Handling:
              // - Sales/Orders: Only count "Prepaid Order" transaction types (completed orders)
              // - Net Payout: Include ALL transaction types for finance reconciliation
              const isPrepaidOrder = t.transactionType === "Prepaid Order";
              
              // Always include net payout for ALL transaction types
              netPayout += t.merchantNetTotal || 0;
              
              // Only count Prepaid Orders for sales and order metrics
              if (isPrepaidOrder) {
                totalOrders++;
                totalSales += t.saleAmount;
                const promoAmount = t.merchantFundedPromotion || 0;
                // Grubhub promos are stored as negative values, use absolute value for tracking
                if (promoAmount !== 0) {
                  offerDiscountValue += Math.abs(promoAmount);
                  marketingDrivenSales += t.saleAmount;
                  ordersFromMarketing++;
                }
              }
            }
          });
        }

        const totalMarketingInvestment = adSpend + offerDiscountValue;

        metrics.push({
          locationId: location.id,
          locationName: location.canonicalName,
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
    const results = Array.from(grouped.values()).map(item => ({
      ...item,
      aov: item.totalOrders > 0 ? item.totalSales / item.totalOrders : 0,
      marketingRoas: item.totalMarketingInvestment > 0 ? 
        item.totalSales / item.totalMarketingInvestment : 0,
      netPayoutPercent: item.totalSales > 0 ? 
        (item.netPayout / item.totalSales) * 100 : 0,
    }));

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
