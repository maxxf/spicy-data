import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
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
  type LocationMatchSuggestion,
  type AnalyticsFilters,
} from "@shared/schema";
import type { IStorage } from "./storage";

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
    
    // Insert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      await this.db.insert(uberEatsTransactions).values(chunk);
    }
  }

  async getUberEatsTransactionsByClient(clientId: string): Promise<UberEatsTransaction[]> {
    return await this.db
      .select()
      .from(uberEatsTransactions)
      .where(eq(uberEatsTransactions.clientId, clientId));
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
    
    // Insert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      await this.db.insert(doordashTransactions).values(chunk);
    }
  }

  async getDoordashTransactionsByClient(clientId: string): Promise<DoordashTransaction[]> {
    return await this.db
      .select()
      .from(doordashTransactions)
      .where(eq(doordashTransactions.clientId, clientId));
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
    
    // Insert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < transactions.length; i += chunkSize) {
      const chunk = transactions.slice(i, i + chunkSize);
      await this.db.insert(grubhubTransactions).values(chunk);
    }
  }

  async getGrubhubTransactionsByClient(clientId: string): Promise<GrubhubTransaction[]> {
    return await this.db
      .select()
      .from(grubhubTransactions)
      .where(eq(grubhubTransactions.clientId, clientId));
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
      platform: "ubereats" | "doordash" | "grubhub"
    ) => {
      let totalOrders = 0;
      let totalSales = 0;
      let marketingDrivenSales = 0;
      let adSpend = 0;
      let offerDiscountValue = 0;
      let netPayout = 0;
      let ordersFromMarketing = 0;

      txns.forEach((t) => {
        if (platform === "ubereats") {
          totalOrders++;
          totalSales += t.subtotal;
          netPayout += t.netPayout;
          if (t.marketingPromo) {
            const marketingAmt = t.marketingAmount || 0;
            offerDiscountValue += marketingAmt;
            marketingDrivenSales += t.subtotal;
            ordersFromMarketing++;
          }
        } else if (platform === "doordash") {
          // NEW ATTRIBUTION METHODOLOGY FOR DOORDASH
          
          // 1. Order Filtering: ONLY count Marketplace + Completed/Delivered/Picked Up orders for sales metrics
          const isMarketplace = !t.channel || t.channel === "Marketplace";
          const isCompleted = !t.orderStatus || t.orderStatus === "Delivered" || t.orderStatus === "Picked Up";
          
          // 2. Net Payout: Sum ALL order statuses (including refunds, cancellations)
          netPayout += t.totalPayout || t.netPayment || 0;
          
          // Only count Marketplace + Completed for sales and order metrics
          if (isMarketplace && isCompleted) {
            totalOrders++;
            
            // 3. Sales Calculation: Use "Sales (excl. tax)" as primary metric
            const sales = t.salesExclTax || t.orderSubtotal || 0;
            totalSales += sales;
            
            // 4. Marketing Investment Components
            // Ad Spend = absolute value of all "Other payments"
            const adSpendAmount = Math.abs(t.otherPayments || 0);
            adSpend += adSpendAmount;
            
            // Offer/Discount Value = abs(promotional discounts) + credits
            const offersValue = Math.abs(t.offersOnItems || 0) + 
                              Math.abs(t.deliveryOfferRedemptions || 0) +
                              Math.abs(t.marketingCredits || 0) +
                              Math.abs(t.thirdPartyContribution || 0);
            offerDiscountValue += offersValue;
            
            // 5. Marketing Attribution: Order has marketing if any promotional activity
            const hasMarketing = (t.offersOnItems < 0) || 
                                (t.deliveryOfferRedemptions < 0) || 
                                (t.marketingCredits > 0) || 
                                (t.thirdPartyContribution > 0);
            
            if (hasMarketing) {
              marketingDrivenSales += sales;
              ordersFromMarketing++;
            }
          }
        } else if (platform === "grubhub") {
          totalOrders++;
          totalSales += t.saleAmount;
          netPayout += t.netSales;
          const promoAmount = t.promotionCost || 0;
          offerDiscountValue += promoAmount;
          if (promoAmount > 0) {
            marketingDrivenSales += t.saleAmount;
            ordersFromMarketing++;
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

    let platformBreakdown = [
      calculatePlatformMetrics(uberTxns, "ubereats"),
      calculatePlatformMetrics(doorTxns, "doordash"),
      calculatePlatformMetrics(grubTxns, "grubhub"),
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

        const totalSales = txns.reduce((sum, t) => {
          if (platform === "ubereats") return sum + t.subtotal;
          if (platform === "doordash") return sum + t.orderSubtotal;
          return sum + t.saleAmount;
        }, 0);

        const marketingAmount = txns.reduce((sum, t) => {
          if (platform === "ubereats") return sum + (t.marketingPromo ? t.marketingAmount : 0);
          if (platform === "doordash") return sum + t.marketingSpend;
          return sum + t.promotionCost;
        }, 0);

        const netPayout = txns.reduce((sum, t) => {
          if (platform === "ubereats") return sum + t.netPayout;
          if (platform === "doordash") return sum + t.netPayment;
          return sum + t.netSales;
        }, 0);

        const ordersFromMarketing = txns.filter((t) => {
          if (platform === "ubereats") return t.marketingPromo;
          if (platform === "doordash") return t.marketingSpend > 0;
          return t.promotionCost > 0;
        }).length;

        const marketingDrivenSales = txns
          .filter((t) => {
            if (platform === "ubereats") return t.marketingPromo;
            if (platform === "doordash") return t.marketingSpend > 0;
            return t.promotionCost > 0;
          })
          .reduce((sum, t) => {
            if (platform === "ubereats") return sum + t.subtotal;
            if (platform === "doordash") return sum + t.orderSubtotal;
            return sum + t.saleAmount;
          }, 0);

        metrics.push({
          locationId: location.id,
          locationName: location.canonicalName,
          platform,
          totalSales,
          marketingDrivenSales,
          organicSales: totalSales - marketingDrivenSales,
          totalOrders: txns.length,
          ordersFromMarketing,
          organicOrders: txns.length - ordersFromMarketing,
          aov: totalSales / txns.length,
          adSpend: 0,
          offerDiscountValue: marketingAmount,
          totalMarketingInvestment: marketingAmount,
          marketingInvestmentPercent: totalSales > 0 ? (marketingAmount / totalSales) * 100 : 0,
          marketingRoas: marketingAmount > 0 ? marketingDrivenSales / marketingAmount : 0,
          netPayout,
          netPayoutPercent: totalSales > 0 ? (netPayout / totalSales) * 100 : 0,
        });
      }
    }

    return metrics;
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
      const overview = await this.getDashboardOverview(client.id);
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

  async getPromotionMetrics(clientId?: string): Promise<PromotionMetrics[]> {
    const promos = await this.getAllPromotions(clientId);
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

      metrics.push({
        ...promo,
        orders,
        revenueImpact: revenue,
        discountCost: discount,
        newCustomers,
        roi: spend > 0 ? ((revenue - spend) / spend) * 100 : 0,
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

  async getPaidAdCampaignMetrics(clientId?: string): Promise<PaidAdCampaignMetrics[]> {
    return await this.getAllPaidAdCampaigns(clientId);
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
}
