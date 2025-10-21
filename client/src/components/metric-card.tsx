import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number | null;
  changeLabel?: string;
  subtitle?: string;
  format?: "currency" | "number" | "percent" | "multiplier";
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({
  label,
  value,
  change,
  changeLabel,
  subtitle,
  format = "currency",
  icon,
  className,
}: MetricCardProps) {
  const formatValue = (val: string | number) => {
    const numVal = typeof val === "string" ? parseFloat(val) : val;
    
    if (isNaN(numVal)) return val;
    
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(numVal);
      case "percent":
        return `${numVal.toFixed(2)}%`;
      case "multiplier":
        return `${numVal.toFixed(2)}x`;
      case "number":
      default:
        return new Intl.NumberFormat("en-US").format(numVal);
    }
  };

  const getTrendIcon = () => {
    if (change === undefined || change === null || change === 0) return <Minus className="w-3 h-3" />;
    return change > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const getTrendColor = () => {
    if (change === undefined || change === null || change === 0) return "text-muted-foreground";
    return change > 0 ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500";
  };

  return (
    <Card className={cn("overflow-hidden", className)} data-testid={`card-metric-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground" data-testid={`text-label-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            {label}
          </p>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
        <div className="space-y-2">
          <p className="text-3xl font-semibold tracking-tight" data-testid={`text-value-${label.toLowerCase().replace(/\s+/g, "-")}`}>
            {formatValue(value)}
          </p>
          {change !== undefined && (
            <div className={cn("flex items-center gap-1 text-sm", getTrendColor())} data-testid={`text-change-${label.toLowerCase().replace(/\s+/g, "-")}`}>
              {getTrendIcon()}
              <span className="font-medium">
                {change === null ? "—" : `${Math.abs(change).toFixed(2)}%`}
              </span>
              {changeLabel && <>{" "}<span className="text-muted-foreground">{changeLabel}</span></>}
            </div>
          )}
          {subtitle && !change && (
            <p className="text-xs text-muted-foreground" data-testid={`text-subtitle-${label.toLowerCase().replace(/\s+/g, "-")}`}>
              {subtitle}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
