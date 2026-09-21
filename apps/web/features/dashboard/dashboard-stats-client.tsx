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
  "schools",
  "onlineSites",
  "installedMwp",
  "currentMw",
  "periodKwh",
  "periodAmount",
];

export function DashboardStatsClient({
  stats,
}: {
  stats: DashboardSummaryStats;
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
          setCardConfig(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSaveConfig = (newConfig: string[]) => {
    setCardConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch {
      // ignore
    }
  };

  const formatNumber = (value: number, digits = 2) =>
    new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      maximumFractionDigits: digits,
    }).format(value);

  interface MetricDef {
    label: string;
    value: number;
    unit: string;
    note: string;
    tone: string;
    icon: React.ComponentType<{ className?: string }>;
    digits: number;
  }

  const defaultMetricDef: MetricDef = {
    label: t("dashboard.stats.schools"),
    value: stats.schools || 0,
    unit: t("dashboard.stats.unitSchools"),
    note: t("dashboard.stats.registered"),
    tone: "blue",
    icon: GraduationCap,
    digits: 0,
  };

  const metricDefinitions: Record<string, MetricDef> = {
    schools: defaultMetricDef,
    onlineSites: {
      label: t("dashboard.stats.onlineSchools"),
      value: stats.onlineSites || 0,
      unit: t("dashboard.stats.unitSchools"),
      note:
        stats.schools > 0
          ? `${((stats.onlineSites / stats.schools) * 100).toFixed(1)}${t("dashboard.stats.onlinePercent")}`
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
      value: stats.currentMw || 0,
      unit: t("dashboard.stats.unitMw"),
      note:
        stats.installedMwp > 0
          ? `${((stats.currentMw / stats.installedMwp) * 100).toFixed(1)}${t("dashboard.stats.capacityPercent")}`
          : "-",
      tone: "teal",
      icon: Zap,
      digits: 2,
    },
    periodKwh: {
      label: t("dashboard.stats.monthlyEnergy"),
      value: stats.periodKwh ? stats.periodKwh / 1000 : 0,
      unit: t("dashboard.stats.unitMwh"),
      note: t("dashboard.stats.cycleAccumulated"),
      tone: "amber",
      icon: Sun,
      digits: 2,
    },
    periodAmount: {
      label: t("dashboard.stats.monthlyRevenue"),
      value: stats.periodAmount ? stats.periodAmount / 1000000 : 0,
      unit: t("dashboard.stats.unitMillionBaht"),
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
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          {locale === "th" ? "ตัวชี้วัดสำคัญ (Key Metrics)" : "Key Metrics"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsCustomizeOpen(true)}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5 cursor-pointer"
        >
          <SlidersHorizontal className="size-3.5" />
          <span>{locale === "th" ? "ปรับแต่งการ์ด" : "Customize"}</span>
        </Button>
      </div>

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
