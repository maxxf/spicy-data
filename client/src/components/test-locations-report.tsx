import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, AlertTriangle, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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

export function TestLocationsReport({ clientId, isActive }: { clientId: string; isActive?: boolean }) {
  const { toast } = useToast();
  const [selectedWeeks, setSelectedWeeks] = useState<number>(8); // Show last 8 weeks by default

  const { data, isLoading } = useQuery<TestLocationsReportData>({
    queryKey: ["/api/analytics/test-locations-report", clientId],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/test-locations-report?clientId=${clientId}`, {
        credentials: 'include', // Include cookies for authentication
      });
      if (!response.ok) throw new Error("Failed to fetch test locations report");
      return response.json();
    },
    enabled: !!clientId && (isActive !== false),
  });

  const displayWeeks = data?.weeks.slice(-selectedWeeks) || [];

  // Helper to parse YYYY-MM-DD as local date (not UTC) to avoid timezone display issues
  const parseLocalDate = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  // Analyze data quality issues
  const analyzeDataQuality = () => {
    if (!data || data.locations.length === 0) return [];

    interface DataQualityIssue {
      type: 'warning' | 'info';
      location: string;
      week: string;
      issue: string;
    }

    const issues: DataQualityIssue[] = [];

    data.locations.forEach(location => {
      // Check for missing weeks
      const missingWeeks = data.weeks.filter((week, idx) => 
        location.weeklyMetrics[idx] === null
      );
      
      if (missingWeeks.length > 0 && missingWeeks.length < data.weeks.length) {
        // Create a formatted list of missing weeks for the message
        const weeksList = missingWeeks.map(w => 
          parseLocalDate(w).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        ).join(', ');
        
        issues.push({
          type: 'info',
          location: location.locationName,
          week: missingWeeks[0], // Use first missing week for date display
          issue: `Missing data for ${missingWeeks.length} week(s): ${weeksList}`
        });
      }

      location.weeklyMetrics.forEach((metric, idx) => {
        if (!metric) return;
        
        const week = data.weeks[idx];

        // Zero sales but positive payout
        if (metric.sales === 0 && metric.payout > 0) {
          issues.push({
            type: 'warning',
            location: location.locationName,
            week,
            issue: `Zero sales but payout of ${formatCurrency(metric.payout)} (check for adjustments/refunds)`
          });
        }

        // Unusually high ROAS (might indicate data issue)
        if (metric.roas > 20 && metric.marketingSpend > 0) {
          issues.push({
            type: 'info',
            location: location.locationName,
            week,
            issue: `Very high ROAS (${metric.roas.toFixed(1)}x) - verify marketing data is complete`
          });
        }

        // Negative payout with COGS
        if (metric.payoutWithCogs < 0) {
          issues.push({
            type: 'warning',
            location: location.locationName,
            week,
            issue: `Negative payout after COGS (${formatCurrency(metric.payoutWithCogs)}) - location operating at a loss`
          });
        }

        // Very low payout percentage
        if (metric.sales > 0 && metric.payoutPercent < 30) {
          issues.push({
            type: 'warning',
            location: location.locationName,
            week,
            issue: `Low payout percentage (${metric.payoutPercent.toFixed(0)}%) - high platform fees or adjustments`
          });
        }

        // Marketing spend higher than marketing sales
        if (metric.marketingSpend > metric.marketingSales && metric.marketingSpend > 0) {
          issues.push({
            type: 'warning',
            location: location.locationName,
            week,
            issue: `Marketing spend (${formatCurrency(metric.marketingSpend)}) exceeds marketing sales (${formatCurrency(metric.marketingSales)})`
          });
        }

        // Week-over-week changes (compare with previous week)
        if (idx > 0) {
          const prevMetric = location.weeklyMetrics[idx - 1];
          if (prevMetric && prevMetric.sales > 0) {
            const salesChange = ((metric.sales - prevMetric.sales) / prevMetric.sales) * 100;
            const salesDollarChange = metric.sales - prevMetric.sales;

            // Flag significant drops (>50% or >$1000 drop)
            if (salesChange < -50 || salesDollarChange < -1000) {
              issues.push({
                type: 'warning',
                location: location.locationName,
                week,
                issue: `Sales dropped ${Math.abs(salesChange).toFixed(0)}% (${formatCurrency(Math.abs(salesDollarChange))}) from previous week`
              });
            }

            // Flag significant increases (>100% or >$2000 increase) as unusual patterns
            if (salesChange > 100 && salesDollarChange > 2000) {
              issues.push({
                type: 'info',
                location: location.locationName,
                week,
                issue: `Sales increased ${salesChange.toFixed(0)}% (${formatCurrency(salesDollarChange)}) from previous week - verify data accuracy`
              });
            }
          }
        }
      });
    });

    return issues;
  };

  const dataQualityIssues = data ? analyzeDataQuality() : [];

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

    // Helper to escape CSV values (wrap in quotes if contains comma, quote, or newline)
    const escapeCSV = (value: string | number): string => {
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvRows: string[] = [];
    csvRows.push([escapeCSV('Location'), escapeCSV('Metric'), ...displayWeeks.map(w => escapeCSV(w))].join(','));

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
        
        csvRows.push([escapeCSV(location.locationName), escapeCSV(metric), ...values.map(v => escapeCSV(v))].join(','));
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
                  {parseLocalDate(week).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}
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

      {/* Data Quality Issues Section */}
      {dataQualityIssues.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600" />
            Data Quality Issues to Review
          </h3>
          <div className="space-y-2">
            {dataQualityIssues.map((issue, idx) => (
              <Alert 
                key={idx} 
                variant={issue.type === 'warning' ? 'destructive' : 'default'}
                className="py-2"
              >
                <div className="flex items-start gap-2">
                  {issue.type === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <AlertDescription className="text-sm">
                      <span className="font-medium">{issue.location}</span>
                      {' - '}
                      <span className="text-xs text-muted-foreground">
                        Week of {parseLocalDate(issue.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {': '}
                      {issue.issue}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            These alerts help identify potential data issues. Review your transaction data uploads and platform reports to ensure accuracy.
          </p>
        </div>
      )}

      {/* No issues message */}
      {dataQualityIssues.length === 0 && data && data.locations.length > 0 && (
        <div className="mt-6">
          <Alert>
            <Info className="w-4 h-4" />
            <AlertDescription className="text-sm">
              No significant data quality issues detected. All metrics appear consistent.
            </AlertDescription>
          </Alert>
        </div>
      )}
    </div>
  );
}
