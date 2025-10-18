import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientSelector } from "@/components/client-selector";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Percent, TrendingUp } from "lucide-react";
import type { PromotionMetrics } from "@shared/schema";

const platformColors = {
  ubereats: "bg-[#45B85A] hover:bg-[#3A9A4A]",
  doordash: "bg-[#FF3008] hover:bg-[#E62B07]",
  grubhub: "bg-[#F86734] hover:bg-[#E6582C]",
};

const statusColors = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  completed: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  paused: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
};


export default function PromotionsPage() {
  const [selectedClientId, setSelectedClientId] = useState<string | null>("capriottis");

  const { data: promotions, isLoading } = useQuery<PromotionMetrics[]>({
    queryKey: ["/api/analytics/promotions", selectedClientId],
    queryFn: async () => {
      const params = selectedClientId ? `?clientId=${selectedClientId}` : "";
      const response = await fetch(`/api/analytics/promotions${params}`);
      if (!response.ok) throw new Error("Failed to fetch promotions");
      return response.json();
    },
  });


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
              Promotions & Offers
            </h1>
            <p className="text-muted-foreground mt-1">
              Track promotional campaigns and their performance
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground">Loading...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8" data-testid="page-promotions">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            Promotions & Offers
          </h1>
          <p className="text-muted-foreground mt-1">
            Track promotional campaigns and their performance
          </p>
        </div>
        <ClientSelector
          selectedClientId={selectedClientId}
          onClientChange={setSelectedClientId}
          showAllOption={true}
        />
      </div>

      {promotions && promotions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Percent className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2" data-testid="text-empty-state">
              No promotion data available
            </h3>
            <p className="text-sm text-muted-foreground">
              Upload marketing data files to see promotional campaign performance
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All Promotions</CardTitle>
            <CardDescription>
              {promotions?.length || 0} promotional campaigns across all clients
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Revenue Impact</TableHead>
                  <TableHead className="text-right">Discount Cost</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promotions?.map((promotion) => {
                  return (
                    <TableRow key={promotion.id}>
                      <TableCell className="font-medium" data-testid={`text-promotion-name-${promotion.id}`}>
                        {promotion.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {promotion.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusColors[promotion.status as keyof typeof statusColors] || statusColors.scheduled}
                        >
                          {promotion.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{promotion.startDate}</div>
                        {promotion.endDate && (
                          <div className="text-muted-foreground">to {promotion.endDate}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono" data-testid={`text-orders-${promotion.id}`}>
                        {promotion.orders.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(promotion.revenueImpact)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(promotion.discountCost)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {promotion.roi > 0 ? (
                          <span className="text-green-600 dark:text-green-400 flex items-center justify-end gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {formatPercent(promotion.roi)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-view-${promotion.id}`}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
