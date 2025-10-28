import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Download, Link2, Info, AlertCircle } from 'lucide-react';
import { SiUbereats, SiDoordash } from 'react-icons/si';
import { GiHotMeal } from 'react-icons/gi';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { Client } from "@shared/schema";

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

const PercentBadge = ({ value, total }: { value: number; total: number }) => {
  if (total === 0) return <Badge variant="secondary" className="text-xs font-normal">0%</Badge>;
  
  const percent = (value / total) * 100;
  const absPercent = Math.abs(percent);
  
  return (
    <Badge 
      variant="secondary" 
      className="text-xs font-normal bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-0"
    >
      {absPercent.toFixed(2)}%
    </Badge>
  );
};

const CategoryIndicator = ({ color = "orange" }: { color?: string }) => {
  const colorClasses = {
    orange: "bg-orange-500",
    blue: "bg-blue-500",
    green: "bg-green-500",
  };
  
  return (
    <div className={`w-2 h-2 rounded-sm ${colorClasses[color as keyof typeof colorClasses] || colorClasses.orange}`} />
  );
};

export default function IncomeStatement() {
  const [clientId, setClientId] = useState('83506705-b408-4f0a-a9b0-e5b585db3b7d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: clients } = useQuery<Client[]>({
    queryKey: ['/api/clients'],
  });

  const { data, isLoading } = useQuery<IncomeStatementData>({
    queryKey: ['/api/analytics/income-statement', clientId, startDate || undefined, endDate || undefined],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (clientId) params.append('clientId', clientId);
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      const response = await fetch(`/api/analytics/income-statement?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch income statement');
      return response.json();
    },
    enabled: !!clientId,
  });

  const formatCurrency = (value: number) => {
    const formatted = value.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return value < 0 ? `-$${formatted.replace('-', '')}` : `$${formatted}`;
  };

  const exportToCSV = () => {
    if (!data) return;

    const rows: string[][] = [];
    
    rows.push(['Component', 'Uber Eats', '', 'DoorDash', '', 'Grubhub', '', 'Total', '']);
    rows.push(['', 'Amount', '%', 'Amount', '%', 'Amount', '%', 'Amount', '%']);
    
    const addRow = (label: string, uberVal: number, doorVal: number, grubVal: number, totalVal: number, isNegative = false) => {
      const displayValue = (val: number) => isNegative ? -val : val;
      const uberPct = data.platforms.uberEats.salesInclTax > 0 ? (displayValue(uberVal) / data.platforms.uberEats.salesInclTax) * 100 : 0;
      const doorPct = data.platforms.doorDash.salesInclTax > 0 ? (displayValue(doorVal) / data.platforms.doorDash.salesInclTax) * 100 : 0;
      const grubPct = data.platforms.grubhub.salesInclTax > 0 ? (displayValue(grubVal) / data.platforms.grubhub.salesInclTax) * 100 : 0;
      const totalPct = data.totals.salesInclTax > 0 ? (displayValue(totalVal) / data.totals.salesInclTax) * 100 : 0;
      
      rows.push([
        label,
        formatCurrency(displayValue(uberVal)),
        `${uberPct.toFixed(2)}%`,
        formatCurrency(displayValue(doorVal)),
        `${doorPct.toFixed(2)}%`,
        formatCurrency(displayValue(grubVal)),
        `${grubPct.toFixed(2)}%`,
        formatCurrency(displayValue(totalVal)),
        `${totalPct.toFixed(2)}%`
      ]);
    };

    addRow('Number of Transactions', data.platforms.uberEats.transactions, data.platforms.doorDash.transactions, data.platforms.grubhub.transactions, data.totals.transactions);
    addRow('Sales Incl. Tax', data.platforms.uberEats.salesInclTax, data.platforms.doorDash.salesInclTax, data.platforms.grubhub.salesInclTax, data.totals.salesInclTax);
    addRow('Sales Excl. Tax', data.platforms.uberEats.salesExclTax, data.platforms.doorDash.salesExclTax, data.platforms.grubhub.salesExclTax, data.totals.salesExclTax);
    addRow('Unfulfilled Sales', data.platforms.uberEats.unfulfilledSales, data.platforms.doorDash.unfulfilledSales, data.platforms.grubhub.unfulfilledSales, data.totals.unfulfilledSales);
    addRow('Unfulfilled Refunds', data.platforms.uberEats.unfulfilledRefunds, data.platforms.doorDash.unfulfilledRefunds, data.platforms.grubhub.unfulfilledRefunds, data.totals.unfulfilledRefunds, true);
    addRow('Taxes', data.platforms.uberEats.taxes, data.platforms.doorDash.taxes, data.platforms.grubhub.taxes, data.totals.taxes);
    addRow('Taxes Withheld', data.platforms.uberEats.taxesWithheld, data.platforms.doorDash.taxesWithheld, data.platforms.grubhub.taxesWithheld, data.totals.taxesWithheld);
    addRow('Taxes Backup', data.platforms.uberEats.taxesBackup, data.platforms.doorDash.taxesBackup, data.platforms.grubhub.taxesBackup, data.totals.taxesBackup);
    addRow('Commissions', data.platforms.uberEats.commissions, data.platforms.doorDash.commissions, data.platforms.grubhub.commissions, data.totals.commissions, true);
    addRow('Rest. Delivery Charge', data.platforms.uberEats.restDeliveryCharge, data.platforms.doorDash.restDeliveryCharge, data.platforms.grubhub.restDeliveryCharge, data.totals.restDeliveryCharge);
    addRow('Marketing', data.platforms.uberEats.marketing, data.platforms.doorDash.marketing, data.platforms.grubhub.marketing, data.totals.marketing, true);
    addRow('  Loyalty', data.platforms.uberEats.loyalty, data.platforms.doorDash.loyalty, data.platforms.grubhub.loyalty, data.totals.loyalty, true);
    addRow('  Ad Spend', data.platforms.uberEats.adSpend, data.platforms.doorDash.adSpend, data.platforms.grubhub.adSpend, data.totals.adSpend, true);
    addRow('  Promo Spend', data.platforms.uberEats.promoSpend, data.platforms.doorDash.promoSpend, data.platforms.grubhub.promoSpend, data.totals.promoSpend, true);
    addRow('  DoorDash Marketing Fee', data.platforms.uberEats.ddMarketingFee, data.platforms.doorDash.ddMarketingFee, data.platforms.grubhub.ddMarketingFee, data.totals.ddMarketingFee, true);
    addRow('  Merchant Funded Discount', data.platforms.uberEats.merchantFundedDiscount, data.platforms.doorDash.merchantFundedDiscount, data.platforms.grubhub.merchantFundedDiscount, data.totals.merchantFundedDiscount, true);
    addRow('  3P Funded Discount', data.platforms.uberEats.thirdPartyFundedDiscount, data.platforms.doorDash.thirdPartyFundedDiscount, data.platforms.grubhub.thirdPartyFundedDiscount, data.totals.thirdPartyFundedDiscount, true);
    addRow('Customer Refunds', data.platforms.uberEats.customerRefunds, data.platforms.doorDash.customerRefunds, data.platforms.grubhub.customerRefunds, data.totals.customerRefunds, true);
    addRow('Won Disputes', data.platforms.uberEats.wonDisputes, data.platforms.doorDash.wonDisputes, data.platforms.grubhub.wonDisputes, data.totals.wonDisputes);
    addRow('Others', data.platforms.uberEats.others, data.platforms.doorDash.others, data.platforms.grubhub.others, data.totals.others);
    addRow('  Customer Tip', data.platforms.uberEats.customerTip, data.platforms.doorDash.customerTip, data.platforms.grubhub.customerTip, data.totals.customerTip);
    addRow('  Restaurant Fees', data.platforms.uberEats.restaurantFees, data.platforms.doorDash.restaurantFees, data.platforms.grubhub.restaurantFees, data.totals.restaurantFees);
    addRow('  Miscellaneous', data.platforms.uberEats.miscellaneous, data.platforms.doorDash.miscellaneous, data.platforms.grubhub.miscellaneous, data.totals.miscellaneous);
    addRow('  Unaccounted', data.platforms.uberEats.unaccounted, data.platforms.doorDash.unaccounted, data.platforms.grubhub.unaccounted, data.totals.unaccounted);
    addRow('Net Payout', data.platforms.uberEats.netPayout, data.platforms.doorDash.netPayout, data.platforms.grubhub.netPayout, data.totals.netPayout);
    addRow('Cost of Goods Sold', data.platforms.uberEats.costOfGoodsSold, data.platforms.doorDash.costOfGoodsSold, data.platforms.grubhub.costOfGoodsSold, data.totals.costOfGoodsSold, true);
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
    isHighlight?: boolean;
    hasCategory?: boolean;
    categoryColor?: string;
  }

  const MetricRow = ({ 
    label, 
    value, 
    isNegative = false, 
    indentLevel = 0, 
    tooltip, 
    isHighlight = false,
    hasCategory = false,
    categoryColor = "orange"
  }: MetricRowProps) => {
    const uber = value(platforms.uberEats);
    const door = value(platforms.doorDash);
    const grub = value(platforms.grubhub);
    const total = value(totals);
    
    const displayValue = (val: number) => isNegative ? -val : val;
    const uberPct = platforms.uberEats.salesInclTax > 0 ? (displayValue(uber) / platforms.uberEats.salesInclTax) * 100 : 0;
    const doorPct = platforms.doorDash.salesInclTax > 0 ? (displayValue(door) / platforms.doorDash.salesInclTax) * 100 : 0;
    const grubPct = platforms.grubhub.salesInclTax > 0 ? (displayValue(grub) / platforms.grubhub.salesInclTax) * 100 : 0;
    const totalPct = totals.salesInclTax > 0 ? (displayValue(total) / totals.salesInclTax) * 100 : 0;

    const ValueCell = ({ val, pct, baseTotal, showPercent = true, isTotal = false }: { 
      val: number; 
      pct: number; 
      baseTotal: number;
      showPercent?: boolean; 
      isTotal?: boolean;
    }) => {
      const cellBg = isTotal && isHighlight 
        ? "bg-slate-700 dark:bg-slate-800" 
        : "";
      
      return (
        <div className={`flex flex-col gap-1 py-3 px-4 ${cellBg}`}>
          <div className="flex items-baseline justify-between gap-3">
            {showPercent && (
              <PercentBadge value={displayValue(val)} total={baseTotal} />
            )}
            <span className={`font-medium text-sm ml-auto ${val < 0 ? 'text-red-600 dark:text-red-400' : isTotal && isHighlight ? 'text-white' : ''}`}>
              {formatCurrency(displayValue(val))}
            </span>
          </div>
        </div>
      );
    };

    return (
      <div className="grid grid-cols-[minmax(220px,_1fr)_repeat(4,_minmax(160px,_1fr))] border-b border-border/50 hover-elevate">
        <div 
          className="flex items-center gap-2 py-3 px-4 text-sm" 
          style={{ paddingLeft: `${16 + indentLevel * 20}px` }}
        >
          {hasCategory && <CategoryIndicator color={categoryColor} />}
          <span className="font-medium">{label}</span>
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" data-testid={`tooltip-${label.toLowerCase().replace(/\s+/g, '-')}`} />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p>{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        <ValueCell 
          val={uber} 
          pct={uberPct} 
          baseTotal={platforms.uberEats.salesInclTax}
          showPercent={label !== 'Number of Transactions'} 
        />
        <ValueCell 
          val={door} 
          pct={doorPct} 
          baseTotal={platforms.doorDash.salesInclTax}
          showPercent={label !== 'Number of Transactions'} 
        />
        <ValueCell 
          val={grub} 
          pct={grubPct} 
          baseTotal={platforms.grubhub.salesInclTax}
          showPercent={label !== 'Number of Transactions'} 
        />
        <ValueCell 
          val={total} 
          pct={totalPct} 
          baseTotal={totals.salesInclTax}
          showPercent={label !== 'Number of Transactions'} 
          isTotal
        />
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6" data-testid="page-income-statement">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Balance || Income Statement</h1>
          <Link2 className="h-5 w-5 text-muted-foreground" />
        </div>
        {data && (
          <Button onClick={exportToCSV} variant="outline" size="sm" data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-[200px]" data-testid="select-client">
            <SelectValue placeholder="Select Client" />
          </SelectTrigger>
          <SelectContent>
            {clients?.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-background">
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border-0 p-0 h-auto focus-visible:ring-0 w-[130px]"
            placeholder="Start date"
            data-testid="input-start-date"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border-0 p-0 h-auto focus-visible:ring-0 w-[130px]"
            placeholder="End date"
            data-testid="input-end-date"
          />
        </div>

        {(startDate || endDate) && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setStartDate('');
              setEndDate('');
            }}
            className="text-destructive hover:text-destructive"
            data-testid="button-reset-filters"
          >
            Reset
          </Button>
        )}
      </div>

      {/* Main Table Card */}
      <Card className="overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-base font-semibold">This period's payout summary</h2>
        </div>

        {/* Table */}
        <div className="overflow-auto">
          {/* Table Header */}
          <div className="grid grid-cols-[minmax(220px,_1fr)_repeat(4,_minmax(160px,_1fr))] border-b bg-muted/30 sticky top-0 z-10">
            <div className="py-3 px-4 font-semibold text-sm">Component</div>
            <div className="py-3 px-4 font-semibold text-sm flex items-center gap-2">
              <SiUbereats className="h-4 w-4" />
              Uber Eats
            </div>
            <div className="py-3 px-4 font-semibold text-sm flex items-center gap-2">
              <SiDoordash className="h-4 w-4" />
              DoorDash
            </div>
            <div className="py-3 px-4 font-semibold text-sm flex items-center gap-2">
              <GiHotMeal className="h-4 w-4" />
              Grubhub
            </div>
            <div className="py-3 px-4 font-semibold text-sm">Total</div>
          </div>

          {/* Metrics Rows */}
          <div>
            <MetricRow 
              label="Number of Transactions" 
              value={(p) => p.transactions}
            />
            
            <MetricRow 
              label="Sales Incl. Tax" 
              value={(p) => p.salesInclTax}
              isHighlight
            />
            
            <MetricRow 
              label="Sales Excl. Tax" 
              value={(p) => p.salesExclTax}
              isHighlight
            />
            
            <MetricRow 
              label="Unfulfilled Sales" 
              value={(p) => p.unfulfilledSales}
            />
            
            <MetricRow 
              label="Unfulfilled Refunds" 
              value={(p) => p.unfulfilledRefunds}
              isNegative
              hasCategory
            />
            
            <MetricRow 
              label="Taxes" 
              value={(p) => p.taxes}
              tooltip="Taxes paid to merchant"
            />
            
            <MetricRow 
              label="Taxes Withheld" 
              value={(p) => p.taxesWithheld}
              indentLevel={1}
            />
            
            <MetricRow 
              label="Taxes Backup" 
              value={(p) => p.taxesBackup}
              tooltip="Backup withholding for tax compliance"
              indentLevel={1}
            />
            
            <MetricRow 
              label="Commissions" 
              value={(p) => p.commissions}
              isNegative
            />
            
            <MetricRow 
              label="Rest. Delivery Charge" 
              value={(p) => p.restDeliveryCharge}
            />
            
            <MetricRow 
              label="Marketing" 
              value={(p) => p.marketing}
              isNegative
              hasCategory
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
              tooltip="Marketing fees specific to DoorDash"
            />
            
            <MetricRow 
              label="Merchant Funded Discount" 
              value={(p) => p.merchantFundedDiscount}
              isNegative
              indentLevel={1}
            />
            
            <MetricRow 
              label="3P Funded Discount" 
              value={(p) => p.thirdPartyFundedDiscount}
              isNegative
              indentLevel={1}
            />
            
            <MetricRow 
              label="Customer Refunds" 
              value={(p) => p.customerRefunds}
              isNegative
              hasCategory
            />
            
            <MetricRow 
              label="Won Disputes" 
              value={(p) => p.wonDisputes}
              indentLevel={1}
            />
            
            <MetricRow 
              label="Others" 
              value={(p) => p.others}
              hasCategory
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
              isHighlight
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
              isHighlight
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
