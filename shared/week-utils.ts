/**
 * Utility functions for Monday-based week calculations
 * Weeks run from Monday to Sunday (e.g., 10/6 - 10/12)
 * All calculations use UTC to avoid timezone issues
 */

/**
 * Get the Monday of the week containing the given date (UTC-safe)
 */
export function getWeekStart(date: Date | string): Date {
  let d: Date;
  
  if (typeof date === 'string') {
    // Only append time if the string is date-only (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      d = new Date(date + 'T00:00:00Z');
    } else {
      d = new Date(date);
    }
  } else {
    d = new Date(date);
  }
  
  // Work entirely in UTC
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const dayOfWeek = d.getUTCDay();
  
  // Calculate days to subtract to get to Monday
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  // Create Monday at midnight UTC
  return new Date(Date.UTC(year, month, day + diff, 0, 0, 0, 0));
}

/**
 * Get the Sunday of the week containing the given date (UTC-safe)
 */
export function getWeekEnd(date: Date | string): Date {
  const monday = getWeekStart(date);
  
  // Get Sunday (6 days after Monday) at end of day UTC
  const year = monday.getUTCFullYear();
  const month = monday.getUTCMonth();
  const day = monday.getUTCDate();
  
  return new Date(Date.UTC(year, month, day + 6, 23, 59, 59, 999));
}

/**
 * Format a date as YYYY-MM-DD using UTC components
 */
export function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get week start and end dates in YYYY-MM-DD format for a given date
 */
export function getWeekRange(date: Date | string): { weekStart: string; weekEnd: string } {
  const d = typeof date === 'string' ? new Date(date) : date;
  return {
    weekStart: formatDate(getWeekStart(d)),
    weekEnd: formatDate(getWeekEnd(d)),
  };
}

/**
 * Format a week range for display (e.g., "Oct 6 – Oct 12, 2024") using UTC
 */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00Z');
  const end = new Date(weekEnd + 'T00:00:00Z');
  
  // Month names array for UTC-safe formatting
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const startMonth = months[start.getUTCMonth()];
  const startDay = start.getUTCDate();
  const endMonth = months[end.getUTCMonth()];
  const endDay = end.getUTCDate();
  const year = end.getUTCFullYear();
  
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${startMonth} ${startDay} – ${endDay}, ${year}`;
  } else {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
  }
}

/**
 * Get all unique weeks from a list of dates
 * Returns array sorted by most recent first
 */
export function getUniqueWeeks(dates: (Date | string)[]): Array<{ weekStart: string; weekEnd: string }> {
  const weeksMap = new Map<string, { weekStart: string; weekEnd: string }>();
  
  for (const date of dates) {
    const { weekStart, weekEnd } = getWeekRange(date);
    weeksMap.set(weekStart, { weekStart, weekEnd });
  }
  
  return Array.from(weeksMap.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}
