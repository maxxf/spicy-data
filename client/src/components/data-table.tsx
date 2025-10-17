import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SortDirection = "asc" | "desc" | null;

interface Column<T> {
  key: string;
  label: string;
  render?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  className?: string;
  emptyMessage?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  className,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortKey(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortedData = [...data].sort((a, b) => {
    if (!sortKey || !sortDirection) return 0;

    const aVal = a[sortKey];
    const bVal = b[sortKey];

    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    }

    const aStr = String(aVal || "");
    const bStr = String(bVal || "");

    return sortDirection === "asc"
      ? aStr.localeCompare(bStr)
      : bStr.localeCompare(aStr);
  });

  const getSortIcon = (key: string) => {
    if (sortKey !== key) return <ChevronsUpDown className="w-3 h-3 ml-2" />;
    if (sortDirection === "asc")
      return <ChevronUp className="w-3 h-3 ml-2" />;
    return <ChevronDown className="w-3 h-3 ml-2" />;
  };

  if (data.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="text-empty-state">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border overflow-x-auto", className)}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                  column.className
                )}
              >
                {column.sortable ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort(column.key)}
                    className={cn(
                      "h-auto p-0 hover:bg-transparent font-medium",
                      column.align === "right" && "flex-row-reverse"
                    )}
                    data-testid={`button-sort-${column.key}`}
                  >
                    {column.label}
                    {getSortIcon(column.key)}
                  </Button>
                ) : (
                  <span className="font-medium">{column.label}</span>
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row, index) => (
            <TableRow
              key={index}
              className="hover-elevate"
              data-testid={`row-data-${index}`}
            >
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                    column.align === "right" && "font-mono tabular-nums",
                    column.className
                  )}
                  data-testid={`cell-${column.key}-${index}`}
                >
                  {column.render
                    ? column.render(row[column.key], row)
                    : row[column.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
