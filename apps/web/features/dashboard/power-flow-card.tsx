"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Globe,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  TowerControl,
  Wifi,
  Zap,
} from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { ResponsivePopover } from "../../components/ui/responsive-popover";
import { apiClient } from "../../lib/api-client";
import { cn } from "../../lib/utils";
import { useLocale, useT } from "../../providers/locale-provider";

interface SchoolOption {
  id: string;
  name: string;
}

interface PowerFlowData {
  isAggregate?: boolean;
  siteId?: string;
  siteName: string;
  schoolId?: string;
  schoolName: string;
  timestamp: string;
  solarKw: number;
  schoolLoadKw: number;
  solarToSchoolKw: number;
  solarToSchoolPercent: number;
  gridExportKw: number;
  gridExportPercent: number;
  gridImportKw: number;
  todaySummary: {
    solarGenerationKwh: number;
    totalConsumedKwh: number;
    totalExportKwh: number;
    totalImportKwh: number;
    solarRevenueThb: number;
    co2ReductionKg: number;
    equipmentHealth: "normal" | "warning" | "critical";
  };
  availableSchools?: SchoolOption[];
}

export function PowerFlowCard({ className }: { className?: string }) {
  const t = useT();
  const locale = useLocale();

  const [activeTab, setActiveTab] = React.useState<"flow" | "system">("flow");
  const [selectedSchoolId, setSelectedSchoolId] = React.useState<string>("all");
  const [isSelectorOpen, setIsSelectorOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const [data, setData] = React.useState<PowerFlowData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const fetchData = React.useCallback(
    async (schoolId?: string, showRefreshingSpinner = false) => {
      if (showRefreshingSpinner) setIsRefreshing(true);
      try {
        const idToQuery = schoolId !== undefined ? schoolId : selectedSchoolId;
        const queryParam = idToQuery && idToQuery !== "all" ? `?school_id=${idToQuery}` : "";
        const res = await apiClient.get<PowerFlowData>(`/v1/dashboard/power-flow${queryParam}`);
        if (res) {
          setData(res);
        }
      } catch {
        // Fallback state with empty/zero metrics if disconnected
        setData({
          isAggregate: true,
          schoolId: "all",
          schoolName: t("system.allSystems") || "ภาพรวมระบบทั้งหมด",
          siteName: t("system.allSystems") || "ภาพรวมระบบทั้งหมด",
          timestamp: new Date().toISOString(),
          solarKw: 0,
          schoolLoadKw: 0,
          solarToSchoolKw: 0,
          solarToSchoolPercent: 0,
          gridExportKw: 0,
          gridExportPercent: 0,
          gridImportKw: 0,
          todaySummary: {
            solarGenerationKwh: 0,
            totalConsumedKwh: 0,
            totalExportKwh: 0,
            totalImportKwh: 0,
            solarRevenueThb: 0,
            co2ReductionKg: 0,
            equipmentHealth: "normal",
          },
          availableSchools: [],
        });
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [selectedSchoolId, t]
  );

  React.useEffect(() => {
    fetchData(selectedSchoolId);
    const interval = setInterval(() => {
      fetchData(selectedSchoolId);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchData, selectedSchoolId]);

  const handleSelectSchool = (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    setIsSelectorOpen(false);
    fetchData(schoolId, true);
  };

  const schools = data?.availableSchools || [];
  const filteredSchools = schools.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentSchoolName =
    selectedSchoolId === "all"
      ? t("system.allSystems") || "ภาพรวมระบบทั้งหมด"
      : schools.find((s) => s.id === selectedSchoolId)?.name || data?.schoolName || (t("system.school") || "โรงเรียน");

  // Real Database Metrics
  const solarKw = data?.solarKw ?? 0;
  const schoolLoadKw = data?.schoolLoadKw ?? 0;
  const solarToSchoolKw = data?.solarToSchoolKw ?? 0;
  const solarToSchoolPercent = data?.solarToSchoolPercent ?? 0;
  const gridExportKw = data?.gridExportKw ?? 0;
  const gridExportPercent = data?.gridExportPercent ?? 0;
  const gridImportKw = data?.gridImportKw ?? 0;
  const today = data?.todaySummary ?? {
    solarGenerationKwh: 0,
    totalConsumedKwh: 0,
    totalExportKwh: 0,
    totalImportKwh: 0,
    solarRevenueThb: 0,
    co2ReductionKg: 0,
    equipmentHealth: "normal" as const,
  };

  const formattedTime = React.useMemo(() => {
    if (!data?.timestamp) return "00:00";
    try {
      const d = new Date(data.timestamp);
      return d.toLocaleTimeString(locale === "th" ? "th-TH" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return "00:00";
    }
  }, [data?.timestamp, locale]);

  return (
    <div className={cn("space-y-5 w-full min-w-0", className)}>
      {/* 1. Header Bar: Title & School Selector Dropdown Pill */}
      <div className="flex items-center justify-between gap-2 pt-1 pb-1">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
            {selectedSchoolId === "all" ? (t("system.title") || "ภาพรวมระบบ") : currentSchoolName}
          </h1>
        </div>

        {/* Dropdown Pill Button for School / Site Selection */}
        <div className="flex items-center gap-2 shrink-0">
          <ResponsivePopover
            open={isSelectorOpen}
            onOpenChange={setIsSelectorOpen}
            title={t("system.selectSchool") || "เลือกโรงเรียน / ไซต์"}
            sheetClassName="h-[80vh] max-h-[85vh] p-0 flex flex-col w-full rounded-t-2xl overflow-hidden bg-background"
            popoverClassName="w-80 p-0 shadow-lg rounded-xl overflow-hidden"
            trigger={
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 h-9 rounded-full border border-primary/30 bg-primary/10 hover:bg-primary/15 text-primary text-xs font-semibold transition-colors shadow-2xs max-w-[180px] sm:max-w-[220px] cursor-pointer"
              >
                <Globe className="size-3.5 shrink-0" />
                <span className="truncate">
                  {selectedSchoolId === "all" ? (t("system.allSystems") || "ภาพรวมระบบทั้งหมด") : currentSchoolName}
                </span>
                <ChevronDown className="size-3.5 shrink-0 opacity-70" />
              </button>
            }
          >
            <div className="p-4 space-y-3 w-full flex flex-col flex-1 min-h-0">
              {/* Search Box - Standard 40px Height */}
              <div className="relative w-full">
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("system.searchSchool") || "ค้นหาโรงเรียน..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 min-h-[40px] pl-9.5 pr-3 text-sm rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              {/* Options List - Each item 40px height */}
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                {/* All Systems Option */}
                <button
                  type="button"
                  onClick={() => handleSelectSchool("all")}
                  className={cn(
                    "w-full h-10 min-h-[40px] px-3.5 rounded-xl text-sm flex items-center justify-between transition-colors cursor-pointer",
                    selectedSchoolId === "all"
                      ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                      : "hover:bg-muted text-foreground font-medium"
                  )}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Globe className="size-4 shrink-0" />
                    <span className="truncate">{t("system.allSystems") || "ภาพรวมระบบทั้งหมด"}</span>
                  </div>
                  {selectedSchoolId === "all" && <Check className="size-4 shrink-0" />}
                </button>

                <div className="h-px bg-border/50 my-1" />

                {/* Individual Schools */}
                {filteredSchools
                  .filter((s) => s.id !== "all")
                  .map((school) => {
                    const isSelected = selectedSchoolId === school.id;
                    return (
                      <button
                        key={school.id}
                        type="button"
                        onClick={() => handleSelectSchool(school.id)}
                        className={cn(
                          "w-full h-10 min-h-[40px] px-3.5 rounded-xl text-sm flex items-center justify-between transition-colors cursor-pointer",
                          isSelected
                            ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                            : "hover:bg-muted text-foreground font-medium"
                        )}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <Building2 className="size-4 shrink-0 opacity-70" />
                          <span className="truncate">{school.name}</span>
                        </div>
                        {isSelected && <Check className="size-4 shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          </ResponsivePopover>

          <button
            type="button"
            onClick={() => fetchData(selectedSchoolId, true)}
            className="size-8 rounded-full border border-border/60 bg-card hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer"
            title={t("system.refreshData") || "รีเฟรชข้อมูล"}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin text-primary")} />
          </button>
        </div>
      </div>

      {/* 2. Main Content Grid: 8 Columns Left, 4 Columns Right on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start">
        {/* Left Column: Segmented Tabs & Main Visual / Technical Diagram */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-4">
          {/* Segmented Tabs: [ การไหลของพลังงาน ] & [ ผังระบบ ] */}
          <div className="flex h-11 items-center bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl border border-slate-200/60 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab("flow")}
              className={cn(
                "flex-1 h-9 text-xs sm:text-sm font-semibold rounded-lg transition-all text-center cursor-pointer flex items-center justify-center",
                activeTab === "flow"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("system.powerFlow") || "การไหลของพลังงาน"}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("system")}
              className={cn(
                "flex-1 h-9 text-xs sm:text-sm font-semibold rounded-lg transition-all text-center cursor-pointer flex items-center justify-center",
                activeTab === "system"
                  ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("system.schematic") || "ผังระบบ"}
            </button>
          </div>

          {/* Timestamp */}
          <div className="text-xs text-muted-foreground px-1 h-6 flex items-center">
            {t("system.lastUpdated") || "อัปเดตล่าสุด"} {formattedTime} {locale === "th" ? (t("system.timeSuffix") || "น.") : ""}
          </div>

          {/* Tab 1: Real Database-backed Power Flow Diagram */}
          {activeTab === "flow" ? (
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 sm:p-6 lg:p-8 shadow-xs overflow-hidden flex flex-col items-center justify-center min-h-[440px]">
              <svg
                viewBox="0 0 660 370"
                className="w-full h-auto max-w-[660px] lg:max-w-[740px] xl:max-w-[780px] mx-auto select-none"
                style={{ overflow: "visible" }}
              >
                <defs>
                  <marker
                    id="flow-arrow-green"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#16a34a" />
                  </marker>

                  <marker
                    id="flow-arrow-blue"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#2563eb" />
                  </marker>

                  <marker
                    id="flow-arrow-purple"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1 L 8 5 L 0 9 z" fill="#7c3aed" />
                  </marker>
                </defs>

                {/* Top Section: Solar Power Generation */}
                <text
                  x="330"
                  y="24"
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-200 text-[13px] font-semibold tracking-tight"
                >
                  {t("system.solarPower") || "พลังงานจากแสงอาทิตย์"}
                </text>

                {/* Sun Icon */}
                <g transform="translate(276, 38)">
                  <circle cx="12" cy="12" r="6" fill="#f59e0b" />
                  <line x1="12" y1="2" x2="12" y2="4" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="20" x2="12" y2="22" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                  <line x1="2" y1="12" x2="4" y2="12" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                  <line x1="20" y1="12" x2="22" y2="12" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                  <line x1="5" y1="5" x2="6.5" y2="6.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                  <line x1="17.5" y1="17.5" x2="19" y2="19" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                  <line x1="5" y1="19" x2="6.5" y2="17.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                  <line x1="17.5" y1="6.5" x2="19" y2="5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
                </g>

                {/* Solar Real-time kW */}
                <text
                  x="308"
                  y="57"
                  className="fill-slate-900 dark:fill-slate-50 text-[22px] font-extrabold"
                >
                  {solarKw.toFixed(1)} <tspan className="text-[13px] font-bold fill-slate-700 dark:fill-slate-300">kW</tspan>
                </text>

                {/* Primary Flow Lines */}
                <path
                  d="M 330 68 L 330 86 L 95 86 L 95 120"
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd="url(#flow-arrow-green)"
                />

                <path
                  d="M 330 86 L 565 86 L 565 120"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  markerEnd="url(#flow-arrow-blue)"
                />

                {/* Left Branch Labels (Solar to School) */}
                <text
                  x="95"
                  y="146"
                  textAnchor="middle"
                  className="fill-emerald-600 dark:fill-emerald-400 text-[11px] font-medium"
                >
                  {t("system.usedFromSolar") || "ใช้จากโซลาร์"}
                </text>
                <text
                  x="95"
                  y="170"
                  textAnchor="middle"
                  className="fill-emerald-600 dark:fill-emerald-400 text-[18px] font-bold"
                >
                  {solarToSchoolKw.toFixed(1)} <tspan className="text-[11px] font-bold">kW</tspan>
                </text>
                <text
                  x="95"
                  y="190"
                  textAnchor="middle"
                  className="fill-emerald-600 dark:fill-emerald-400 text-[13px] font-semibold"
                >
                  {solarToSchoolPercent}%
                </text>

                {/* Right Branch Labels (Grid Export) */}
                <text
                  x="565"
                  y="146"
                  textAnchor="middle"
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {t("system.exportToGrid") || "ส่งออกสู่โครงข่าย"}
                </text>
                <text
                  x="565"
                  y="170"
                  textAnchor="middle"
                  className="fill-blue-600 dark:fill-blue-400 text-[18px] font-bold"
                >
                  {gridExportKw.toFixed(1)} <tspan className="text-[11px] font-bold">kW</tspan>
                </text>
                <text
                  x="565"
                  y="190"
                  textAnchor="middle"
                  className="fill-blue-600 dark:fill-blue-400 text-[13px] font-semibold"
                >
                  {gridExportPercent}%
                </text>

                {/* Center School Card */}
                <rect
                  x="260"
                  y="114"
                  width="140"
                  height="96"
                  rx="16"
                  className="fill-white dark:fill-slate-800/95 stroke-slate-200/90 dark:stroke-slate-700"
                  strokeWidth="1.5"
                  filter="drop-shadow(0 1px 3px rgba(0, 0, 0, 0.06))"
                />

                <g transform="translate(318, 123)">
                  <path d="M 11 2 L 2 7 L 20 7 Z" fill="#475569" />
                  <rect x="4" y="8" width="2.5" height="9" rx="0.5" fill="#475569" />
                  <rect x="9.5" y="8" width="3" height="9" rx="0.5" fill="#475569" />
                  <rect x="15.5" y="8" width="2.5" height="9" rx="0.5" fill="#475569" />
                  <rect x="2" y="17" width="18" height="2" rx="0.5" fill="#475569" />
                </g>

                <text
                  x="330"
                  y="154"
                  textAnchor="middle"
                  className="fill-slate-900 dark:fill-slate-100 text-[12px] font-bold"
                >
                  {t("system.school") || "โรงเรียน"}
                </text>
                <text
                  x="330"
                  y="169"
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-normal"
                >
                  {t("system.powerConsumption") || "การใช้ไฟฟ้า"}
                </text>
                <text
                  x="330"
                  y="192"
                  textAnchor="middle"
                  className="fill-slate-900 dark:fill-slate-50 text-[17px] font-extrabold"
                >
                  {schoolLoadKw.toFixed(1)} <tspan className="text-[11px] font-bold fill-slate-600 dark:fill-slate-300">kW</tspan>
                </text>

                {/* Lower Connecting Line Loop */}
                <path
                  d="M 95 200 L 95 232 L 565 232 L 565 200"
                  fill="none"
                  stroke="#a855f7"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Bottom Grid Card */}
                <rect
                  x="260"
                  y="256"
                  width="140"
                  height="82"
                  rx="14"
                  className="fill-white dark:fill-slate-800/95 stroke-purple-200 dark:stroke-purple-900/50"
                  strokeWidth="1.5"
                  filter="drop-shadow(0 1px 2px rgba(0, 0, 0, 0.05))"
                />

                <g transform="translate(320, 264)">
                  <path
                    d="M 10 2 L 6 18 M 10 2 L 14 18 M 4 6 L 16 6 M 2 11 L 18 11 M 5 15 L 15 15"
                    stroke="#9333ea"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </g>

                <text
                  x="330"
                  y="304"
                  textAnchor="middle"
                  className="fill-slate-700 dark:fill-slate-200 text-[11px] font-medium"
                >
                  {t("system.importFromGrid") || "ดึงจากโครงข่าย"}
                </text>
                <text
                  x="330"
                  y="326"
                  textAnchor="middle"
                  className="fill-slate-900 dark:fill-slate-50 text-[16px] font-extrabold"
                >
                  {gridImportKw.toFixed(1)} <tspan className="text-[11px] font-bold fill-slate-600 dark:fill-slate-300">kW</tspan>
                </text>

                {/* Vertical Flow Line from Grid up to School with Upward Arrow */}
                <path
                  d="M 330 256 L 330 214"
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="2"
                  strokeLinecap="round"
                  markerEnd="url(#flow-arrow-purple)"
                />
              </svg>
            </div>
          ) : (
            /* Tab 2: Technical Single-Line Diagram & Subsystem Details */
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4 sm:p-5 shadow-xs space-y-4">
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground">
                    {t("system.singleLineTitle") || "ผังระบบเชื่อมต่อทางเทคนิค (Single-Line Diagram)"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("system.singleLineSubtitle") || "สถาปัตยกรรมแผงโซลาร์ อินเวอร์เตอร์ มาตรวัด และเกตเวย์ข้อมูล"}
                  </p>
                </div>

                <div className="relative rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 space-y-3">
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border/60">
                    <div className="size-8 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Sun className="size-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground">
                        {t("system.pvArray") || "1. ชุดแผงโซลาร์เซลล์ (PV Array)"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("system.pvArraySpecs") || "DC 600V – 1000V · Monocrystalline Tier 1"}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                      {t("system.online") || "ออนไลน์"}
                    </Badge>
                  </div>

                  <div className="flex justify-center text-muted-foreground">
                    <ArrowDown className="size-4" />
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border/60">
                    <div className="size-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <Cpu className="size-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground">
                        {t("system.inverter") || "2. อินเวอร์เตอร์แปลงกระแสไฟฟ้า (On-Grid Inverter)"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("system.inverterSpecs") || "Pure Sine Wave 3-Phase 400V · Max Efficiency 98.7%"}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                      {t("system.gridTied") || "Grid-Tied"}
                    </Badge>
                  </div>

                  <div className="flex justify-center text-muted-foreground">
                    <ArrowDown className="size-4" />
                  </div>

                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-card border border-border/60">
                    <div className="size-8 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Wifi className="size-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-foreground">
                        {t("system.gateway") || "3. ตู้ MDB & สมาร์ทเกตเวย์ (IoT Edge Gateway)"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {t("system.gatewaySpecs") || "Modbus RTU RS485 · MQTT over TLS 1.3"}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-500/30">
                      {t("system.connected") || "เชื่อมต่อแล้ว"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Cpu className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground block truncate">
                      {t("system.inverterCardTitle") || "อินเวอร์เตอร์ (Inverter)"}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {t("system.inverterNormal") || "ทำงานปกติ (Grid-Tied)"}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Wifi className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground block truncate">
                      {t("system.gatewayCardTitle") || "เกตเวย์ (IoT Gateway)"}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {t("system.gatewayMqttOnline") || "MQTT ออนไลน์ (1883)"}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-foreground block truncate">
                      {t("system.ppaTitle") || "สัญญาซื้อขายไฟฟ้า (PPA)"}
                    </span>
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className="text-[10px] h-4 px-1 text-primary border-primary/30">
                        {t("system.ppaActive") || "มีผลบังคับใช้"}
                      </Badge>
                      4.25 ฿/kWh
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Today's Summary & Operational / Environmental Impact Cards */}
        <div className="lg:col-span-4 xl:col-span-4 space-y-4">
          {/* Segmented Tabs Spacer on Desktop to match left tabs height */}
          <div className="hidden lg:block h-11" aria-hidden="true" />

          {/* Header Row matching Timestamp height and baseline */}
          <div className="h-6 flex items-center px-1">
            <h2 className="text-base sm:text-lg font-bold text-foreground">
              {t("system.todaySummary") || "ข้อมูลสรุปวันนี้"}
            </h2>
          </div>

          {/* 4 Energy Metric Rows */}
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 divide-y divide-slate-100 dark:divide-slate-800/80 shadow-xs">
              {/* Row 1: พลังงานที่ผลิต */}
              <div className="flex items-center justify-between p-3.5 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Zap className="size-4.5" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t("system.energyProduced") || "พลังงานที่ผลิต"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm sm:text-base font-extrabold text-foreground">
                    {today.solarGenerationKwh.toFixed(1)}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground font-normal">kWh</span>
                </div>
              </div>

              {/* Row 2: พลังงานใช้ทั้งหมด */}
              <div className="flex items-center justify-between p-3.5 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Building2 className="size-4.5" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t("system.totalConsumed") || "พลังงานใช้ทั้งหมด"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm sm:text-base font-extrabold text-foreground">
                    {today.totalConsumedKwh.toFixed(1)}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground font-normal">kWh</span>
                </div>
              </div>

              {/* Row 3: พลังงานส่งออก */}
              <div className="flex items-center justify-between p-3.5 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <ArrowRight className="size-4.5" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t("system.totalExported") || "พลังงานส่งออก"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm sm:text-base font-extrabold text-foreground">
                    {today.totalExportKwh.toFixed(1)}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground font-normal">kWh</span>
                </div>
              </div>

              {/* Row 4: พลังงานดึงจากโครงข่าย */}
              <div className="flex items-center justify-between p-3.5 sm:p-4">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                    <TowerControl className="size-4.5" />
                  </div>
                  <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t("system.totalImported") || "พลังงานดึงจากโครงข่าย"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm sm:text-base font-extrabold text-foreground">
                    {today.totalImportKwh.toFixed(1)}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground font-normal">kWh</span>
                </div>
              </div>
            </div>

          {/* Additional Card: Revenue & CO2 Reduction */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs">
              <div className="text-xs text-muted-foreground mb-1">
                {t("system.revenueEstimate") || "รายได้สะสมวันนี้"}
              </div>
              <div className="text-base sm:text-lg font-extrabold text-foreground truncate">
                {(today.solarRevenueThb ?? 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">฿</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs">
              <div className="text-xs text-muted-foreground mb-1">
                {t("system.co2Reduction") || "ลดการปล่อย CO₂"}
              </div>
              <div className="text-base sm:text-lg font-extrabold text-emerald-600 dark:text-emerald-400 truncate">
                {(today.co2ReductionKg ?? 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">kg</span>
              </div>
            </div>
          </div>

          {/* Additional Card: System Health Indicator */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-4.5 text-primary" />
              <span className="text-xs sm:text-sm font-semibold text-foreground">
                {t("system.systemHealth") || "สถานะความสมบูรณ์"}
              </span>
            </div>
            <div>
              {today.equipmentHealth === "critical" ? (
                <Badge variant="destructive" className="text-xs">
                  {t("system.healthCritical") || "เกิดข้อผิดพลาด"}
                </Badge>
              ) : today.equipmentHealth === "warning" ? (
                <Badge variant="secondary" className="text-xs bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  {t("system.healthWarning") || "มีรายการแจ้งเตือน"}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-xs bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-3 mr-1" />
                  {t("system.healthNormal") || "ระบบทำงานปกติ"}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
