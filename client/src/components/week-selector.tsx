import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";
import { format } from "date-fns";

interface WeekOption {
  weekStart: string;
  weekEnd: string;
}

interface WeekSelectorProps {
  weeks: WeekOption[] | undefined;
  isLoading?: boolean;
  selectedWeek: { weekStart: string; weekEnd: string } | null;
  onWeekChange: (week: { weekStart: string; weekEnd: string } | null) => void;
  showAllOption?: boolean;
}

export function WeekSelector({
  weeks,
  isLoading,
  selectedWeek,
  onWeekChange,
  showAllOption = false,
}: WeekSelectorProps) {

  const formatWeekRange = (weekStart: string, weekEnd: string) => {
    try {
      const start = new Date(weekStart);
      const end = new Date(weekEnd);
      const startStr = format(start, "MMM d");
      const endStr = format(end, "MMM d, yyyy");
      return `${startStr} - ${endStr}`;
    } catch {
      return `${weekStart} - ${weekEnd}`;
    }
  };

  const getSelectedValue = () => {
    if (!selectedWeek) return "all";
    return `${selectedWeek.weekStart}_${selectedWeek.weekEnd}`;
  };

  const handleValueChange = (value: string) => {
    if (value === "all") {
      onWeekChange(null);
    } else {
      const [weekStart, weekEnd] = value.split("_");
      onWeekChange({ weekStart, weekEnd });
    }
  };

  if (isLoading || !weeks) {
    return (
      <Select disabled>
        <SelectTrigger className="w-[280px]" data-testid="select-week">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <SelectValue placeholder="Loading weeks..." />
          </div>
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select value={getSelectedValue()} onValueChange={handleValueChange}>
      <SelectTrigger className="w-[280px]" data-testid="select-week">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          <SelectValue placeholder="Select week" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {showAllOption && (
          <SelectItem value="all" data-testid="week-option-all">
            All Weeks
          </SelectItem>
        )}
        {weeks.map((week) => (
          <SelectItem
            key={`${week.weekStart}_${week.weekEnd}`}
            value={`${week.weekStart}_${week.weekEnd}`}
            data-testid={`week-option-${week.weekStart}`}
          >
            {formatWeekRange(week.weekStart, week.weekEnd)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
