import {
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
  type PlatformMetrics,
  type LocationMatchSuggestion,
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  createClient(client: InsertClient): Promise<Client>;
  getClient(id: string): Promise<Client | undefined>;
  getAllClients(): Promise<Client[]>;

  createLocation(location: InsertLocation): Promise<Location>;
  getLocation(id: string): Promise<Location | undefined>;
  getLocationsByClient(clientId: string): Promise<Location[]>;
  getAllLocations(): Promise<Location[]>;
  updateLocation(id: string, updates: Partial<Location>): Promise<Location | undefined>;
  findLocationByName(clientId: string, name: string, platform: "ubereats" | "doordash" | "grubhub"): Promise<Location | undefined>;

  createUberEatsTransaction(transaction: InsertUberEatsTransaction): Promise<UberEatsTransaction>;
  getUberEatsTransactionsByClient(clientId: string): Promise<UberEatsTransaction[]>;
  
  createDoordashTransaction(transaction: InsertDoordashTransaction): Promise<DoordashTransaction>;
  getDoordashTransactionsByClient(clientId: string): Promise<DoordashTransaction[]>;

  createGrubhubTransaction(transaction: InsertGrubhubTransaction): Promise<GrubhubTransaction>;
  getGrubhubTransactionsByClient(clientId: string): Promise<GrubhubTransaction[]>;

  getDashboardOverview(clientId?: string): Promise<DashboardOverview>;
  getLocationMetrics(clientId?: string): Promise<LocationMetrics[]>;
  getLocationMatchSuggestions(clientId?: string): Promise<LocationMatchSuggestion[]>;
  getClientPerformance(): Promise<Array<{
    clientId: string;
    clientName: string;
    totalSales: number;
    totalOrders: number;
    roas: number;
  }>>;

  createPromotion(promotion: InsertPromotion): Promise<Promotion>;
  getPromotion(id: string): Promise<Promotion | undefined>;
  getPromotionByCampaignId(campaignId: string): Promise<Promotion | undefined>;
  getAllPromotions(clientId?: string): Promise<Promotion[]>;
  updatePromotion(id: string, updates: Partial<InsertPromotion>): Promise<Promotion | undefined>;
  deletePromotion(id: string): Promise<boolean>;
  getPromotionMetrics(clientId?: string): Promise<PromotionMetrics[]>;

  createPaidAdCampaign(campaign: InsertPaidAdCampaign): Promise<PaidAdCampaign>;
  getPaidAdCampaign(id: string): Promise<PaidAdCampaign | undefined>;
  getPaidAdCampaignByCampaignId(campaignId: string): Promise<PaidAdCampaign | undefined>;
  getAllPaidAdCampaigns(clientId?: string): Promise<PaidAdCampaign[]>;
  updatePaidAdCampaign(id: string, updates: Partial<InsertPaidAdCampaign>): Promise<PaidAdCampaign | undefined>;
  deletePaidAdCampaign(id: string): Promise<boolean>;
  getPaidAdCampaignMetrics(clientId?: string): Promise<PaidAdCampaignMetrics[]>;

  createCampaignLocationMetric(metric: InsertCampaignLocationMetric): Promise<CampaignLocationMetric>;
  getCampaignLocationMetrics(clientId?: string): Promise<CampaignLocationMetric[]>;
  getCampaignLocationMetricByKey(campaignId: string, locationId: string | null, dateStart: string | null): Promise<CampaignLocationMetric | undefined>;

  createLocationWeeklyFinancial(financial: InsertLocationWeeklyFinancial): Promise<LocationWeeklyFinancial>;
  getLocationWeeklyFinancials(locationId: string): Promise<LocationWeeklyFinancial[]>;
  getLocationWeeklyFinancialsByClient(clientId: string): Promise<LocationWeeklyFinancial[]>;
  deleteLocationWeeklyFinancialsByClient(clientId: string): Promise<number>;
}

export class MemStorage implements IStorage {
  private clients: Map<string, Client>;
  private locations: Map<string, Location>;
  private uberEatsTransactions: Map<string, UberEatsTransaction>;
  private doordashTransactions: Map<string, DoordashTransaction>;
  private grubhubTransactions: Map<string, GrubhubTransaction>;
  private promotions: Map<string, Promotion>;
  private paidAdCampaigns: Map<string, PaidAdCampaign>;
  private campaignLocationMetrics: Map<string, CampaignLocationMetric>;
  private locationWeeklyFinancials: Map<string, LocationWeeklyFinancial>;

  constructor() {
    this.clients = new Map();
    this.locations = new Map();
    this.uberEatsTransactions = new Map();
    this.doordashTransactions = new Map();
    this.grubhubTransactions = new Map();
    this.promotions = new Map();
    this.paidAdCampaigns = new Map();
    this.campaignLocationMetrics = new Map();
    this.locationWeeklyFinancials = new Map();
    
    // Add demo clients
    const demoClients: Client[] = [
      {
        id: "capriottis",
        name: "Capriotti's",
        createdAt: new Date(),
      },
    ];
    
    demoClients.forEach(client => {
      this.clients.set(client.id, client);
    });
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const id = randomUUID();
    const client: Client = { ...insertClient, id, createdAt: new Date() };
    this.clients.set(id, client);
    return client;
  }

  async getClient(id: string): Promise<Client | undefined> {
    return this.clients.get(id);
  }

  async getAllClients(): Promise<Client[]> {
    return Array.from(this.clients.values());
  }

  async createLocation(insertLocation: InsertLocation): Promise<Location> {
    const id = randomUUID();
    const location: Location = { ...insertLocation, id, createdAt: new Date() };
    this.locations.set(id, location);
    return location;
  }

  async getLocation(id: string): Promise<Location | undefined> {
    return this.locations.get(id);
  }

  async getLocationsByClient(clientId: string): Promise<Location[]> {
    return Array.from(this.locations.values()).filter(
      (loc) => loc.clientId === clientId
    );
  }

  async getAllLocations(): Promise<Location[]> {
    return Array.from(this.locations.values());
  }

  async updateLocation(id: string, updates: Partial<Location>): Promise<Location | undefined> {
    const location = this.locations.get(id);
    if (!location) return undefined;

    const updated = { ...location, ...updates };
    this.locations.set(id, updated);
    return updated;
  }

  async findLocationByName(
    clientId: string,
    name: string,
    platform: "ubereats" | "doordash" | "grubhub"
  ): Promise<Location | undefined> {
    const field = platform === "ubereats" ? "uberEatsName" : platform === "doordash" ? "doordashName" : "grubhubName";
    
    return Array.from(this.locations.values()).find(
      (loc) => loc.clientId === clientId && loc[field] === name
    );
  }

  async createUberEatsTransaction(insertTransaction: InsertUberEatsTransaction): Promise<UberEatsTransaction> {
    const id = randomUUID();
    const transaction: UberEatsTransaction = {
      ...insertTransaction,
      id,
      uploadedAt: new Date(),
    };
    this.uberEatsTransactions.set(id, transaction);
    return transaction;
  }

  async getUberEatsTransactionsByClient(clientId: string): Promise<UberEatsTransaction[]> {
    return Array.from(this.uberEatsTransactions.values()).filter(
      (t) => t.clientId === clientId
    );
  }

  async createDoordashTransaction(insertTransaction: InsertDoordashTransaction): Promise<DoordashTransaction> {
    const id = randomUUID();
    const transaction: DoordashTransaction = {
      ...insertTransaction,
      id,
      uploadedAt: new Date(),
    };
    this.doordashTransactions.set(id, transaction);
    return transaction;
  }

  async getDoordashTransactionsByClient(clientId: string): Promise<DoordashTransaction[]> {
    return Array.from(this.doordashTransactions.values()).filter(
      (t) => t.clientId === clientId
    );
  }

  async createGrubhubTransaction(insertTransaction: InsertGrubhubTransaction): Promise<GrubhubTransaction> {
    const id = randomUUID();
    const transaction: GrubhubTransaction = {
      ...insertTransaction,
      id,
      uploadedAt: new Date(),
    };
    this.grubhubTransactions.set(id, transaction);
    return transaction;
  }

  async getGrubhubTransactionsByClient(clientId: string): Promise<GrubhubTransaction[]> {
    return Array.from(this.grubhubTransactions.values()).filter(
      (t) => t.clientId === clientId
    );
  }

  async getDashboardOverview(clientId?: string): Promise<DashboardOverview> {
    const uberTransactions = clientId
      ? await this.getUberEatsTransactionsByClient(clientId)
      : Array.from(this.uberEatsTransactions.values());
    const doordashTransactions = clientId
      ? await this.getDoordashTransactionsByClient(clientId)
      : Array.from(this.doordashTransactions.values());
    const grubhubTransactions = clientId
      ? await this.getGrubhubTransactionsByClient(clientId)
      : Array.from(this.grubhubTransactions.values());

    const platformBreakdown: PlatformMetrics[] = [];

    if (uberTransactions.length > 0) {
      platformBreakdown.push(this.calculatePlatformMetrics("ubereats", uberTransactions));
    }
    if (doordashTransactions.length > 0) {
      platformBreakdown.push(this.calculatePlatformMetrics("doordash", doordashTransactions));
    }
    if (grubhubTransactions.length > 0) {
      platformBreakdown.push(this.calculatePlatformMetrics("grubhub", grubhubTransactions));
    }

    const totalSales = platformBreakdown.reduce((sum, p) => sum + p.totalSales, 0);
    const totalOrders = platformBreakdown.reduce((sum, p) => sum + p.totalOrders, 0);
    const totalMarketingInvestment = platformBreakdown.reduce((sum, p) => sum + p.totalMarketingInvestment, 0);
    const totalMarketingDrivenSales = platformBreakdown.reduce((sum, p) => sum + p.marketingDrivenSales, 0);
    const totalNetPayout = platformBreakdown.reduce((sum, p) => sum + p.netPayout, 0);

    return {
      totalSales,
      totalOrders,
      averageAov: totalOrders > 0 ? totalSales / totalOrders : 0,
      totalMarketingInvestment,
      blendedRoas: totalMarketingInvestment > 0 ? totalMarketingDrivenSales / totalMarketingInvestment : 0,
      netPayoutPercent: totalSales > 0 ? (totalNetPayout / totalSales) * 100 : 0,
      platformBreakdown,
    };
  }

  private calculatePlatformMetrics(
    platform: "ubereats" | "doordash" | "grubhub",
    transactions: any[]
  ): PlatformMetrics {
    const totalOrders = transactions.length;
    let totalSales = 0;
    let marketingDrivenSales = 0;
    let adSpend = 0;
    let offerDiscountValue = 0;
    let netPayout = 0;

    transactions.forEach((t) => {
      if (platform === "ubereats") {
        totalSales += t.subtotal;
        netPayout += t.netPayout;
        adSpend += t.platformFee;
        offerDiscountValue += t.marketingAmount;
        if (t.marketingAmount > 0) {
          marketingDrivenSales += t.subtotal;
        }
      } else if (platform === "doordash") {
        totalSales += t.orderSubtotal;
        netPayout += t.netPayment;
        adSpend += t.commission;
        offerDiscountValue += t.marketingSpend;
        if (t.marketingSpend > 0) {
          marketingDrivenSales += t.orderSubtotal;
        }
      } else if (platform === "grubhub") {
        totalSales += t.saleAmount;
        netPayout += t.netSales;
        adSpend += t.processingFee;
        offerDiscountValue += t.promotionCost;
        if (t.promotionCost > 0) {
          marketingDrivenSales += t.saleAmount;
        }
      }
    });

    const organicSales = totalSales - marketingDrivenSales;
    const ordersFromMarketing = transactions.filter(t => {
      if (platform === "ubereats") return t.marketingAmount > 0;
      if (platform === "doordash") return t.marketingSpend > 0;
      return t.promotionCost > 0;
    }).length;
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
  }

  async getLocationMetrics(clientId?: string): Promise<LocationMetrics[]> {
    const locations = clientId
      ? await this.getLocationsByClient(clientId)
      : await this.getAllLocations();

    const metrics: LocationMetrics[] = [];

    for (const location of locations) {
      const uberTransactions = Array.from(this.uberEatsTransactions.values()).filter(
        (t) => t.locationId === location.id
      );
      const doordashTransactions = Array.from(this.doordashTransactions.values()).filter(
        (t) => t.locationId === location.id
      );
      const grubhubTransactions = Array.from(this.grubhubTransactions.values()).filter(
        (t) => t.locationId === location.id
      );

      if (uberTransactions.length > 0) {
        const platformMetrics = this.calculatePlatformMetrics("ubereats", uberTransactions);
        metrics.push({
          locationId: location.id,
          locationName: location.canonicalName,
          ...platformMetrics,
        });
      }

      if (doordashTransactions.length > 0) {
        const platformMetrics = this.calculatePlatformMetrics("doordash", doordashTransactions);
        metrics.push({
          locationId: location.id,
          locationName: location.canonicalName,
          ...platformMetrics,
        });
      }

      if (grubhubTransactions.length > 0) {
        const platformMetrics = this.calculatePlatformMetrics("grubhub", grubhubTransactions);
        metrics.push({
          locationId: location.id,
          locationName: location.canonicalName,
          ...platformMetrics,
        });
      }
    }

    return metrics;
  }

  async getLocationMatchSuggestions(clientId?: string): Promise<LocationMatchSuggestion[]> {
    return [];
  }

  async getClientPerformance(): Promise<Array<{
    clientId: string;
    clientName: string;
    totalSales: number;
    totalOrders: number;
    roas: number;
  }>> {
    const clients = await this.getAllClients();
    const performance = [];

    for (const client of clients) {
      const overview = await this.getDashboardOverview(client.id);
      performance.push({
        clientId: client.id,
        clientName: client.name,
        totalSales: overview.totalSales,
        totalOrders: overview.totalOrders,
        roas: overview.blendedRoas,
      });
    }

    return performance;
  }

  async createPromotion(insertPromotion: InsertPromotion): Promise<Promotion> {
    const id = randomUUID();
    const promotion: Promotion = { ...insertPromotion, id, createdAt: new Date() };
    this.promotions.set(id, promotion);
    return promotion;
  }

  async getPromotion(id: string): Promise<Promotion | undefined> {
    return this.promotions.get(id);
  }

  async getPromotionByCampaignId(campaignId: string): Promise<Promotion | undefined> {
    return Array.from(this.promotions.values()).find(p => p.campaignId === campaignId);
  }

  async getAllPromotions(clientId?: string): Promise<Promotion[]> {
    const allPromotions = Array.from(this.promotions.values());
    if (clientId) {
      return allPromotions.filter(p => p.clientId === clientId);
    }
    return allPromotions;
  }

  async updatePromotion(id: string, updates: Partial<InsertPromotion>): Promise<Promotion | undefined> {
    const promotion = this.promotions.get(id);
    if (!promotion) return undefined;
    
    const updated = { ...promotion, ...updates };
    this.promotions.set(id, updated);
    return updated;
  }

  async deletePromotion(id: string): Promise<boolean> {
    return this.promotions.delete(id);
  }

  async getPromotionMetrics(clientId?: string): Promise<PromotionMetrics[]> {
    const promotions = await this.getAllPromotions(clientId);
    const metrics: PromotionMetrics[] = [];

    for (const promotion of promotions) {
      // For now, return empty metrics - will be calculated from transaction data later
      metrics.push({
        ...promotion,
        orders: 0,
        revenueImpact: 0,
        discountCost: 0,
        newCustomers: 0,
        roi: 0,
      });
    }

    return metrics;
  }

  async createPaidAdCampaign(insertCampaign: InsertPaidAdCampaign): Promise<PaidAdCampaign> {
    const id = randomUUID();
    const campaign: PaidAdCampaign = { ...insertCampaign, id, createdAt: new Date() };
    this.paidAdCampaigns.set(id, campaign);
    return campaign;
  }

  async getPaidAdCampaign(id: string): Promise<PaidAdCampaign | undefined> {
    return this.paidAdCampaigns.get(id);
  }

  async getPaidAdCampaignByCampaignId(campaignId: string): Promise<PaidAdCampaign | undefined> {
    return Array.from(this.paidAdCampaigns.values()).find(c => c.campaignId === campaignId);
  }

  async getAllPaidAdCampaigns(clientId?: string): Promise<PaidAdCampaign[]> {
    const allCampaigns = Array.from(this.paidAdCampaigns.values());
    if (clientId) {
      return allCampaigns.filter(c => c.clientId === clientId);
    }
    return allCampaigns;
  }

  async updatePaidAdCampaign(id: string, updates: Partial<InsertPaidAdCampaign>): Promise<PaidAdCampaign | undefined> {
    const campaign = this.paidAdCampaigns.get(id);
    if (!campaign) return undefined;
    
    const updated = { ...campaign, ...updates };
    this.paidAdCampaigns.set(id, updated);
    return updated;
  }

  async deletePaidAdCampaign(id: string): Promise<boolean> {
    return this.paidAdCampaigns.delete(id);
  }

  async getPaidAdCampaignMetrics(clientId?: string): Promise<PaidAdCampaignMetrics[]> {
    return await this.getAllPaidAdCampaigns(clientId);
  }

  async createCampaignLocationMetric(insertMetric: InsertCampaignLocationMetric): Promise<CampaignLocationMetric> {
    const id = randomUUID();
    const metric: CampaignLocationMetric = { 
      ...insertMetric, 
      id, 
      uploadedAt: new Date(),
      impressions: insertMetric.impressions ?? 0,
      clicks: insertMetric.clicks ?? 0,
      discount: insertMetric.discount ?? 0,
      roas: insertMetric.roas ?? 0,
      ctr: insertMetric.ctr ?? 0,
      conversionRate: insertMetric.conversionRate ?? 0,
      cpc: insertMetric.cpc ?? 0,
      cpa: insertMetric.cpa ?? 0,
      newCustomers: insertMetric.newCustomers ?? 0,
      dateStart: insertMetric.dateStart ?? null,
      dateEnd: insertMetric.dateEnd ?? null,
      locationId: insertMetric.locationId ?? null,
    };
    this.campaignLocationMetrics.set(id, metric);
    return metric;
  }

  async getCampaignLocationMetrics(clientId?: string): Promise<CampaignLocationMetric[]> {
    const allMetrics = Array.from(this.campaignLocationMetrics.values());
    if (clientId) {
      return allMetrics.filter(m => m.clientId === clientId);
    }
    return allMetrics;
  }

  async getCampaignLocationMetricByKey(campaignId: string, locationId: string | null, dateStart: string | null): Promise<CampaignLocationMetric | undefined> {
    return Array.from(this.campaignLocationMetrics.values()).find(
      m => m.campaignId === campaignId && 
           m.locationId === locationId && 
           m.dateStart === dateStart
    );
  }

  async createLocationWeeklyFinancial(insertFinancial: InsertLocationWeeklyFinancial): Promise<LocationWeeklyFinancial> {
    const id = crypto.randomUUID();
    const financial: LocationWeeklyFinancial = {
      ...insertFinancial,
      id,
      createdAt: new Date(),
    };
    this.locationWeeklyFinancials.set(id, financial);
    return financial;
  }

  async getLocationWeeklyFinancials(locationId: string): Promise<LocationWeeklyFinancial[]> {
    return Array.from(this.locationWeeklyFinancials.values())
      .filter(f => f.locationId === locationId)
      .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
  }

  async getLocationWeeklyFinancialsByClient(clientId: string): Promise<LocationWeeklyFinancial[]> {
    return Array.from(this.locationWeeklyFinancials.values())
      .filter(f => f.clientId === clientId)
      .sort((a, b) => {
        const locCompare = (a.locationId || '').localeCompare(b.locationId || '');
        if (locCompare !== 0) return locCompare;
        return a.weekStartDate.localeCompare(b.weekStartDate);
      });
  }

  async deleteLocationWeeklyFinancialsByClient(clientId: string): Promise<number> {
    const toDelete = Array.from(this.locationWeeklyFinancials.entries())
      .filter(([_, f]) => f.clientId === clientId);
    
    toDelete.forEach(([id, _]) => {
      this.locationWeeklyFinancials.delete(id);
    });
    
    return toDelete.length;
  }
}

import { DbStorage } from "./db-storage";

export const storage = new DbStorage();

// Seed initial client
(async () => {
  try {
    const allClients = await storage.getAllClients();
    const capriottisExists = allClients.some(c => c.name === "Capriotti's");
    
    if (!capriottisExists) {
      await storage.createClient({
        name: "Capriotti's",
      });
      console.log("✓ Seeded Capriotti's client");
    }
  } catch (error) {
    console.error("Error seeding client:", error);
  }
})();
