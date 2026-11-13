import { TimeRecord } from "./defaultData";

export function formatHM(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

export function formatHMS(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDecimalHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  return hours.toFixed(2).replace(".", ",");
}

export function parseDurationString(str: string): number | null {
  const trimmed = str.trim();
  const hmMatch = trimmed.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (hmMatch) {
    const h = parseInt(hmMatch[1], 10);
    const m = parseInt(hmMatch[2], 10);
    const s = hmMatch[3] ? parseInt(hmMatch[3], 10) : 0;
    return h * 3600 + m * 60 + s;
  }
  const decMatch = trimmed.match(/^(\d+)[,.](\d+)$/);
  if (decMatch) {
    const hours = parseFloat(`${decMatch[1]}.${decMatch[2]}`);
    return Math.round(hours * 3600);
  }
  return null;
}

export function formatGermanDateHeader(isoDate: string): string {
  try {
    const [y, m, d] = isoDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekday = dateObj.toLocaleDateString("de-DE", { weekday: "long" });
    const formatted = `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
    return `${weekday}, ${formatted}`;
  } catch {
    return isoDate;
  }
}

export function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTodayISO(): string {
  return toISODate(new Date());
}

export const REPORT_RANGES = [
  { value: "last_30_days", label: "last 30 days" },
  { value: "this_month", label: "this month" },
  { value: "last_90_days", label: "last 90 days" },
  { value: "last_month", label: "last month" },
  { value: "last_180_days", label: "last 180 days" },
  { value: "this_year", label: "this year" },
  { value: "last_365_days", label: "last 365 days" },
  { value: "last_year", label: "last year" },
  { value: "all_time", label: "all time" },
] as const;

export function getReportRangeLabel(rangeValue: string): string {
  const found = REPORT_RANGES.find((r) => r.value === rangeValue);
  if (found) return found.label;
  if (rangeValue === "all") return "all time";
  return rangeValue;
}

export function matchesReportRange(recordDateISO: string, range: string, nowDate: Date = new Date()): boolean {
  if (!range || range === "all_time" || range === "all") return true;

  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const todayISO = toISODate(today);

  const [ry, rm, rd] = recordDateISO.split("-").map(Number);
  if (!ry || !rm || !rd) return true;

  const daysAgoISO = (days: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return toISODate(d);
  };

  switch (range) {
    case "last_30_days": {
      const startISO = daysAgoISO(30);
      return recordDateISO >= startISO && recordDateISO <= todayISO;
    }
    case "this_month": {
      return ry === today.getFullYear() && rm === today.getMonth() + 1;
    }
    case "last_90_days": {
      const startISO = daysAgoISO(90);
      return recordDateISO >= startISO && recordDateISO <= todayISO;
    }
    case "last_month": {
      const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return ry === lastMonthDate.getFullYear() && rm === lastMonthDate.getMonth() + 1;
    }
    case "last_180_days": {
      const startISO = daysAgoISO(180);
      return recordDateISO >= startISO && recordDateISO <= todayISO;
    }
    case "this_year": {
      return ry === today.getFullYear();
    }
    case "last_365_days": {
      const startISO = daysAgoISO(365);
      return recordDateISO >= startISO && recordDateISO <= todayISO;
    }
    case "last_year": {
      return ry === today.getFullYear() - 1;
    }
    default:
      return true;
  }
}

export interface KpiPeriodStats {
  currentWeekSeconds: number;
  currentWeekAvgExclToday: number;
  currentWeekAvgInclToday: number;
  lastWeekSeconds: number;
  lastWeekAvg: number;
  currentMonthSeconds: number;
  currentMonthAvgExclToday: number;
  currentMonthAvgInclToday: number;
  lastMonthSeconds: number;
  lastMonthAvg: number;
}

export function computeKpiStats(
  records: TimeRecord[],
  getLiveSeconds: (r: TimeRecord) => number,
  nowDate: Date = new Date()
): KpiPeriodStats {
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  const todayISO = toISODate(today);

  // Monday of current week (ISO week: Monday = 1 ... Sunday = 7)
  const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
  const currentWeekMonday = new Date(today);
  currentWeekMonday.setDate(today.getDate() - (dayOfWeek - 1));
  const currentWeekSunday = new Date(currentWeekMonday);
  currentWeekSunday.setDate(currentWeekMonday.getDate() + 6);

  const currentWeekStartISO = toISODate(currentWeekMonday);
  const currentWeekEndISO = toISODate(currentWeekSunday);

  // Previous week (Monday to Sunday)
  const lastWeekMonday = new Date(currentWeekMonday);
  lastWeekMonday.setDate(currentWeekMonday.getDate() - 7);
  const lastWeekSunday = new Date(currentWeekMonday);
  lastWeekSunday.setDate(currentWeekMonday.getDate() - 1);

  const lastWeekStartISO = toISODate(lastWeekMonday);
  const lastWeekEndISO = toISODate(lastWeekSunday);

  // Current month
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const currentMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const currentMonthStartISO = toISODate(currentMonthStart);
  const currentMonthEndISO = toISODate(currentMonthEnd);

  // Last month
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const lastMonthStartISO = toISODate(lastMonthStart);
  const lastMonthEndISO = toISODate(lastMonthEnd);

  const calcStatsForWindow = (startISO: string, endISO: string) => {
    let totalSec = 0;
    let exclTodaySec = 0;
    const allDays = new Set<string>();
    const exclTodayDays = new Set<string>();

    for (const r of records) {
      if (r.date >= startISO && r.date <= endISO) {
        const sec = getLiveSeconds(r);
        totalSec += sec;
        if (sec > 0) {
          allDays.add(r.date);
        }
        if (r.date < todayISO) {
          exclTodaySec += sec;
          if (sec > 0) {
            exclTodayDays.add(r.date);
          }
        }
      }
    }

    const avgIncl = allDays.size > 0 ? Math.round(totalSec / allDays.size) : 0;
    const avgExcl = exclTodayDays.size > 0 ? Math.round(exclTodaySec / exclTodayDays.size) : 0;

    return {
      totalSec,
      avgIncl,
      avgExcl,
    };
  };

  const cw = calcStatsForWindow(currentWeekStartISO, currentWeekEndISO);
  const lw = calcStatsForWindow(lastWeekStartISO, lastWeekEndISO);
  const cm = calcStatsForWindow(currentMonthStartISO, currentMonthEndISO);
  const lm = calcStatsForWindow(lastMonthStartISO, lastMonthEndISO);

  return {
    currentWeekSeconds: cw.totalSec,
    currentWeekAvgExclToday: cw.avgExcl,
    currentWeekAvgInclToday: cw.avgIncl,
    lastWeekSeconds: lw.totalSec,
    lastWeekAvg: lw.avgIncl,
    currentMonthSeconds: cm.totalSec,
    currentMonthAvgExclToday: cm.avgExcl,
    currentMonthAvgInclToday: cm.avgIncl,
    lastMonthSeconds: lm.totalSec,
    lastMonthAvg: lm.avgIncl,
  };
}
