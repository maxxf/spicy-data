import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, and, sql, desc } from "drizzle-orm";
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

  async getGrubhubTransactionsByClient(clientId: string): Promise<GrubhubTransaction[]> {
    return await this.db
      .select()
      .from(grubhubTransactions)
      .where(eq(grubhubTransactions.clientId, clientId));
  }

  async getDashboardOverview(clientId?: string): Promise<DashboardOverview> {
    const [uberTxns, doorTxns, grubTxns] = await Promise.all([
      clientId
        ? this.getUberEatsTransactionsByClient(clientId)
        : this.db.select().from(uberEatsTransactions),
      clientId
        ? this.getDoordashTransactionsByClient(clientId)
        : this.db.select().from(doordashTransactions),
      clientId
        ? this.getGrubhubTransactionsByClient(clientId)
        : this.db.select().from(grubhubTransactions),
    ]);

    const calculatePlatformMetrics = (
      txns: any[],
      platform: "ubereats" | "doordash" | "grubhub"
    ) => {
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

      return {
        platform,
        totalSales,
        marketingDrivenSales,
        organicSales: totalSales - marketingDrivenSales,
        totalOrders: txns.length,
        ordersFromMarketing,
        organicOrders: txns.length - ordersFromMarketing,
        aov: txns.length > 0 ? totalSales / txns.length : 0,
        adSpend: 0,
        offerDiscountValue: marketingAmount,
        totalMarketingInvestment: marketingAmount,
        marketingInvestmentPercent: totalSales > 0 ? (marketingAmount / totalSales) * 100 : 0,
        marketingRoas: marketingAmount > 0 ? marketingDrivenSales / marketingAmount : 0,
        netPayout,
        netPayoutPercent: totalSales > 0 ? (netPayout / totalSales) * 100 : 0,
      };
    };

    const platformBreakdown = [
      calculatePlatformMetrics(uberTxns, "ubereats"),
      calculatePlatformMetrics(doorTxns, "doordash"),
      calculatePlatformMetrics(grubTxns, "grubhub"),
    ];

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

  async getLocationMetrics(clientId?: string): Promise<LocationMetrics[]> {
    const allLocations = clientId
      ? await this.getLocationsByClient(clientId)
      : await this.getAllLocations();

    const [uberTxns, doorTxns, grubTxns] = await Promise.all([
      clientId
        ? this.getUberEatsTransactionsByClient(clientId)
        : this.db.select().from(uberEatsTransactions),
      clientId
        ? this.getDoordashTransactionsByClient(clientId)
        : this.db.select().from(doordashTransactions),
      clientId
        ? this.getGrubhubTransactionsByClient(clientId)
        : this.db.select().from(grubhubTransactions),
    ]);

    const metrics: LocationMetrics[] = [];

    for (const location of allLocations) {
      const platforms: Array<{ name: "ubereats" | "doordash" | "grubhub"; txns: any[] }> = [
        { name: "ubereats", txns: uberTxns.filter((t) => t.locationId === location.id) },
        { name: "doordash", txns: doorTxns.filter((t) => t.locationId === location.id) },
        { name: "grubhub", txns: grubTxns.filter((t) => t.locationId === location.id) },
      ];

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
