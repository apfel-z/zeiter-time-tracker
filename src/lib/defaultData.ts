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

export const INITIAL_DATA: AppData = {
  version: "2.0.0",
  user: "Demo User",
  team: "Example Team",
  projects: [
    { id: "p1", name: "Website Redesign", color: "#B8E986", textColor: "#191918" },
    { id: "p2", name: "Mobile App", color: "#7CE0A6", textColor: "#191918" },
    { id: "p3", name: "Marketing Website", color: "#5CE1E6", textColor: "#191918" },
    { id: "p4", name: "Team Operations", color: "#C5A3FF", textColor: "#191918" },
  ],
  tags: ["design", "development", "meeting", "research", "admin", "review"],
  records: [
    {
      id: "r1",
      date: "2026-11-11",
      projectId: "p1",
      tags: ["design"],
      description: "Homepage wireframe",
      seconds: 7200,
      isRunning: false,
      startedAt: null,
    },
    {
      id: "r2",
      date: "2026-11-11",
      projectId: "p2",
      tags: ["development"],
      description: "Build navigation component",
      seconds: 5400,
      isRunning: false,
      startedAt: null,
    },
    {
      id: "r3",
      date: "2026-11-10",
      projectId: "p1",
      tags: ["meeting"],
      description: "Project kick-off",
      seconds: 2700,
      isRunning: false,
      startedAt: null,
    },
    {
      id: "r4",
      date: "2026-11-10",
      projectId: "p3",
      tags: ["research"],
      description: "Competitor review",
      seconds: 4500,
      isRunning: false,
      startedAt: null,
    },
    {
      id: "r5",
      date: "2026-11-09",
      projectId: "p2",
      tags: ["development"],
      description: "Implement responsive layout",
      seconds: 9000,
      isRunning: false,
      startedAt: null,
    },
    {
      id: "r6",
      date: "2026-11-09",
      projectId: "p4",
      tags: ["admin"],
      description: "Weekly planning",
      seconds: 1800,
      isRunning: false,
      startedAt: null,
    },
  ],
  savedFilters: [
    {
      id: "sf1",
      name: "This week • All projects",
      range: "week",
      projectId: "all",
      tag: "all",
    },
  ],
};
