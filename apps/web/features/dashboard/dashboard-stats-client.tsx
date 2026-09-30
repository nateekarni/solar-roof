"use client";

import * as React from "react";
import {
  GraduationCap,
  Laptop,
  SlidersHorizontal,
  Sun,
  SunMedium,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { DashboardSummaryStats } from "@solar/api-contracts";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { useLocale, useT } from "../../providers/locale-provider";
import { CustomizeCardsModal } from "./customize-cards-modal";

const STORAGE_KEY = "solar_dashboard_card_config";

const DEFAULT_CARD_CONFIG = [
  "totalSites",
  "onlineSites",
  "installedMwp",
  "currentMw",
  "periodKwh",
  "periodAmount",
];

export function DashboardStatsClient({
  stats,
  totalSites,
}: {
  stats: Omit<DashboardSummaryStats,"currentMw"|"periodKwh"> & {currentMw:number|null;periodKwh:number|null;billCount:number;paidBillCount:number};
  totalSites?: number;
}) {
  const t = useT();
  const locale = useLocale();
  const [isCustomizeOpen, setIsCustomizeOpen] = React.useState(false);

  const [cardConfig, setCardConfig] = React.useState<string[]>(DEFAULT_CARD_CONFIG);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 6) {
          setCardConfig(parsed.map(key => key === "schools" ? "totalSites" : key));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    const handleOpen = () => setIsCustomizeOpen(true);
    window.addEventListener("open-customize-cards", handleOpen);
    return () => window.removeEventListener("open-customize-cards", handleOpen);
  }, []);

  const handleSaveConfig = (newConfig: string[]) => {
    setCardConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch {
      // ignore
    }
  };

  const formatNumber = (value: number | null, digits = 2) =>
    value === null ? (locale === "th" ? "ไม่มีข้อมูล" : "No data") :
    new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      maximumFractionDigits: digits,
    }).format(value);

  interface MetricDef {
    label: string;
    value: number | null;
    unit: string;
    note: string;
    tone: string;
    icon: React.ComponentType<{ className?: string }>;
    digits: number;
  }

  const defaultMetricDef: MetricDef = {
    label: locale === "th" ? "ไซต์งานทั้งหมด" : "Total Sites",
    value: totalSites ?? 0,
    unit: locale === "th" ? "ไซต์" : "Sites",
    note: locale === "th" ? "จุดติดตั้งระบบ" : "All sites",
    tone: "blue",
    icon: Laptop,
    digits: 0,
  };

  const metricDefinitions: Record<string, MetricDef> = {
    totalSites: defaultMetricDef,
    onlineSites: {
      label: t("dashboard.stats.onlineSites") || "ไซต์ออนไลน์",
      value: stats.onlineSites || 0,
      unit: t("dashboard.stats.unitSites") || (locale === "th" ? "ไซต์" : "sites"),
      note:
        (totalSites ?? 0) > 0
          ? `${((stats.onlineSites / (totalSites ?? 0)) * 100).toFixed(1)}${t("dashboard.stats.onlinePercent")}`
          : t("common.noData"),
      tone: "green",
      icon: Laptop,
      digits: 0,
    },
    installedMwp: {
      label: t("dashboard.stats.installedCapacity"),
      value: stats.installedMwp || 0,
      unit: t("dashboard.stats.unitMwp"),
      note: locale === "th" ? "กำลังติดตั้งรวม" : "Total Capacity",
      tone: "blue",
      icon: SunMedium,
      digits: 2,
    },
    currentMw: {
      label: t("dashboard.stats.currentProduction"),
      value: stats.currentMw,
      unit: t("dashboard.stats.unitMw"),
      note:
        stats.installedMwp > 0 && stats.currentMw !== null
          ? `${((stats.currentMw / stats.installedMwp) * 100).toFixed(1)}${t("dashboard.stats.capacityPercent")}`
          : "-",
      tone: "teal",
      icon: Zap,
      digits: 2,
    },
    periodKwh: {
      label: t("dashboard.stats.monthlyEnergy"),
      value: stats.periodKwh,
      unit: locale === "th" ? "kWh" : "kWh",
      note: t("dashboard.stats.cycleAccumulated"),
      tone: "amber",
      icon: Sun,
      digits: 2,
    },
    periodAmount: {
      label: t("dashboard.stats.monthlyRevenue"),
      value: stats.periodAmount ? stats.periodAmount : 0,
      unit: locale === "th" ? "บาท" : "THB",
      note: t("dashboard.stats.cycleRevenue"),
      tone: "green",
      icon: TrendingUp,
      digits: 2,
    },
  };

  const availableMetrics = Object.entries(metricDefinitions).map(
    ([key, def]) => ({
      key,
      label: def.label,
    }),
  );

  return (
    <>

      <div className="mb-3 flex gap-4 text-sm"><span>{locale === "th" ? "จำนวนบิล" : "Bills"}: <strong>{stats.billCount}</strong></span><span>{locale === "th" ? "ชำระแล้ว" : "Paid bills"}: <strong>{stats.paidBillCount}</strong></span></div>
      <section className="stats-grid">
        {cardConfig.map((metricKey, idx) => {
          const def = metricDefinitions[metricKey] ?? defaultMetricDef;
          const Icon = def.icon;
          return (
            <Card className={`stat-card ${def.tone}`} key={`${metricKey}-${idx}`}>
              {/* Row 1: Icon + Label */}
              <div className="stat-header">
                <span className="stat-icon">
                  <Icon className="size-3.5" aria-hidden="true" />
                </span>
                <span className="stat-label">{def.label}</span>
              </div>
              {/* Row 2: Number + Badge */}
              <div className="stat-value">
                <strong>
                  {formatNumber(def.value, def.digits)}
                  {def.unit && <em>{def.unit}</em>}
                </strong>
                <Badge
                  variant="secondary"
                  className="text-[10px] font-medium h-4.5 px-1.5 rounded-full shrink-0 leading-none"
                >
                  {def.note}
                </Badge>
              </div>
            </Card>
          );
        })}
      </section>

      <CustomizeCardsModal
        open={isCustomizeOpen}
        onOpenChange={setIsCustomizeOpen}
        currentConfig={cardConfig}
        onSave={handleSaveConfig}
        availableMetrics={availableMetrics}
        defaultConfig={DEFAULT_CARD_CONFIG}
      />
    </>
  );
}
