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
}

export class MemStorage implements IStorage {
  private clients: Map<string, Client>;
  private locations: Map<string, Location>;
  private uberEatsTransactions: Map<string, UberEatsTransaction>;
  private doordashTransactions: Map<string, DoordashTransaction>;
  private grubhubTransactions: Map<string, GrubhubTransaction>;

  constructor() {
    this.clients = new Map();
    this.locations = new Map();
    this.uberEatsTransactions = new Map();
    this.doordashTransactions = new Map();
    this.grubhubTransactions = new Map();
    
    const defaultClient: Client = {
      id: "default-client",
      name: "Demo Client",
      createdAt: new Date(),
    };
    this.clients.set(defaultClient.id, defaultClient);
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
}

export const storage = new MemStorage();
