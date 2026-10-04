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

export function getTodayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
