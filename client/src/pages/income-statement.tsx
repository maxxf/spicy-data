import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, Info } from 'lucide-react';
import { SiUbereats, SiDoordash } from 'react-icons/si';
import { GiHotMeal } from 'react-icons/gi';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PlatformData {
  transactions: number;
  salesInclTax: number;
  salesExclTax: number;
  unfulfilledSales: number;
  unfulfilledRefunds: number;
  taxes: number;
  taxesWithheld: number;
  taxesBackup: number;
  commissions: number;
  restDeliveryCharge: number;
  loyalty: number;
  adSpend: number;
  promoSpend: number;
  ddMarketingFee: number;
  merchantFundedDiscount: number;
  thirdPartyFundedDiscount: number;
  customerRefunds: number;
  wonDisputes: number;
  customerTip: number;
  restaurantFees: number;
  miscellaneous: number;
  unaccounted: number;
  netPayout: number;
  marketing: number;
  others: number;
  costOfGoodsSold: number;
  netMargin: number;
}

interface IncomeStatementData {
  dateRange: { start?: string; end?: string };
  platforms: {
    uberEats: PlatformData;
    doorDash: PlatformData;
    grubhub: PlatformData;
  };
  totals: PlatformData;
}

export default function IncomeStatement() {
  const [clientId] = useState('83506705-b408-4f0a-a9b0-e5b585db3b7d'); // Default client
  const [dateRange, setDateRange] = useState<{ start?: string; end?: string }>({});

  const { data, isLoading } = useQuery<IncomeStatementData>({
    queryKey: ['/api/analytics/income-statement', clientId, dateRange.start, dateRange.end],
    enabled: !!clientId,
  });

  const formatCurrency = (value: number) => {
    const formatted = value.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return value < 0 ? `-$${formatted.replace('-', '')}` : `$${formatted}`;
  };

  const formatPercent = (value: number, total: number) => {
    if (total === 0) return '0%';
    const percent = (value / total) * 100;
    return `${percent.toFixed(2)}%`;
  };

  const exportToCSV = () => {
    if (!data) return;

    const rows: string[][] = [];
    
    // Header
    rows.push(['Component', 'Uber Eats', '', 'DoorDash', '', 'Grubhub', '', 'Total', '']);
    rows.push(['', 'Amount', '%', 'Amount', '%', 'Amount', '%', 'Amount', '%']);
    
    // Helper to add row
    const addRow = (label: string, uberVal: number, doorVal: number, grubVal: number, totalVal: number) => {
      const uberPct = formatPercent(uberVal, data.platforms.uberEats.salesInclTax);
      const doorPct = formatPercent(doorVal, data.platforms.doorDash.salesInclTax);
      const grubPct = formatPercent(grubVal, data.platforms.grubhub.salesInclTax);
      const totalPct = formatPercent(totalVal, data.totals.salesInclTax);
      
      rows.push([
        label,
        formatCurrency(uberVal),
        uberPct,
        formatCurrency(doorVal),
        doorPct,
        formatCurrency(grubVal),
        grubPct,
        formatCurrency(totalVal),
        totalPct
      ]);
    };

    // Add all metrics
    addRow('Number of Transactions', data.platforms.uberEats.transactions, data.platforms.doorDash.transactions, data.platforms.grubhub.transactions, data.totals.transactions);
    addRow('Sales Incl. Tax', data.platforms.uberEats.salesInclTax, data.platforms.doorDash.salesInclTax, data.platforms.grubhub.salesInclTax, data.totals.salesInclTax);
    addRow('Sales Excl. Tax', data.platforms.uberEats.salesExclTax, data.platforms.doorDash.salesExclTax, data.platforms.grubhub.salesExclTax, data.totals.salesExclTax);
    addRow('Commissions', -data.platforms.uberEats.commissions, -data.platforms.doorDash.commissions, -data.platforms.grubhub.commissions, -data.totals.commissions);
    addRow('Marketing', -data.platforms.uberEats.marketing, -data.platforms.doorDash.marketing, -data.platforms.grubhub.marketing, -data.totals.marketing);
    addRow('Net Payout', data.platforms.uberEats.netPayout, data.platforms.doorDash.netPayout, data.platforms.grubhub.netPayout, data.totals.netPayout);
    addRow('Cost of Goods Sold', -data.platforms.uberEats.costOfGoodsSold, -data.platforms.doorDash.costOfGoodsSold, -data.platforms.grubhub.costOfGoodsSold, -data.totals.costOfGoodsSold);
    addRow('Net Margin', data.platforms.uberEats.netMargin, data.platforms.doorDash.netMargin, data.platforms.grubhub.netMargin, data.totals.netMargin);

    const csvContent = rows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `income-statement-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-12 w-full" />
        {[...Array(15)].map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No data available. Upload transaction data to generate the income statement.
      </div>
    );
  }

  const { platforms, totals } = data;

  interface MetricRowProps {
    label: string;
    value: (platform: PlatformData) => number;
    isNegative?: boolean;
    indentLevel?: number;
    tooltip?: string;
    className?: string;
  }

  const MetricRow = ({ label, value, isNegative = false, indentLevel = 0, tooltip, className = '' }: MetricRowProps) => {
    const uber = value(platforms.uberEats);
    const door = value(platforms.doorDash);
    const grub = value(platforms.grubhub);
    const total = value(totals);
    
    const displayValue = (val: number) => isNegative ? -val : val;
    const uberPct = platforms.uberEats.salesInclTax > 0 ? (displayValue(uber) / platforms.uberEats.salesInclTax) * 100 : 0;
    const doorPct = platforms.doorDash.salesInclTax > 0 ? (displayValue(door) / platforms.doorDash.salesInclTax) * 100 : 0;
    const grubPct = platforms.grubhub.salesInclTax > 0 ? (displayValue(grub) / platforms.grubhub.salesInclTax) * 100 : 0;
    const totalPct = totals.salesInclTax > 0 ? (displayValue(total) / totals.salesInclTax) * 100 : 0;

    const ValueCell = ({ val, pct, showPercent = true }: { val: number; pct: number; showPercent?: boolean }) => (
      <div className="flex items-baseline justify-between gap-2 py-3 px-3">
        <span className={`font-medium ${val < 0 ? 'text-red-600' : ''}`}>
          {formatCurrency(displayValue(val))}
        </span>
        {showPercent && (
          <span className="text-xs text-muted-foreground min-w-12 text-right">
            {pct.toFixed(2)}%
          </span>
        )}
      </div>
    );

    return (
      <div className={`grid grid-cols-[minmax(200px,_1fr)_repeat(4,_minmax(150px,_1fr))] border-b hover-elevate ${className}`}>
        <div className={`flex items-center py-3 px-4 gap-2`} style={{ paddingLeft: `${16 + indentLevel * 16}px` }}>
          <span className="font-medium">{label}</span>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" data-testid={`tooltip-${label.toLowerCase().replace(/\s+/g, '-')}`} />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <ValueCell val={uber} pct={uberPct} showPercent={label !== 'Number of Transactions'} />
        <ValueCell val={door} pct={doorPct} showPercent={label !== 'Number of Transactions'} />
        <ValueCell val={grub} pct={grubPct} showPercent={label !== 'Number of Transactions'} />
        <ValueCell val={total} pct={totalPct} showPercent={label !== 'Number of Transactions'} />
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Income Statement</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Financial breakdown by platform
          </p>
        </div>
        <Button onClick={exportToCSV} variant="outline" data-testid="button-export-csv">
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Main Table */}
      <Card>
        <CardHeader>
          <CardTitle>This Period's Payout Summary</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Table Header */}
          <div className="grid grid-cols-[minmax(200px,_1fr)_repeat(4,_minmax(150px,_1fr))] border-b bg-muted/50">
            <div className="py-3 px-4 font-semibold">Component</div>
            <div className="py-3 px-3 font-semibold flex items-center gap-2">
              <SiUbereats className="h-4 w-4" />
              Uber Eats
            </div>
            <div className="py-3 px-3 font-semibold flex items-center gap-2">
              <SiDoordash className="h-4 w-4" />
              DoorDash
            </div>
            <div className="py-3 px-3 font-semibold flex items-center gap-2">
              <GiHotMeal className="h-4 w-4" />
              Grubhub
            </div>
            <div className="py-3 px-3 font-semibold">Total</div>
          </div>

          {/* Metrics */}
          <div className="divide-y">
            <MetricRow 
              label="Number of Transactions" 
              value={(p) => p.transactions}
            />
            
            <MetricRow 
              label="Sales Incl. Tax" 
              value={(p) => p.salesInclTax}
              className="bg-muted/30"
            />
            
            <MetricRow 
              label="Sales Excl. Tax" 
              value={(p) => p.salesExclTax}
            />
            
            <MetricRow 
              label="Unfulfilled Sales" 
              value={(p) => p.unfulfilledSales}
            />
            
            <MetricRow 
              label="Unfulfilled Refunds" 
              value={(p) => p.unfulfilledRefunds}
              isNegative
            />
            
            <MetricRow 
              label="Taxes" 
              value={(p) => p.taxes}
              tooltip="Taxes paid to merchant"
            />
            
            <MetricRow 
              label="Taxes Withheld" 
              value={(p) => p.taxesWithheld}
            />
            
            <MetricRow 
              label="Taxes Backup" 
              value={(p) => p.taxesBackup}
              tooltip="Backup withholding for tax compliance (Uber Eats specific)"
            />
            
            <MetricRow 
              label="Commissions" 
              value={(p) => p.commissions}
              isNegative
              className="bg-muted/30"
            />
            
            <MetricRow 
              label="Rest. Delivery Charge" 
              value={(p) => p.restDeliveryCharge}
            />
            
            <MetricRow 
              label="Marketing" 
              value={(p) => p.marketing}
              isNegative
              className="bg-muted/30"
            />
            
            <MetricRow 
              label="Loyalty" 
              value={(p) => p.loyalty}
              isNegative
              indentLevel={1}
            />
            
            <MetricRow 
              label="Ad Spend" 
              value={(p) => p.adSpend}
              isNegative
              indentLevel={1}
            />
            
            <MetricRow 
              label="Promo Spend" 
              value={(p) => p.promoSpend}
              isNegative
              indentLevel={1}
            />
            
            <MetricRow 
              label="DoorDash Marketing Fee" 
              value={(p) => p.ddMarketingFee}
              isNegative
              indentLevel={1}
              tooltip="Marketing credits and promotional fees specific to DoorDash"
            />
            
            <MetricRow 
              label="Merchant Funded Discount" 
              value={(p) => p.merchantFundedDiscount}
              isNegative
              indentLevel={1}
              tooltip="Discounts funded by the restaurant"
            />
            
            <MetricRow 
              label="3P Funded Discount" 
              value={(p) => p.thirdPartyFundedDiscount}
              isNegative
              indentLevel={1}
              tooltip="Discounts funded by the third-party platform"
            />
            
            <MetricRow 
              label="Customer Refunds" 
              value={(p) => p.customerRefunds}
              isNegative
            />
            
            <MetricRow 
              label="Won Disputes" 
              value={(p) => p.wonDisputes}
            />
            
            <MetricRow 
              label="Others" 
              value={(p) => p.others}
            />
            
            <MetricRow 
              label="Customer Tip" 
              value={(p) => p.customerTip}
              indentLevel={1}
            />
            
            <MetricRow 
              label="Restaurant Fees" 
              value={(p) => p.restaurantFees}
              indentLevel={1}
            />
            
            <MetricRow 
              label="Miscellaneous" 
              value={(p) => p.miscellaneous}
              indentLevel={1}
            />
            
            <MetricRow 
              label="Unaccounted" 
              value={(p) => p.unaccounted}
              indentLevel={1}
            />
            
            <MetricRow 
              label="Net Payout" 
              value={(p) => p.netPayout}
              className="bg-primary/10 font-semibold"
            />
            
            <MetricRow 
              label="Cost of Goods Sold" 
              value={(p) => p.costOfGoodsSold}
              isNegative
              tooltip="Calculated as 46% of Sales Incl. Tax"
            />
            
            <MetricRow 
              label="Net Margin" 
              value={(p) => p.netMargin}
              className="bg-primary/20 font-semibold"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
