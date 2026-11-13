"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Clock,
  FileSpreadsheet,
  BarChart3,
  Settings,
  Play,
  Square,
  Download,
  Upload,
  Plus,
  Trash2,
  Tag as TagIcon,
  FolderKanban,
  Bookmark,
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  FileText,
  User,
  AlertTriangle,
  X,
} from "lucide-react";
import {
  AppData,
  EMPTY_DATA,
  INITIAL_DATA,
  PASTEL_PALETTE,
  Project,
  SavedFilter,
  TimeRecord,
  getRandomPastelSwatch,
} from "@/lib/defaultData";
import {
  REPORT_RANGES,
  computeKpiStats,
  formatDecimalHours,
  formatGermanDateHeader,
  formatHM,
  formatHMS,
  formatShortDate,
  getReportRangeLabel,
  getTodayISO,
  matchesReportRange,
  parseDurationString,
} from "@/lib/timeUtils";
import { exportReportAsPDF } from "@/lib/pdfExport";

const STORAGE_KEY = "zeit_niklasfritsch_v2";

export default function TimeTrackerApp() {
  const [data, setData] = useState<AppData>(INITIAL_DATA);
  const [hydrated, setHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<"track" | "reports" | "stats" | "settings">("track");
  const [now, setNow] = useState<number>(Date.now());

  // Command bar states
  const [commandInput, setCommandInput] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("p1");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showAllSuggestions, setShowAllSuggestions] = useState(true);
  const [showKpiAverages, setShowKpiAverages] = useState(false);
  const [editingDurationId, setEditingDurationId] = useState<string | null>(null);
  const [editingDurationValue, setEditingDurationValue] = useState<string>("");

  // Multi-tag popover state for daily record rows
  const [openTagMenuRecordId, setOpenTagMenuRecordId] = useState<string | null>(null);
  const [inlineNewTagValue, setInlineNewTagValue] = useState<string>("");

  // Reports states
  const [reportRange, setReportRange] = useState<string>("all_time");
  const [reportProjectId, setReportProjectId] = useState<string>("all");
  const [reportTag, setReportTag] = useState<string>("all");
  const [customFilterName, setCustomFilterName] = useState<string>("");

  // Settings states
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColorIdx, setNewProjectColorIdx] = useState(0);
  const [newTagName, setNewTagName] = useState("");
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load from localStorage on client mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.records)) {
          // Migrate legacy "Demo User" / "Example Team" if untouched
          const migratedUser =
            parsed.user === "Demo User" ? INITIAL_DATA.user : (parsed.user ?? INITIAL_DATA.user);
          const migratedTeam =
            parsed.team === "Example Team" ? INITIAL_DATA.team : (parsed.team ?? INITIAL_DATA.team);

          setData({
            ...INITIAL_DATA,
            ...parsed,
            user: migratedUser,
            team: migratedTeam,
            tags: Array.isArray(parsed.tags) ? parsed.tags : INITIAL_DATA.tags,
            savedFilters: Array.isArray(parsed.savedFilters)
              ? parsed.savedFilters
              : INITIAL_DATA.savedFilters,
          });
          if (parsed.projects[0]) {
            setSelectedProjectId(parsed.projects[0].id);
          }
        }
      }
    } catch (e) {
      console.error("Fehler beim Laden aus dem Browser-Speicher:", e);
    }
    setHydrated(true);
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error("Fehler beim Speichern:", e);
    }
  }, [data, hydrated]);

  // Live 1s ticker for running timers
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Helper to get live seconds of a record
  const getLiveSeconds = (rec: TimeRecord): number => {
    if (rec.isRunning && rec.startedAt) {
      const elapsed = Math.max(0, Math.floor((now - rec.startedAt) / 1000));
      return rec.seconds + elapsed;
    }
    return rec.seconds;
  };

  // Update browser tab title when timer is running
  const runningRecord = useMemo(
    () => data.records.find((r) => r.isRunning),
    [data.records]
  );

  useEffect(() => {
    if (!hydrated) return;
    if (runningRecord) {
      const proj = data.projects.find((p) => p.id === runningRecord.projectId);
      const sec = getLiveSeconds(runningRecord);
      document.title = `▶ ${formatHMS(sec)} • ${proj?.name || "Timer"} | ZEIT`;
    } else {
      document.title = "ZEIT // Niklas Fritsch";
    }
  }, [runningRecord, now, hydrated, data.projects]);

  // Autocomplete suggestions for @project or #tag or plain text in Command Input
  const autocompleteItems = useMemo(() => {
    const trimmed = commandInput.trim();
    if (!trimmed) return [];
    const tokens = trimmed.split(/\s+/);
    const lastToken = tokens[tokens.length - 1];
    if (!lastToken || lastToken.length < 1) return [];

    const isExplicitProject = lastToken.startsWith("@");
    const isExplicitTag = lastToken.startsWith("#");
    const query = lastToken.replace(/^[@#]/, "").trim();
    const queryLower = query.toLowerCase();
    if (!queryLower) return [];

    const matchingProjects = isExplicitTag
      ? []
      : data.projects
          .filter((p) => p.name.toLowerCase().includes(queryLower))
          .map((p) => ({
            type: "project" as const,
            label: p.name,
            project: p,
            isNew: false,
          }));

    // If user typed @projekttest and it does not exist yet, offer creating it with random color
    const exactProjectExists = data.projects.some(
      (p) => p.name.toLowerCase() === queryLower
    );
    const createProjectItem =
      isExplicitProject && !exactProjectExists
        ? [
            {
              type: "project" as const,
              label: query,
              project: undefined,
              isNew: true,
            },
          ]
        : [];

    const matchingTags = isExplicitProject
      ? []
      : data.tags
          .filter((t) => t.toLowerCase().includes(queryLower))
          .map((t) => ({
            type: "tag" as const,
            label: t,
            project: undefined,
            isNew: false,
          }));

    return [...matchingProjects, ...createProjectItem, ...matchingTags].slice(0, 7);
  }, [commandInput, data.projects, data.tags]);

  const applyAutocomplete = (item: {
    type: "project" | "tag";
    label: string;
    project?: Project;
    isNew?: boolean;
  }) => {
    const tokens = commandInput.trim().split(/\s+/);
    tokens.pop();
    if (item.type === "project") {
      if (item.project) {
        setSelectedProjectId(item.project.id);
      } else if (item.isNew && item.label) {
        // Create new project with random pastel color right away
        const swatch = getRandomPastelSwatch(data.projects);
        const newProj: Project = {
          id: `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          name: item.label,
          color: swatch.color,
          textColor: swatch.textColor,
        };
        setData((prev) => ({
          ...prev,
          projects: [...prev.projects, newProj],
        }));
        setSelectedProjectId(newProj.id);
      }
    } else if (item.type === "tag") {
      if (!selectedTags.includes(item.label)) {
        setSelectedTags((prev) => [...prev, item.label]);
      }
    }
    setCommandInput(tokens.length > 0 ? tokens.join(" ") + " " : "");
  };

  // Parse command input & start or log record (auto-creating @newproject if it doesn't exist)
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let projId = selectedProjectId || data.projects[0]?.id || "";
    const tags = [...selectedTags];
    let durationSec: number | null = null;
    let dateStr = getTodayISO();
    const descWords: string[] = [];

    const tokens = commandInput.trim().split(/\s+/).filter(Boolean);
    const newlyCreatedProjects: Project[] = [];
    const newlyCreatedTags: string[] = [];

    for (const token of tokens) {
      if (token.startsWith("@")) {
        const rawProjName = token.slice(1).trim();
        if (rawProjName) {
          const allKnownProjects = [...data.projects, ...newlyCreatedProjects];
          const exactMatch = allKnownProjects.find(
            (p) => p.name.toLowerCase() === rawProjName.toLowerCase()
          );
          if (exactMatch) {
            projId = exactMatch.id;
          } else {
            // Auto-create project with a random pastel color
            const swatch = getRandomPastelSwatch(allKnownProjects);
            const createdProj: Project = {
              id: `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              name: rawProjName,
              color: swatch.color,
              textColor: swatch.textColor,
            };
            newlyCreatedProjects.push(createdProj);
            projId = createdProj.id;
          }
          continue;
        }
      }
      if (token.startsWith("#")) {
        const tName = token.slice(1).trim();
        if (tName) {
          if (!tags.includes(tName)) {
            tags.push(tName);
          }
          if (!data.tags.includes(tName) && !newlyCreatedTags.includes(tName)) {
            newlyCreatedTags.push(tName);
          }
          continue;
        }
      }
      const parsedDur = parseDurationString(token);
      if (parsedDur !== null) {
        durationSec = parsedDur;
        continue;
      }
      const dateMatch = token.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (dateMatch) {
        const [, d, m, y] = dateMatch;
        dateStr = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
        continue;
      }
      descWords.push(token);
    }

    const finalDescription = descWords.join(" ").trim();
    const shouldRunImmediately = durationSec === null;

    setData((prev) => {
      const mergedProjects = [...prev.projects, ...newlyCreatedProjects];
      const mergedTags = [...prev.tags, ...newlyCreatedTags];

      // Ensure we always have at least one valid project
      let effectiveProjectId = projId;
      if (!effectiveProjectId || !mergedProjects.some((p) => p.id === effectiveProjectId)) {
        if (mergedProjects.length > 0) {
          effectiveProjectId = mergedProjects[0].id;
        } else {
          const fallbackSwatch = getRandomPastelSwatch([]);
          const defaultProj: Project = {
            id: `p_${Date.now()}`,
            name: "Allgemein",
            color: fallbackSwatch.color,
            textColor: fallbackSwatch.textColor,
          };
          mergedProjects.push(defaultProj);
          effectiveProjectId = defaultProj.id;
        }
      }

      // Stop any running timers if we start a new running timer
      const updatedRecords = prev.records.map((r) => {
        if (shouldRunImmediately && r.isRunning && r.startedAt) {
          const addSec = Math.max(0, Math.floor((Date.now() - r.startedAt) / 1000));
          return { ...r, seconds: r.seconds + addSec, isRunning: false, startedAt: null };
        }
        return r;
      });

      const newRecord: TimeRecord = {
        id: `rec_${Date.now()}`,
        date: dateStr,
        projectId: effectiveProjectId,
        tags,
        description: finalDescription,
        seconds: durationSec ?? 0,
        isRunning: shouldRunImmediately,
        startedAt: shouldRunImmediately ? Date.now() : null,
      };

      return {
        ...prev,
        projects: mergedProjects,
        tags: mergedTags,
        records: [newRecord, ...updatedRecords],
      };
    });

    if (newlyCreatedProjects.length > 0) {
      setSelectedProjectId(newlyCreatedProjects[newlyCreatedProjects.length - 1].id);
    }
    setCommandInput("");
    setSelectedTags([]);
  };

  // Toggle timer on an existing record
  const toggleRecordTimer = (recordId: string) => {
    const timestamp = Date.now();
    setData((prev) => ({
      ...prev,
      records: prev.records.map((r) => {
        if (r.id === recordId) {
          if (r.isRunning && r.startedAt) {
            const elapsed = Math.max(0, Math.floor((timestamp - r.startedAt) / 1000));
            return { ...r, seconds: r.seconds + elapsed, isRunning: false, startedAt: null };
          } else {
            return { ...r, isRunning: true, startedAt: timestamp };
          }
        }
        // Stop other running records when starting a new one
        if (r.isRunning && r.startedAt) {
          const elapsed = Math.max(0, Math.floor((timestamp - r.startedAt) / 1000));
          return { ...r, seconds: r.seconds + elapsed, isRunning: false, startedAt: null };
        }
        return r;
      }),
    }));
  };

  const updateRecordField = (recordId: string, updater: (rec: TimeRecord) => TimeRecord) => {
    setData((prev) => ({
      ...prev,
      records: prev.records.map((r) => (r.id === recordId ? updater(r) : r)),
    }));
  };

  const toggleTagOnRecord = (recordId: string, tag: string) => {
    updateRecordField(recordId, (r) => {
      const exists = r.tags.includes(tag);
      return {
        ...r,
        tags: exists ? r.tags.filter((t) => t !== tag) : [...r.tags, tag],
      };
    });
  };

  const addNewTagToRecord = (recordId: string, rawTag: string) => {
    const clean = rawTag.trim().replace(/^#/, "");
    if (!clean) return;
    setData((prev) => ({
      ...prev,
      tags: prev.tags.includes(clean) ? prev.tags : [...prev.tags, clean],
      records: prev.records.map((r) =>
        r.id === recordId
          ? { ...r, tags: r.tags.includes(clean) ? r.tags : [...r.tags, clean] }
          : r
      ),
    }));
    setInlineNewTagValue("");
  };

  const deleteRecord = (recordId: string) => {
    setData((prev) => ({
      ...prev,
      records: prev.records.filter((r) => r.id !== recordId),
    }));
  };

  // Group records by date
  const groupedRecords = useMemo(() => {
    const map = new Map<string, TimeRecord[]>();
    const sorted = [...data.records].sort((a, b) => b.date.localeCompare(a.date));
    for (const r of sorted) {
      const list = map.get(r.date) || [];
      list.push(r);
      map.set(r.date, list);
    }
    return Array.from(map.entries());
  }, [data.records]);

  // Dynamic KPI strip calculations (Current Week, Last Week, Current Month, Last Month + Averages)
  const kpiStats = useMemo(
    () => computeKpiStats(data.records, getLiveSeconds, new Date(now)),
    [data.records, now]
  );

  // Export JSON backup
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zeit-backup-${getTodayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import JSON backup
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result));
        if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.records)) {
          setData(parsed);
          alert("Backup erfolgreich geladen!");
        } else {
          alert("Ungültiges Backup-Format.");
        }
      } catch {
        alert("Datei konnte nicht gelesen werden.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Save current report filter combination
  const handleSaveCurrentFilter = () => {
    const rangeLabel = getReportRangeLabel(reportRange);
    const projLabel =
      reportProjectId === "all"
        ? "Alle Projekte"
        : data.projects.find((p) => p.id === reportProjectId)?.name || reportProjectId;
    const tagLabel = reportTag === "all" ? "Alle Tags" : `#${reportTag}`;

    const autoName = `${rangeLabel} • ${projLabel} • ${tagLabel}`;
    const finalName = customFilterName.trim() || autoName;

    const newFilter: SavedFilter = {
      id: `sf_${Date.now()}`,
      name: finalName,
      range: reportRange,
      projectId: reportProjectId,
      tag: reportTag,
    };

    setData((prev) => ({
      ...prev,
      savedFilters: [...prev.savedFilters, newFilter],
    }));
    setCustomFilterName("");
  };

  const handleDeleteSavedFilter = (filterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setData((prev) => ({
      ...prev,
      savedFilters: prev.savedFilters.filter((sf) => sf.id !== filterId),
    }));
  };

  // Filtered records for Reports
  const filteredReportRecords = useMemo(() => {
    return data.records.filter((r) => {
      if (reportProjectId !== "all" && r.projectId !== reportProjectId) return false;
      if (reportTag !== "all" && !r.tags.includes(reportTag)) return false;
      if (!matchesReportRange(r.date, reportRange, new Date(now))) return false;
      return true;
    });
  }, [data.records, reportProjectId, reportTag, reportRange, now]);

  const totalReportSeconds = useMemo(
    () => filteredReportRecords.reduce((acc, r) => acc + getLiveSeconds(r), 0),
    [filteredReportRecords, now]
  );

  // CSV Export for Reports
  const handleExportCSV = () => {
    const header = [
      "Datum",
      "Team",
      "Name",
      "Projekt",
      "Tags",
      "Beschreibung",
      "Dauer (HH:MM)",
      "Dezimalstunden",
    ];
    const rows = filteredReportRecords.map((r) => {
      const proj = data.projects.find((p) => p.id === r.projectId)?.name || "";
      const sec = getLiveSeconds(r);
      return [
        formatShortDate(r.date),
        data.team || "",
        data.user || "",
        proj,
        r.tags.map((t) => `#${t}`).join(", "),
        `"${(r.description || "").replace(/"/g, '""')}"`,
        formatHM(sec),
        formatDecimalHours(sec),
      ].join(";");
    });
    const csvContent = "\uFEFF" + [header.join(";"), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `zeit-report-${getTodayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // PDF Export for Reports (styled like the website)
  const handleExportPDF = () => {
    exportReportAsPDF({
      data,
      records: filteredReportRecords,
      getLiveSeconds,
      reportRange,
      reportProjectId,
      reportTag,
      totalSeconds: totalReportSeconds,
    });
  };

  // Statistics aggregations
  const projectStats = useMemo(() => {
    const totalAll = Math.max(
      1,
      data.records.reduce((acc, r) => acc + getLiveSeconds(r), 0)
    );
    return data.projects
      .map((p) => {
        const seconds = data.records
          .filter((r) => r.projectId === p.id)
          .reduce((acc, r) => acc + getLiveSeconds(r), 0);
        return {
          project: p,
          seconds,
          percentage: (seconds / totalAll) * 100,
        };
      })
      .filter((st) => st.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds);
  }, [data.projects, data.records, now]);

  const tagStats = useMemo(() => {
    const totalAll = Math.max(
      1,
      data.records.reduce((acc, r) => acc + getLiveSeconds(r), 0)
    );
    const counts = new Map<string, number>();
    let noTagSeconds = 0;

    for (const r of data.records) {
      const sec = getLiveSeconds(r);
      if (!r.tags || r.tags.length === 0) {
        noTagSeconds += sec;
      } else {
        for (const t of r.tags) {
          counts.set(t, (counts.get(t) || 0) + sec);
        }
      }
    }

    const result = Array.from(counts.entries()).map(([tag, seconds]) => ({
      tag,
      seconds,
      percentage: (seconds / totalAll) * 100,
    }));

    if (noTagSeconds > 0) {
      result.push({
        tag: "(ohne Tag)",
        seconds: noTagSeconds,
        percentage: (noTagSeconds / totalAll) * 100,
      });
    }

    return result.sort((a, b) => b.seconds - a.seconds);
  }, [data.records, now]);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#F4F1EA] flex items-center justify-center font-mono text-xs uppercase tracking-widest">
        INITIALISIERE ZEIT ...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F1EA] text-[#191918]">
      {/* DIETER RAMS TOP HARDWARE HEADER */}
      <header className="sticky top-0 z-30 bg-[#FAF8F5] border-b border-[#191918]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand mark */}
          <div className="flex items-center gap-3">
            <div className="w-3.5 h-3.5 rounded-full bg-[#E04F26] border border-[#191918]" />
            <span className="font-bold tracking-tight text-lg">ZEIT</span>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center border border-[#191918] bg-[#F4F1EA]">
            {[
              { id: "track", label: "TRACK TIME", icon: Clock },
              { id: "reports", label: "REPORTS", icon: FileSpreadsheet },
              { id: "stats", label: "STATS", icon: BarChart3 },
              { id: "settings", label: "PROJEKTE & DATEN", icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as typeof activeTab)}
                  className={`px-3 sm:px-4 py-2 text-xs font-mono uppercase tracking-wider flex items-center gap-2 transition-colors border-r last:border-r-0 border-[#191918] ${
                    isActive
                      ? "bg-[#191918] text-[#FAF8F5] font-semibold"
                      : "hover:bg-[#EAE5DC] text-[#191918]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Direct Backup Export / Import Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJSON}
              title="JSON-Backup exportieren"
              className="px-2.5 py-1.5 border border-[#191918] bg-[#FAF8F5] hover:bg-[#191918] hover:text-[#FAF8F5] text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">EXPORT</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="JSON-Backup importieren"
              className="px-2.5 py-1.5 border border-[#191918] bg-[#FAF8F5] hover:bg-[#191918] hover:text-[#FAF8F5] text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">IMPORT</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportJSON}
              className="hidden"
            />
          </div>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* ==================== TAB 1: TRACK TIME ==================== */}
        {activeTab === "track" && (
          <div className="space-y-8">
            {/* Section Title Line (Lemon Style + Rams Precision) */}
            <div className="flex items-center gap-4">
              <div className="h-px bg-[#191918] flex-1" />
              <div className="flex items-center gap-2 font-mono text-sm uppercase tracking-widest">
                <Clock className="w-4 h-4" />
                <span>Track Time</span>
              </div>
              <div className="h-px bg-[#191918] flex-1" />
            </div>

            {/* Command Input Box */}
            <div className="bg-[#FAF8F5] border border-[#191918] p-4 sm:p-6 space-y-4">
              <form onSubmit={handleCommandSubmit} className="relative flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={commandInput}
                    onChange={(e) => setCommandInput(e.target.value)}
                    placeholder="@Projekt #Tag1 #Tag2 Deine Beschreibung 1:42 (neue @Projekte werden automatisch angelegt)"
                    className="w-full h-12 px-4 bg-[#F4F1EA] border border-[#191918] font-mono text-sm placeholder:text-[#6E6D68] focus:outline-none focus:bg-white"
                  />

                  {/* Autocomplete Dropdown */}
                  {autocompleteItems.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-[#FAF8F5] border border-[#191918] z-20 shadow-sm">
                      {autocompleteItems.map((item, idx) => (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => applyAutocomplete(item)}
                          className="w-full px-4 py-2.5 text-left text-xs font-mono flex items-center justify-between hover:bg-[#191918] hover:text-[#FAF8F5] border-b last:border-b-0 border-[#D8D3C8]"
                        >
                          <span>
                            {item.type === "project" ? "@" : "#"}
                            <strong>{item.label}</strong>
                            {item.isNew && (
                              <span className="ml-2 text-[11px] opacity-75">
                                (Neu anlegen mit Zufallsfarbe)
                              </span>
                            )}
                          </span>
                          {item.type === "project" && item.project && (
                            <span
                              className="px-2 py-0.5 text-[10px] border border-[#191918]"
                              style={{
                                backgroundColor: item.project.color,
                                color: item.project.textColor,
                              }}
                            >
                              PROJEKT
                            </span>
                          )}
                          {item.type === "project" && item.isNew && (
                            <span className="px-2 py-0.5 text-[10px] border border-[#191918] bg-[#E04F26] text-white">
                              + NEU
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="h-12 px-6 bg-[#E04F26] text-white border border-[#191918] font-mono text-xs uppercase tracking-widest font-semibold hover:bg-[#191918] transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>START / BUCHEN</span>
                </button>
              </form>

              {/* Suggestions Drawer: Clickable Vibrant Pastel Projects & Multi-Tags */}
              <div className="space-y-3 pt-2 border-t border-[#D8D3C8]">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[#6E6D68]">
                    Aktive Auswahl & Schnellwahl (Suggestions)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAllSuggestions(!showAllSuggestions)}
                    className="font-mono text-[11px] uppercase tracking-wider flex items-center gap-1 hover:underline"
                  >
                    {showAllSuggestions ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5" /> Einklappen
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5" /> Alle zeigen
                      </>
                    )}
                  </button>
                </div>

                {showAllSuggestions && (
                  <>
                    {/* Project Pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {data.projects.map((proj) => {
                        const isSelected = selectedProjectId === proj.id;
                        return (
                          <button
                            key={proj.id}
                            type="button"
                            onClick={() => setSelectedProjectId(proj.id)}
                            style={{
                              backgroundColor: proj.color,
                              color: proj.textColor,
                            }}
                            className={`px-3 py-1.5 text-xs font-medium border border-[#191918] transition-transform flex items-center gap-1.5 ${
                              isSelected
                                ? "ring-2 ring-[#191918] ring-offset-2 ring-offset-[#FAF8F5] font-bold"
                                : "opacity-85 hover:opacity-100"
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            {proj.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* Multi-Tag Pills */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {data.tags.map((tag) => {
                        const active = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setSelectedTags((prev) =>
                                prev.includes(tag)
                                  ? prev.filter((t) => t !== tag)
                                  : [...prev, tag]
                              )
                            }
                            className={`px-2.5 py-1 text-xs font-mono border border-[#191918] transition-colors flex items-center gap-1 ${
                              active
                                ? "bg-[#191918] text-[#FAF8F5]"
                                : "bg-[#F4F1EA] text-[#191918] hover:bg-[#EAE5DC]"
                            }`}
                          >
                            {active && <Check className="w-3 h-3" />}#{tag}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Summary KPI Strip (Dynamic + Collapsible Daily Averages like LemonTime) */}
            <div className="border border-[#191918] bg-[#FAF8F5]">
              <div
                onClick={() => setShowKpiAverages((prev) => !prev)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setShowKpiAverages((prev) => !prev);
                  }
                }}
                title="Klicken, um Tagesdurchschnitte ein-/auszuklappen"
                className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-[#191918] cursor-pointer hover:bg-[#F4F1EA]/60 transition-colors"
              >
                {/* Current Week */}
                <div className="p-4 text-center space-y-1">
                  <div className="font-mono text-xl font-bold">
                    {formatHM(kpiStats.currentWeekSeconds)}h
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-[#6E6D68]">
                    Aktuelle Woche
                  </div>
                  {showKpiAverages && (
                    <div className="pt-2 mt-2 border-t border-[#D8D3C8] font-mono text-[11px] text-[#6E6D68] space-y-0.5">
                      <div>
                        ø <strong className="text-[#191918]">{formatHM(kpiStats.currentWeekAvgExclToday)}h</strong> excluding today
                      </div>
                      <div>
                        ø <strong className="text-[#191918]">{formatHM(kpiStats.currentWeekAvgInclToday)}h</strong> including today
                      </div>
                    </div>
                  )}
                </div>

                {/* Last Week */}
                <div className="p-4 text-center space-y-1">
                  <div className="font-mono text-xl font-bold">
                    {formatHM(kpiStats.lastWeekSeconds)}h
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-[#6E6D68]">
                    Letzte Woche
                  </div>
                  {showKpiAverages && (
                    <div className="pt-2 mt-2 border-t border-[#D8D3C8] font-mono text-[11px] text-[#6E6D68]">
                      ø <strong className="text-[#191918]">{formatHM(kpiStats.lastWeekAvg)}h</strong>
                    </div>
                  )}
                </div>

                {/* Current Month */}
                <div className="p-4 text-center space-y-1">
                  <div className="font-mono text-xl font-bold">
                    {formatHM(kpiStats.currentMonthSeconds)}h
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-[#6E6D68]">
                    Aktueller Monat
                  </div>
                  {showKpiAverages && (
                    <div className="pt-2 mt-2 border-t border-[#D8D3C8] font-mono text-[11px] text-[#6E6D68] space-y-0.5">
                      <div>
                        ø <strong className="text-[#191918]">{formatHM(kpiStats.currentMonthAvgExclToday)}h</strong> excluding today
                      </div>
                      <div>
                        ø <strong className="text-[#191918]">{formatHM(kpiStats.currentMonthAvgInclToday)}h</strong> including today
                      </div>
                    </div>
                  )}
                </div>

                {/* Last Month */}
                <div className="p-4 text-center space-y-1">
                  <div className="font-mono text-xl font-bold">
                    {formatHM(kpiStats.lastMonthSeconds)}h
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-wider text-[#6E6D68]">
                    Letzter Monat
                  </div>
                  {showKpiAverages && (
                    <div className="pt-2 mt-2 border-t border-[#D8D3C8] font-mono text-[11px] text-[#6E6D68]">
                      ø <strong className="text-[#191918]">{formatHM(kpiStats.lastMonthAvg)}h</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Collapse/Expand Bar Footer */}
              <div className="border-t border-[#191918] bg-[#F4F1EA] px-4 py-1.5 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setShowKpiAverages((prev) => !prev)}
                  className="font-mono text-[11px] uppercase tracking-wider text-[#6E6D68] hover:text-[#191918] flex items-center gap-1"
                >
                  {showKpiAverages ? (
                    <>
                      <ChevronUp className="w-3.5 h-3.5" /> Tagesdurchschnitte einklappen
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3.5 h-3.5" /> Tagesdurchschnitte ausklappen (ø)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Daily Record Groups (Lemon Layout + Dieter Rams Grid) */}
            <div className="space-y-8">
              {groupedRecords.length === 0 ? (
                <div className="bg-[#FAF8F5] border border-[#191918] p-8 text-center font-mono text-xs text-[#6E6D68] uppercase tracking-wider">
                  Noch keine Zeiteinträge vorhanden. Starte oben einen Timer oder buche direkt über das Eingabefeld.
                </div>
              ) : (
                groupedRecords.map(([dateStr, dayRecords]) => {
                  const daySeconds = dayRecords.reduce((acc, r) => acc + getLiveSeconds(r), 0);
                  return (
                    <section key={dateStr} className="space-y-4">
                      {/* Day Divider Header with Circular Total Badge */}
                      <div className="flex items-center gap-4">
                        <div className="h-px bg-[#191918] flex-1" />
                        <div className="flex items-center gap-3">
                          <h2 className="text-base sm:text-lg font-medium tracking-tight">
                            {formatGermanDateHeader(dateStr)}
                          </h2>
                          <div className="w-14 h-14 rounded-full bg-[#E6E1D6] border border-[#191918] flex items-center justify-center font-mono text-xs font-bold">
                            {formatHM(daySeconds)}h
                          </div>
                        </div>
                        <div className="h-px bg-[#191918] flex-1" />
                      </div>

                      {/* Day Rows */}
                      <div className="space-y-2.5">
                        {dayRecords.map((rec) => {
                          const proj =
                            data.projects.find((p) => p.id === rec.projectId) || data.projects[0];
                          const liveSec = getLiveSeconds(rec);
                          const isTagMenuOpen = openTagMenuRecordId === rec.id;

                          return (
                            <div
                              key={rec.id}
                              className={`grid grid-cols-1 md:grid-cols-12 border border-[#191918] bg-[#FAF8F5] transition-all ${
                                rec.isRunning ? "ring-2 ring-[#E04F26]" : ""
                              }`}
                            >
                              {/* Col 1: Colored Project Block */}
                              <div
                                style={{
                                  backgroundColor: proj?.color || "#B8E986",
                                  color: proj?.textColor || "#191918",
                                }}
                                className="md:col-span-3 p-3.5 border-b md:border-b-0 md:border-r border-[#191918] flex items-center justify-between"
                              >
                                <select
                                  value={rec.projectId}
                                  onChange={(e) =>
                                    updateRecordField(rec.id, (r) => ({
                                      ...r,
                                      projectId: e.target.value,
                                    }))
                                  }
                                  style={{
                                    backgroundColor: "transparent",
                                    color: proj?.textColor || "#191918",
                                  }}
                                  className="font-semibold text-sm w-full focus:outline-none cursor-pointer"
                                >
                                  {data.projects.map((p) => (
                                    <option
                                      key={p.id}
                                      value={p.id}
                                      className="bg-[#FAF8F5] text-[#191918]"
                                    >
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              {/* Col 2: Multi-Tags Cell */}
                              <div className="relative md:col-span-3 p-2.5 border-b md:border-b-0 md:border-r border-[#191918] flex flex-wrap items-center gap-1.5">
                                {rec.tags.map((t) => (
                                  <span
                                    key={t}
                                    className="px-2 py-0.5 bg-[#F4F1EA] border border-[#191918] font-mono text-[11px] flex items-center gap-1"
                                  >
                                    #{t}
                                    <button
                                      type="button"
                                      onClick={() => toggleTagOnRecord(rec.id, t)}
                                      title={`Tag #${t} entfernen`}
                                      className="text-[#6E6D68] hover:text-[#E04F26] font-bold"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}

                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenTagMenuRecordId(isTagMenuOpen ? null : rec.id)
                                  }
                                  className="px-2 py-0.5 font-mono text-[11px] text-[#6E6D68] hover:text-[#191918] border border-dashed border-[#6E6D68] hover:border-[#191918] transition-colors"
                                >
                                  {rec.tags.length === 0 ? "+ add tags" : "+"}
                                </button>

                                {/* Multi-Tag Selector Popover */}
                                {isTagMenuOpen && (
                                  <div className="absolute left-0 top-full mt-1 w-64 bg-[#FAF8F5] border border-[#191918] z-30 p-3 shadow-md space-y-2.5">
                                    <div className="flex items-center justify-between border-b border-[#D8D3C8] pb-1.5">
                                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#6E6D68]">
                                        Tags auswählen (Mehrfachwahl)
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setOpenTagMenuRecordId(null)}
                                        className="text-[#6E6D68] hover:text-[#191918]"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                                      {data.tags.map((tag) => {
                                        const active = rec.tags.includes(tag);
                                        return (
                                          <button
                                            key={tag}
                                            type="button"
                                            onClick={() => toggleTagOnRecord(rec.id, tag)}
                                            className={`px-2 py-1 text-xs font-mono border border-[#191918] flex items-center gap-1 ${
                                              active
                                                ? "bg-[#191918] text-[#FAF8F5]"
                                                : "bg-[#F4F1EA] text-[#191918] hover:bg-[#EAE5DC]"
                                            }`}
                                          >
                                            {active && <Check className="w-3 h-3" />}#{tag}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <div className="flex gap-1 pt-1 border-t border-[#D8D3C8]">
                                      <input
                                        type="text"
                                        value={inlineNewTagValue}
                                        onChange={(e) => setInlineNewTagValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            addNewTagToRecord(rec.id, inlineNewTagValue);
                                          }
                                        }}
                                        placeholder="Neuer Tag..."
                                        className="flex-1 h-7 px-2 bg-[#F4F1EA] border border-[#191918] font-mono text-xs focus:outline-none"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          addNewTagToRecord(rec.id, inlineNewTagValue)
                                        }
                                        className="px-2.5 h-7 bg-[#191918] text-white font-mono text-xs uppercase"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Col 3: Description Input */}
                              <div className="md:col-span-3 p-3 border-b md:border-b-0 md:border-r border-[#191918] flex items-center">
                                <input
                                  type="text"
                                  value={rec.description}
                                  onChange={(e) =>
                                    updateRecordField(rec.id, (r) => ({
                                      ...r,
                                      description: e.target.value,
                                    }))
                                  }
                                  placeholder="✎ add description"
                                  className="w-full bg-transparent text-sm italic md:text-right focus:not-italic focus:outline-none placeholder:text-[#6E6D68]"
                                />
                              </div>

                              {/* Col 4: Duration Display / Inline Edit */}
                              <div className="md:col-span-2 p-3 border-b md:border-b-0 md:border-r border-[#191918] flex items-center justify-end font-mono text-lg font-medium">
                                {editingDurationId === rec.id ? (
                                  <input
                                    type="text"
                                    autoFocus
                                    value={editingDurationValue}
                                    onChange={(e) => setEditingDurationValue(e.target.value)}
                                    onBlur={() => {
                                      const parsed = parseDurationString(editingDurationValue);
                                      if (parsed !== null) {
                                        updateRecordField(rec.id, (r) => ({
                                          ...r,
                                          seconds: parsed,
                                        }));
                                      }
                                      setEditingDurationId(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const parsed = parseDurationString(editingDurationValue);
                                        if (parsed !== null) {
                                          updateRecordField(rec.id, (r) => ({
                                            ...r,
                                            seconds: parsed,
                                          }));
                                        }
                                        setEditingDurationId(null);
                                      }
                                    }}
                                    className="w-24 text-right bg-[#F4F1EA] border border-[#191918] px-1.5 py-0.5 text-sm"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    title="Klicken zum Bearbeiten (z.B. 1:30)"
                                    onClick={() => {
                                      setEditingDurationId(rec.id);
                                      setEditingDurationValue(formatHM(liveSec));
                                    }}
                                    className="hover:underline"
                                  >
                                    {rec.isRunning ? formatHMS(liveSec) : formatHM(liveSec)}
                                  </button>
                                )}
                              </div>

                              {/* Col 5: Action Buttons (Start/Stop + Delete) */}
                              <div className="md:col-span-1 flex items-stretch">
                                <button
                                  type="button"
                                  onClick={() => toggleRecordTimer(rec.id)}
                                  style={{
                                    backgroundColor: rec.isRunning
                                      ? "#E04F26"
                                      : proj?.color || "#B8E986",
                                    color: rec.isRunning
                                      ? "#FFFFFF"
                                      : proj?.textColor || "#191918",
                                  }}
                                  title={
                                    rec.isRunning ? "Timer stoppen" : "Timer starten / fortsetzen"
                                  }
                                  className="flex-1 py-3 flex items-center justify-center border-r border-[#191918] hover:opacity-90 transition-opacity"
                                >
                                  {rec.isRunning ? (
                                    <Square className="w-4 h-4 fill-current" />
                                  ) : (
                                    <Play className="w-4 h-4 fill-current" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteRecord(rec.id)}
                                  title="Eintrag löschen"
                                  className="px-2.5 bg-[#FAF8F5] hover:bg-[#191918] hover:text-white flex items-center justify-center transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 2: REPORTS ==================== */}
        {activeTab === "reports" && (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-px bg-[#191918] flex-1" />
              <div className="flex items-center gap-2 font-mono text-sm uppercase tracking-widest">
                <FileSpreadsheet className="w-4 h-4" />
                <span>Reports</span>
              </div>
              <div className="h-px bg-[#191918] flex-1" />
            </div>

            {/* Filter Bar */}
            <div className="bg-[#FAF8F5] border border-[#191918] p-6 space-y-5">
              {/* Saved Filters List */}
              <div className="space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#6E6D68]">
                  Gespeicherte Filter (Saved Filters)
                </div>
                {data.savedFilters.length === 0 ? (
                  <div className="font-mono text-xs text-[#6E6D68] italic">
                    Noch keine eigenen Filter gespeichert.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.savedFilters.map((sf) => {
                      const isCurrent =
                        reportRange === sf.range &&
                        reportProjectId === sf.projectId &&
                        reportTag === sf.tag;
                      return (
                        <div
                          key={sf.id}
                          onClick={() => {
                            setReportRange(sf.range);
                            setReportProjectId(sf.projectId);
                            setReportTag(sf.tag);
                          }}
                          className={`px-3 py-1.5 text-xs font-mono border border-[#191918] cursor-pointer flex items-center gap-2 transition-colors ${
                            isCurrent
                              ? "bg-[#191918] text-[#FAF8F5]"
                              : "bg-[#F4F1EA] text-[#191918] hover:bg-[#EAE5DC]"
                          }`}
                        >
                          <Bookmark className="w-3 h-3" />
                          <span>{sf.name}</span>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSavedFilter(sf.id, e)}
                            title="Gespeicherten Filter löschen"
                            className="opacity-70 hover:opacity-100 ml-1 font-bold"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Filter Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6E6D68] mb-1">
                    Zeitraum
                  </label>
                  <select
                    value={reportRange}
                    onChange={(e) => setReportRange(e.target.value)}
                    className="w-full h-10 px-3 bg-[#F4F1EA] border border-[#191918] font-mono text-xs"
                  >
                    {REPORT_RANGES.map((rangeOpt) => (
                      <option key={rangeOpt.value} value={rangeOpt.value}>
                        {rangeOpt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6E6D68] mb-1">
                    Projekt
                  </label>
                  <select
                    value={reportProjectId}
                    onChange={(e) => setReportProjectId(e.target.value)}
                    className="w-full h-10 px-3 bg-[#F4F1EA] border border-[#191918] font-mono text-xs"
                  >
                    <option value="all">(all projects)</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6E6D68] mb-1">
                    Tag
                  </label>
                  <select
                    value={reportTag}
                    onChange={(e) => setReportTag(e.target.value)}
                    className="w-full h-10 px-3 bg-[#F4F1EA] border border-[#191918] font-mono text-xs"
                  >
                    <option value="all">(all tags)</option>
                    {data.tags.map((t) => (
                      <option key={t} value={t}>
                        #{t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Save Filter Combination Bar */}
              <div className="pt-3 border-t border-[#D8D3C8] flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
                <input
                  type="text"
                  value={customFilterName}
                  onChange={(e) => setCustomFilterName(e.target.value)}
                  placeholder="Optionaler Name für Filterkombination (sonst automatisch benannt)"
                  className="flex-1 h-10 px-3 bg-[#F4F1EA] border border-[#191918] font-mono text-xs placeholder:text-[#6E6D68] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveCurrentFilter}
                  className="h-10 px-4 bg-[#191918] text-[#FAF8F5] hover:bg-[#E04F26] transition-colors font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2 border border-[#191918]"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>save these filters</span>
                </button>
              </div>
            </div>

            {/* Records Total Header with Decimal Hours + CSV & PDF Export */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#FAF8F5] border border-[#191918] p-4">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm uppercase tracking-wider">
                  Einträge ({filteredReportRecords.length})
                </span>
                <span className="px-4 py-1.5 rounded-full bg-[#E6E1D6] border border-[#191918] font-mono text-sm font-bold">
                  {formatHM(totalReportSeconds)}h ({formatDecimalHours(totalReportSeconds)} Dezimal)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 bg-[#191918] text-[#FAF8F5] font-mono text-xs uppercase tracking-wider hover:bg-[#E04F26] transition-colors flex items-center gap-2 border border-[#191918]"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV / Excel Export
                </button>
                <button
                  onClick={handleExportPDF}
                  className="px-4 py-2 bg-[#E04F26] text-white font-mono text-xs uppercase tracking-wider hover:bg-[#191918] transition-colors flex items-center gap-2 border border-[#191918]"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Als PDF exportieren
                </button>
              </div>
            </div>

            {/* Report Table */}
            <div className="bg-[#FAF8F5] border border-[#191918] overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#191918] bg-[#F4F1EA] font-mono text-[11px] uppercase tracking-wider">
                    <th className="p-3 border-r border-[#191918]">Datum</th>
                    <th className="p-3 border-r border-[#191918]">Team</th>
                    <th className="p-3 border-r border-[#191918]">Name</th>
                    <th className="p-3 border-r border-[#191918]">Projekt</th>
                    <th className="p-3 border-r border-[#191918]">Tags</th>
                    <th className="p-3 border-r border-[#191918]">Beschreibung</th>
                    <th className="p-3 text-right">Zeit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D8D3C8] text-sm">
                  {filteredReportRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="p-6 text-center font-mono text-xs text-[#6E6D68]"
                      >
                        Keine Einträge für die gewählte Filterkombination gefunden.
                      </td>
                    </tr>
                  ) : (
                    filteredReportRecords.map((rec) => {
                      const proj = data.projects.find((p) => p.id === rec.projectId);
                      const sec = getLiveSeconds(rec);
                      return (
                        <tr key={rec.id} className="hover:bg-[#F4F1EA]">
                          <td className="p-3 border-r border-[#D8D3C8] font-mono text-xs">
                            {formatShortDate(rec.date)}
                          </td>
                          <td className="p-3 border-r border-[#D8D3C8] font-mono text-xs text-[#6E6D68]">
                            {data.team}
                          </td>
                          <td className="p-3 border-r border-[#D8D3C8] font-mono text-xs">
                            {data.user}
                          </td>
                          <td className="p-3 border-r border-[#D8D3C8]">
                            {proj && (
                              <span
                                style={{
                                  backgroundColor: proj.color,
                                  color: proj.textColor,
                                }}
                                className="px-2.5 py-1 text-xs font-medium border border-[#191918] inline-block"
                              >
                                {proj.name}
                              </span>
                            )}
                          </td>
                          <td className="p-3 border-r border-[#D8D3C8] font-mono text-xs">
                            {rec.tags.map((t) => `#${t}`).join(", ")}
                          </td>
                          <td className="p-3 border-r border-[#D8D3C8]">{rec.description}</td>
                          <td className="p-3 text-right font-mono font-semibold">
                            {formatHM(sec)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: STATS ==================== */}
        {activeTab === "stats" && (
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="h-px bg-[#191918] flex-1" />
              <div className="flex items-center gap-2 font-mono text-sm uppercase tracking-widest">
                <BarChart3 className="w-4 h-4" />
                <span>Stats</span>
              </div>
              <div className="h-px bg-[#191918] flex-1" />
            </div>

            {/* Project Usage Chart */}
            <div className="bg-[#FAF8F5] border border-[#191918] p-6 space-y-6">
              <h3 className="font-mono text-xs uppercase tracking-widest border-b border-[#191918] pb-3">
                Projekt-Verteilung (Project Usage)
              </h3>
              {projectStats.length === 0 ? (
                <div className="font-mono text-xs text-[#6E6D68]">
                  Noch keine Projektdaten gebucht.
                </div>
              ) : (
                <div className="space-y-3">
                  {projectStats.map((item) => (
                    <div key={item.project.id} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="font-semibold">{item.project.name}</span>
                        <span>
                          {formatHM(item.seconds)}h ({item.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-7 bg-[#F4F1EA] border border-[#191918] overflow-hidden">
                        <div
                          style={{
                            width: `${Math.max(2, item.percentage)}%`,
                            backgroundColor: item.project.color,
                          }}
                          className="h-full border-r border-[#191918]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tag Usage Chart */}
            <div className="bg-[#FAF8F5] border border-[#191918] p-6 space-y-6">
              <h3 className="font-mono text-xs uppercase tracking-widest border-b border-[#191918] pb-3">
                Tag-Verteilung (Tag Usage)
              </h3>
              {tagStats.length === 0 ? (
                <div className="font-mono text-xs text-[#6E6D68]">
                  Noch keine Tag-Daten gebucht.
                </div>
              ) : (
                <div className="space-y-3">
                  {tagStats.map((item) => (
                    <div key={item.tag} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span>{item.tag}</span>
                        <span>
                          {formatHM(item.seconds)}h ({item.percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-6 bg-[#F4F1EA] border border-[#191918] overflow-hidden">
                        <div
                          style={{ width: `${Math.max(2, item.percentage)}%` }}
                          className="h-full bg-[#191918]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: PROJEKTE & DATEN ==================== */}
        {activeTab === "settings" && (
          <div className="space-y-8">
            {/* Profile & Team Settings (for CSV & PDF Export) */}
            <div className="bg-[#FAF8F5] border border-[#191918] p-6 space-y-6">
              <h3 className="font-mono text-xs uppercase tracking-widest border-b border-[#191918] pb-3 flex items-center gap-2">
                <User className="w-4 h-4" />
                Profil & Team (für Reports, CSV- & PDF-Export)
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6E6D68] mb-1">
                    Username / Name
                  </label>
                  <input
                    type="text"
                    value={data.user}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        user: e.target.value,
                      }))
                    }
                    placeholder="z.B. niklas"
                    className="w-full h-10 px-3 bg-[#F4F1EA] border border-[#191918] font-mono text-sm focus:outline-none focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6E6D68] mb-1">
                    Team / Organisation
                  </label>
                  <input
                    type="text"
                    value={data.team}
                    onChange={(e) =>
                      setData((prev) => ({
                        ...prev,
                        team: e.target.value,
                      }))
                    }
                    placeholder="z.B. georg+georg"
                    className="w-full h-10 px-3 bg-[#F4F1EA] border border-[#191918] font-mono text-sm focus:outline-none focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Manage Projects */}
            <div className="bg-[#FAF8F5] border border-[#191918] p-6 space-y-6">
              <h3 className="font-mono text-xs uppercase tracking-widest border-b border-[#191918] pb-3 flex items-center gap-2">
                <FolderKanban className="w-4 h-4" />
                Projekte & Pastell-Farben verwalten
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6E6D68] mb-1">
                    Projektname
                  </label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="z.B. Kiez-Kampagne"
                    className="w-full h-10 px-3 bg-[#F4F1EA] border border-[#191918] text-sm"
                  />
                </div>

                <div>
                  <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6E6D68] mb-1">
                    Pastellfarbe wählen
                  </label>
                  <div className="flex items-center gap-1.5 h-10">
                    {PASTEL_PALETTE.map((swatch, idx) => (
                      <button
                        key={swatch.name}
                        type="button"
                        onClick={() => setNewProjectColorIdx(idx)}
                        style={{ backgroundColor: swatch.color }}
                        title={swatch.name}
                        className={`w-6 h-6 border border-[#191918] ${
                          newProjectColorIdx === idx ? "ring-2 ring-[#191918] ring-offset-1" : ""
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (!newProjectName.trim()) return;
                    const swatch = PASTEL_PALETTE[newProjectColorIdx] || PASTEL_PALETTE[0];
                    const newProj: Project = {
                      id: `p_${Date.now()}`,
                      name: newProjectName.trim(),
                      color: swatch.color,
                      textColor: swatch.textColor,
                    };
                    setData((prev) => ({
                      ...prev,
                      projects: [...prev.projects, newProj],
                    }));
                    setNewProjectName("");
                  }}
                  className="h-10 px-4 bg-[#191918] text-white font-mono text-xs uppercase tracking-wider hover:bg-[#E04F26] transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Projekt anlegen
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {data.projects.map((p) => (
                  <div
                    key={p.id}
                    style={{ backgroundColor: p.color, color: p.textColor }}
                    className="px-3 py-1.5 border border-[#191918] text-xs font-medium flex items-center gap-2"
                  >
                    <span>{p.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setData((prev) => ({
                          ...prev,
                          projects: prev.projects.filter((item) => item.id !== p.id),
                        }))
                      }
                      className="opacity-70 hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Manage Tags */}
            <div className="bg-[#FAF8F5] border border-[#191918] p-6 space-y-6">
              <h3 className="font-mono text-xs uppercase tracking-widest border-b border-[#191918] pb-3 flex items-center gap-2">
                <TagIcon className="w-4 h-4" />
                Tags verwalten
              </h3>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Neuer Tag ohne # (z.B. Konzept)"
                  className="flex-1 h-10 px-3 bg-[#F4F1EA] border border-[#191918] text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newTagName.trim().replace(/^#/, "");
                    if (!clean || data.tags.includes(clean)) return;
                    setData((prev) => ({ ...prev, tags: [...prev.tags, clean] }));
                    setNewTagName("");
                  }}
                  className="h-10 px-4 bg-[#191918] text-white font-mono text-xs uppercase tracking-wider"
                >
                  + Tag hinzufügen
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {data.tags.map((t) => (
                  <span
                    key={t}
                    className="px-2.5 py-1 bg-[#F4F1EA] border border-[#191918] font-mono text-xs flex items-center gap-2"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() =>
                        setData((prev) => ({
                          ...prev,
                          tags: prev.tags.filter((item) => item !== t),
                        }))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Backup, Restore & Delete All Data */}
            <div className="bg-[#FAF8F5] border border-[#191918] p-6 space-y-4">
              <h3 className="font-mono text-xs uppercase tracking-widest border-b border-[#191918] pb-3">
                Gerätewechsel & Datenverwaltung (LocalStorage)
              </h3>
              <p className="text-sm text-[#6E6D68]">
                Alle Daten werden lokal im Browser gespeichert. Über JSON-Export und JSON-Import
                kannst du deinen kompletten Stand sichern, auf ein anderes Gerät umziehen oder hier
                vollständig zurücksetzen.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportJSON}
                  className="px-4 py-2.5 bg-[#191918] text-white font-mono text-xs uppercase tracking-wider flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  JSON-Backup herunterladen
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 bg-[#F4F1EA] border border-[#191918] font-mono text-xs uppercase tracking-wider flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  JSON-Backup einspielen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Möchtest du wirklich auf die Standard-Projekte zurücksetzen?")) {
                      setData(INITIAL_DATA);
                      setConfirmDeleteAll(false);
                    }
                  }}
                  className="px-4 py-2.5 border border-[#191918] bg-[#FAF8F5] hover:bg-[#EAE5DC] text-[#191918] font-mono text-xs uppercase tracking-wider flex items-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Standard-Daten laden
                </button>

                <button
                  type="button"
                  onClick={() => setConfirmDeleteAll(true)}
                  className="px-4 py-2.5 border border-[#191918] bg-[#E04F26] text-white hover:bg-[#191918] transition-colors font-mono text-xs uppercase tracking-wider flex items-center gap-2 ml-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  Alle Daten löschen
                </button>
              </div>

              {/* Explicit Confirmation Box before wiping all data */}
              {confirmDeleteAll && (
                <div className="mt-4 p-4 border-2 border-[#E04F26] bg-[#F4F1EA] space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-[#E04F26] shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-mono text-xs font-bold uppercase tracking-wider text-[#191918]">
                        Sicherheitsabfrage: Wirklich alle Daten unwiderruflich löschen?
                      </div>
                      <p className="text-xs text-[#6E6D68]">
                        Dadurch werden sämtliche Zeiteinträge, Projekte, Tags und gespeicherten Filter
                        aus deinem Browser-Speicher gelöscht.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAll(false)}
                      className="px-3 py-1.5 border border-[#191918] bg-[#FAF8F5] font-mono text-xs uppercase tracking-wider"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextEmpty: AppData = {
                          ...EMPTY_DATA,
                          user: data.user,
                          team: data.team,
                        };
                        setData(nextEmpty);
                        setSelectedProjectId("");
                        setSelectedTags([]);
                        setConfirmDeleteAll(false);
                      }}
                      className="px-3 py-1.5 border border-[#191918] bg-[#E04F26] text-white font-mono text-xs uppercase tracking-wider font-semibold hover:bg-[#191918]"
                    >
                      Ja, alle Daten endgültig löschen
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
