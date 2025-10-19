import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "lucide-react";

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
      // Parse dates as UTC to avoid timezone shifts
      const start = new Date(weekStart + 'T00:00:00Z');
      const end = new Date(weekEnd + 'T00:00:00Z');
      
      // Format using UTC to maintain Monday-Sunday consistency
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const startMonth = months[start.getUTCMonth()];
      const startDay = start.getUTCDate();
      const endMonth = months[end.getUTCMonth()];
      const endDay = end.getUTCDate();
      const year = end.getUTCFullYear();
      
      if (start.getUTCMonth() === end.getUTCMonth()) {
        return `${startMonth} ${startDay} - ${endDay}, ${year}`;
      } else {
        return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
      }
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
