export interface Project {
  id: string;
  name: string;
  color: string;
  textColor: string;
}

export interface TimeRecord {
  id: string;
  date: string; // YYYY-MM-DD
  projectId: string;
  tags: string[];
  description: string;
  seconds: number;
  isRunning?: boolean;
  startedAt?: number | null;
}

export interface SavedFilter {
  id: string;
  name: string;
  range: string;
  projectId: string;
  tag: string;
}

export interface AppData {
  version: string;
  user: string;
  team: string;
  projects: Project[];
  tags: string[];
  records: TimeRecord[];
  savedFilters: SavedFilter[];
}

// Knallige Pastellfarben im Dieter-Rams-Kontraststil
export const PASTEL_PALETTE = [
  { name: "Pistazie", color: "#B8E986", textColor: "#191918" },
  { name: "Minz-Smaragd", color: "#5CE1E6", textColor: "#191918" },
  { name: "Koralle-Pastell", color: "#FF8577", textColor: "#191918" },
  { name: "Sonnen-Gelb", color: "#FFE169", textColor: "#191918" },
  { name: "Elektro-Lavendel", color: "#C5A3FF", textColor: "#191918" },
  { name: "Pfirsich-Orange", color: "#FFA970", textColor: "#191918" },
  { name: "Salbei-Grün", color: "#7CE0A6", textColor: "#191918" },
  { name: "Himmel-Blau", color: "#80BFFF", textColor: "#191918" },
  { name: "Flieder-Pink", color: "#FF9CEE", textColor: "#191918" },
  { name: "Graphit-Dunkel", color: "#2B2D42", textColor: "#FAF8F5" },
];

export function getRandomPastelSwatch(existingProjects: Project[] = []) {
  const usedColors = new Set(existingProjects.map((p) => p.color.toUpperCase()));
  const available = PASTEL_PALETTE.filter((s) => !usedColors.has(s.color.toUpperCase()));
  const pool = available.length > 0 ? available : PASTEL_PALETTE;
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

export const EMPTY_DATA: AppData = {
  version: "2.1.0",
  user: "",
  team: "",
  projects: [],
  tags: [],
  records: [],
  savedFilters: [],
};

export const INITIAL_DATA: AppData = {
  version: "2.1.0",
  user: "niklas",
  team: "georg+georg",
  projects: [
    { id: "p1", name: "Website Redesign", color: "#B8E986", textColor: "#191918" },
    { id: "p2", name: "Mobile App", color: "#7CE0A6", textColor: "#191918" },
    { id: "p3", name: "Marketing Website", color: "#5CE1E6", textColor: "#191918" },
    { id: "p4", name: "Team Operations", color: "#C5A3FF", textColor: "#191918" },
  ],
  tags: ["design", "development", "meeting", "research", "admin", "review"],
  records: [],
  savedFilters: [
    {
      id: "sf1",
      name: "this month • Alle Projekte • Alle Tags",
      range: "this_month",
      projectId: "all",
      tag: "all",
    },
  ],
};
