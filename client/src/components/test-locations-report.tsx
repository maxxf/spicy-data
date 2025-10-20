import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface WeeklyMetric {
  weekStartDate: string;
  sales: number;
  marketingSales: number;
  marketingSpend: number;
  marketingPercent: number;
  roas: number;
  payout: number;
  payoutPercent: number;
  payoutWithCogs: number;
}

interface LocationReport {
  locationId: string;
  locationName: string;
  weeklyMetrics: (WeeklyMetric | null)[];
}

interface TestLocationsReportData {
  weeks: string[];
  locations: LocationReport[];
}

export function TestLocationsReport({ clientId }: { clientId: string }) {
  const { toast } = useToast();
  const [selectedWeeks, setSelectedWeeks] = useState<number>(6); // Show last 6 weeks

  const { data, isLoading } = useQuery<TestLocationsReportData>({
    queryKey: ["/api/analytics/test-locations-report", clientId],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/test-locations-report?clientId=${clientId}`);
      if (!response.ok) throw new Error("Failed to fetch test locations report");
      return response.json();
    },
    enabled: !!clientId,
  });

  const displayWeeks = data?.weeks.slice(-selectedWeeks) || [];

  const exportToCSV = () => {
    if (!data || data.locations.length === 0) {
      toast({
        title: "No data to export",
        description: "No test location data available",
        variant: "destructive",
      });
      return;
    }

    const metrics = [
      'Sales (excl. tax)',
      'Marketing Sales', 
      'Marketing Spend',
      'Marketing %',
      'ROAS',
      'Payout $',
      'Payout %',
      'Payout with COGS (46%)'
    ];

    const csvRows: string[] = [];
    csvRows.push(['Location', 'Metric', ...displayWeeks.map(w => w)].join(','));

    data.locations.forEach(location => {
      metrics.forEach(metric => {
        const values = displayWeeks.map(week => {
          const weekData = location.weeklyMetrics[data.weeks.indexOf(week)];
          if (!weekData) return '';
          
          switch (metric) {
            case 'Sales (excl. tax)':
              return `$${weekData.sales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            case 'Marketing Sales':
              return `$${weekData.marketingSales.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            case 'Marketing Spend':
              return `$${weekData.marketingSpend.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            case 'Marketing %':
              return `${weekData.marketingPercent.toFixed(0)}%`;
            case 'ROAS':
              return weekData.roas.toFixed(1);
            case 'Payout $':
              return `$${weekData.payout.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            case 'Payout %':
              return `${weekData.payoutPercent.toFixed(0)}%`;
            case 'Payout with COGS (46%)':
              return `$${weekData.payoutWithCogs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
            default:
              return '';
          }
        });
        
        csvRows.push([location.locationName, metric, ...values].join(','));
      });
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-locations-report-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export successful",
      description: "Test locations report downloaded as CSV",
    });
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  if (!data || data.locations.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No test location data available. Make sure transaction data has been uploaded for the corp locations.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Show weeks:</label>
          <select
            value={selectedWeeks}
            onChange={(e) => setSelectedWeeks(Number(e.target.value))}
            className="border rounded px-3 py-1 text-sm"
            data-testid="select-weeks"
          >
            <option value={4}>Last 4 weeks</option>
            <option value={6}>Last 6 weeks</option>
            <option value={8}>Last 8 weeks</option>
            <option value={12}>Last 12 weeks</option>
            <option value={data.weeks.length}>All weeks</option>
          </select>
        </div>
        <Button
          onClick={exportToCSV}
          variant="outline"
          size="sm"
          data-testid="button-export-test-locations"
        >
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Location</TableHead>
              <TableHead className="sticky left-[200px] bg-background z-10 min-w-[180px]">Metric</TableHead>
              {displayWeeks.map((week) => (
                <TableHead key={week} className="text-center min-w-[120px]">
                  {new Date(week).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.locations.map((location) => {
              const metrics = [
                { label: 'Sales (excl. tax)', key: 'sales', format: formatCurrency },
                { label: 'Marketing Sales', key: 'marketingSales', format: formatCurrency },
                { label: 'Marketing Spend', key: 'marketingSpend', format: formatCurrency },
                { label: 'Marketing %', key: 'marketingPercent', format: (v: number) => `${v.toFixed(0)}%` },
                { label: 'ROAS', key: 'roas', format: (v: number) => v.toFixed(1) },
                { label: 'Payout $', key: 'payout', format: formatCurrency },
                { label: 'Payout %', key: 'payoutPercent', format: (v: number) => `${v.toFixed(0)}%` },
                { label: 'Payout with COGS (46%)', key: 'payoutWithCogs', format: formatCurrency },
              ];

              return metrics.map((metric, idx) => (
                <TableRow key={`${location.locationId}-${metric.key}`}>
                  {idx === 0 && (
                    <TableCell
                      rowSpan={metrics.length}
                      className="sticky left-0 bg-background z-10 font-medium align-top border-r"
                    >
                      {location.locationName}
                    </TableCell>
                  )}
                  <TableCell className="sticky left-[200px] bg-background z-10 text-sm text-muted-foreground border-r">
                    {metric.label}
                  </TableCell>
                  {displayWeeks.map((week) => {
                    const weekData = location.weeklyMetrics[data.weeks.indexOf(week)];
                    return (
                      <TableCell key={week} className="text-center text-sm">
                        {weekData ? metric.format(weekData[metric.key as keyof WeeklyMetric] as number) : '-'}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ));
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
