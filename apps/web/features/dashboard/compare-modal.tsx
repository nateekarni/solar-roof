"use client";

import * as React from "react";
import { BarChart3, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardCompareItem } from "@solar/api-contracts";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";

interface SchoolOption {
  id: string;
  name: string;
}

export function CompareModal() {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [metric, setMetric] = React.useState("installedMwp");
  const [schools, setSchools] = React.useState<SchoolOption[]>([]);
  const [selectedSchoolIds, setSelectedSchoolIds] = React.useState<string[]>([]);
  const [loadingSchools, setLoadingSchools] = React.useState(false);
  const [comparing, setComparing] = React.useState(false);
  const [compareData, setCompareData] = React.useState<DashboardCompareItem[]>([]);

  const METRIC_OPTIONS = [
    { key: "installedMwp", label: locale === "th" ? "กำลังการผลิตติดตั้ง (MWp)" : "Installed Capacity (MWp)", unit: "MWp" },
    { key: "currentMw", label: locale === "th" ? "กำลังผลิตปัจจุบัน (MW)" : "Current Output (MW)", unit: "MW" },
    { key: "periodKwh", label: locale === "th" ? "พลังงานผลิตสะสม (MWh)" : "Energy Generated (MWh)", unit: "MWh" },
    { key: "periodAmount", label: locale === "th" ? "รายได้จากรอบบิล (ล้านบาท)" : "Revenue (Million THB)", unit: locale === "th" ? "ล้านบาท" : "M THB" },
    { key: "onlineSites", label: locale === "th" ? "จำนวนไซต์ออนไลน์ (แห่ง)" : "Online Sites (Count)", unit: locale === "th" ? "แห่ง" : "sites" },
  ];

  const currentUnit = METRIC_OPTIONS.find((m) => m.key === metric)?.unit || "";

  // Fetch school list when modal opens
  React.useEffect(() => {
    if (open) {
      setLoadingSchools(true);
      apiClient
        .get<SchoolOption[]>("/v1/schools")
        .then((data) => {
          if (Array.isArray(data)) {
            setSchools(data);
            // Default select first 4 schools
            if (selectedSchoolIds.length === 0 && data.length > 0) {
              const defaultIds = data.slice(0, 4).map((s) => s.id);
              setSelectedSchoolIds(defaultIds);
            }
          }
        })
        .catch(() => {})
        .finally(() => setLoadingSchools(false));
    }
  }, [open]);

  // Execute comparison query
  const executeCompare = React.useCallback(
    async (metricKey: string, ids: string[]) => {
      setComparing(true);
      try {
        const queryParams = new URLSearchParams();
        queryParams.set("metric", metricKey);
        if (ids.length > 0) {
          queryParams.set("school_ids", ids.join(","));
        }
        const res = await apiClient.get<DashboardCompareItem[]>(
          `/v1/dashboard/compare?${queryParams.toString()}`
        );
        setCompareData(res);
      } catch {
        setCompareData([]);
      } finally {
        setComparing(false);
      }
    },
    []
  );

  React.useEffect(() => {
    if (open) {
      executeCompare(metric, selectedSchoolIds);
    }
  }, [open, metric, selectedSchoolIds, executeCompare]);

  const toggleSchool = (id: string) => {
    setSelectedSchoolIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 6) return prev; // max 6
      return [...prev, id];
    });
  };

  const selectAllSchools = () => {
    setSelectedSchoolIds(schools.slice(0, 6).map((s) => s.id));
  };

  const clearSelection = () => {
    setSelectedSchoolIds([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8.5 gap-1.5 text-xs font-medium shadow-xs hover:bg-muted cursor-pointer"
        >
          <BarChart3 className="size-3.5 text-primary" />
          <span>{locale === "th" ? "เปรียบเทียบ" : "Compare"}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                {locale === "th" ? "เปรียบเทียบข้อมูลเชิงลึกระหว่างโรงเรียน" : "Compare Schools & Sites"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? "เลือกหัวข้อตัวชี้วัดและโรงเรียนที่ต้องการนำมาเปรียบเทียบแบบเจาะลึก"
                  : "Select metrics and schools to analyze side-by-side performance"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Controls: Metric Selector */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/20">
            <div className="space-y-1 w-full sm:w-auto">
              <Label className="text-xs font-semibold text-foreground">
                {locale === "th" ? "หัวข้อที่ต้องการเปรียบเทียบ" : "Comparison Metric"}
              </Label>
              <Select value={metric} onValueChange={setMetric}>
                <SelectTrigger className="h-9 text-xs w-full sm:w-64 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRIC_OPTIONS.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={selectAllSchools}
                className="h-7 text-xs px-2"
              >
                {locale === "th" ? "เลือก 6 โรงเรียนแรก" : "Select Top 6"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
              >
                {locale === "th" ? "ล้างการเลือก" : "Clear"}
              </Button>
            </div>
          </div>

          {/* School Selector Badges */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              {locale === "th"
                ? `เลือกโรงเรียนที่ต้องการเปรียบเทียบ (${selectedSchoolIds.length} โรงเรียน):`
                : `Select schools to compare (${selectedSchoolIds.length}):`}
            </Label>
            {loadingSchools ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="size-3.5 animate-spin" />
                <span>กำลังโหลดรายชื่อโรงเรียน...</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 rounded-lg border border-border/60 bg-card">
                {schools.map((school) => {
                  const isSelected = selectedSchoolIds.includes(school.id);
                  return (
                    <button
                      key={school.id}
                      type="button"
                      onClick={() => toggleSchool(school.id)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer border ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary font-medium"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {isSelected && <Check className="size-3" />}
                      <span>{school.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chart Display Area */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3 border-b border-border/60 pb-2">
              <strong className="text-xs font-semibold text-foreground">
                {METRIC_OPTIONS.find((m) => m.key === metric)?.label}
              </strong>
              <span className="text-[11px] text-muted-foreground">
                {compareData.length} โรงเรียน
              </span>
            </div>

            <div className="h-64 w-full relative">
              {comparing ? (
                <div className="flex h-full w-full items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-5 animate-spin text-primary" />
                  <span>กำลังคำนวณข้อมูลเปรียบเทียบ...</span>
                </div>
              ) : compareData.length === 0 ? (
                <div className="flex h-full w-full flex-col items-center justify-center text-xs text-muted-foreground">
                  <span>กรุณาเลือกโรงเรียนเพื่อแสดงผลการเปรียบเทียบ</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={compareData}
                    margin={{ top: 10, right: 15, left: -10, bottom: 25 }}
                  >
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--border)"
                      strokeDasharray="3 3"
                    />
                    <XAxis
                      dataKey="school"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      fontSize={10}
                      stroke="var(--muted-foreground)"
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={6}
                      fontSize={10}
                      stroke="var(--muted-foreground)"
                      tickFormatter={(val) => `${val}`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length > 0 && payload[0]) {
                          const item = payload[0];
                          const schoolName =
                            (item.payload as { school?: string })?.school ?? "";
                          return (
                            <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-card-foreground shadow-md">
                              <p className="font-semibold text-xs text-foreground">
                                {schoolName}
                              </p>
                              <p className="font-bold text-xs text-primary mt-0.5">
                                {item.value} {currentUnit}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="var(--primary)"
                      radius={[4, 4, 0, 0]}
                      barSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
