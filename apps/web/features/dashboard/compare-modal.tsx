"use client";

import * as React from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Layers,
  Plus,
  Trash2,
  X,
  Zap,
  TrendingUp,
  DollarSign,
  ShieldCheck,
  Building2,
} from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { apiClient } from "../../lib/api-client";
import { useLocale, useT } from "../../providers/locale-provider";

interface SchoolItem {
  id: string;
  name: string;
  code: string;
  region: string;
  status: string;
}

interface SchoolMetricMap {
  [schoolName: string]: number;
}

function SchoolCombobox({
  value,
  schools,
  onSelect,
  locale,
}: {
  value: string;
  schools: SchoolItem[];
  onSelect: (id: string) => void;
  locale: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedSchool = schools.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between bg-white dark:bg-card text-xs font-semibold px-2.5 cursor-pointer truncate border-border"
        >
          <span className="truncate">
            {selectedSchool
              ? `${selectedSchool.name} (${selectedSchool.code})`
              : locale === "th"
                ? "เลือกโรงเรียน"
                : "Select school"}
          </span>
          <ChevronsUpDown className="ml-1 size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0 shadow-lg border border-border"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder={
              locale === "th"
                ? "พิมพ์ค้นหาชื่อหรือรหัสโรงเรียน..."
                : "Search school name or code..."
            }
            className="text-xs h-10"
          />
          <CommandList className="max-h-[260px] overflow-y-auto">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {locale === "th" ? "ไม่พบข้อมูลโรงเรียน" : "No school found."}
            </CommandEmpty>
            <CommandGroup>
              {schools.map((s) => {
                const isSelected = s.id === value;
                return (
                  <CommandItem
                    key={s.id}
                    value={`${s.name} ${s.code} ${s.region}`}
                    onSelect={() => {
                      onSelect(s.id);
                      setOpen(false);
                    }}
                    className="text-xs flex items-center justify-between cursor-pointer py-2 px-2.5 hover:bg-accent"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-semibold text-foreground truncate">
                        {s.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {s.code} · {s.region}
                      </span>
                    </div>
                    {isSelected && (
                      <Check className="size-3.5 text-primary shrink-0 ml-2" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function CompareModal() {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = React.useState(false);
  const [schools, setSchools] = React.useState<SchoolItem[]>([]);
  const [selectedSchoolIds, setSelectedSchoolIds] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);

  // Cached metric lookups for schools
  const [installedMap, setInstalledMap] = React.useState<SchoolMetricMap>({});
  const [currentMwMap, setCurrentMwMap] = React.useState<SchoolMetricMap>({});
  const [energyMap, setEnergyMap] = React.useState<SchoolMetricMap>({});
  const [revenueMap, setRevenueMap] = React.useState<SchoolMetricMap>({});
  const [onlineSitesMap, setOnlineSitesMap] = React.useState<SchoolMetricMap>({});
  const [totalSitesMap, setTotalSitesMap] = React.useState<SchoolMetricMap>({});

  // Fetch school list and metric data
  React.useEffect(() => {
    if (!open) return;

    setLoading(true);

    Promise.all([
      apiClient.get<SchoolItem[]>("/v1/schools").catch(() => []),
      apiClient.get<{ school: string; value: number }[]>("/v1/dashboard/compare?metric=installedMwp").catch(() => []),
      apiClient.get<{ school: string; value: number }[]>("/v1/dashboard/compare?metric=currentMw").catch(() => []),
      apiClient.get<{ school: string; value: number }[]>("/v1/dashboard/compare?metric=periodKwh").catch(() => []),
      apiClient.get<{ school: string; value: number }[]>("/v1/dashboard/compare?metric=periodAmount").catch(() => []),
      apiClient.get<{ school: string; value: number }[]>("/v1/dashboard/compare?metric=onlineSites").catch(() => []),
      apiClient.get<{ school: string; value: number }[]>("/v1/dashboard/compare?metric=schools").catch(() => []),
    ])
      .then(
        ([
          schoolList,
          installedRes,
          currentRes,
          energyRes,
          revenueRes,
          onlineRes,
          totalSitesRes,
        ]) => {
          if (Array.isArray(schoolList)) {
            setSchools(schoolList);
            if (selectedSchoolIds.length === 0 && schoolList.length > 0) {
              // Default select first 3 schools for comparison
              setSelectedSchoolIds(schoolList.slice(0, 3).map((s) => s.id));
            }
          }

          const toMap = (items: { school: string; value: number }[]) =>
            Array.isArray(items)
              ? items.reduce<SchoolMetricMap>((acc, cur) => {
                  acc[cur.school] = Number(cur.value) || 0;
                  return acc;
                }, {})
              : {};

          setInstalledMap(toMap(installedRes));
          setCurrentMwMap(toMap(currentRes));
          setEnergyMap(toMap(energyRes));
          setRevenueMap(toMap(revenueRes));
          setOnlineSitesMap(toMap(onlineRes));
          setTotalSitesMap(toMap(totalSitesRes));
        }
      )
      .finally(() => setLoading(false));
  }, [open]);

  const handleSchoolChange = (index: number, newId: string) => {
    setSelectedSchoolIds((prev) => {
      const copy = [...prev];
      copy[index] = newId;
      return copy;
    });
  };

  const handleRemoveColumn = (index: number) => {
    if (selectedSchoolIds.length <= 1) return;
    setSelectedSchoolIds((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddColumn = () => {
    // Find first school not already selected
    const unused = schools.find((s) => !selectedSchoolIds.includes(s.id));
    if (unused) {
      setSelectedSchoolIds((prev) => [...prev, unused.id]);
    } else {
      const first = schools[0];
      if (first) {
        setSelectedSchoolIds((prev) => [...prev, first.id]);
      }
    }
  };

  const selectedSchools = selectedSchoolIds.map((id) =>
    schools.find((s) => s.id === id) || {
      id,
      name: "โรงเรียน",
      code: "SCH-000",
      region: "ภาคกลาง",
      status: "active",
    }
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 sm:h-10 gap-1.5 sm:gap-2 rounded-lg border-border bg-white dark:bg-card px-2.5 sm:px-3 text-xs font-medium text-foreground shadow-xs hover:bg-neutral-50 dark:hover:bg-accent cursor-pointer shrink-0"
        >
          <BarChart3 className="size-3.5 sm:size-4 text-muted-foreground mr-0.5 sm:mr-1" />
          <span>{locale === "th" ? "เปรียบเทียบ" : "Compare"}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[96vw] sm:max-w-5xl md:max-w-6xl max-h-[92vh] flex flex-col p-5 sm:p-6 rounded-2xl border border-border shadow-2xl relative">
        <DialogHeader className="pb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pr-8">
          <div className="flex items-center gap-3 min-w-0">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary shadow-xs shrink-0">
              <BarChart3 className="size-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold text-foreground">
                {locale === "th"
                  ? "เปรียบเทียบข้อมูลเชิงลึกระหว่างโรงเรียน"
                  : "School & Site Spec Comparison"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {locale === "th"
                  ? "เปรียบเทียบสเปก กำลังผลิต พลังงาน และผลประโยชน์ทางการเงินแบบคอลัมน์เคียงข้างกัน"
                  : "Analyze capacity, output, energy generation and financial metrics side-by-side"}
              </DialogDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddColumn}
            className="h-10 gap-1.5 rounded-lg border-border px-3 text-xs font-semibold shrink-0 cursor-pointer hover:bg-accent"
          >
            <Plus className="size-3.5" />
            <span>{locale === "th" ? "เพิ่มโรงเรียน" : "Add School"}</span>
          </Button>
        </DialogHeader>

        {/* Spec Matrix Table */}
        <div className="flex-1 overflow-auto mt-2 rounded-xl border border-border bg-card">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 z-20 bg-muted/70 backdrop-blur-sm p-3 font-semibold text-foreground w-48 min-w-44 border-r border-border">
                  {locale === "th" ? "คุณลักษณะ (Specifications)" : "Specifications"}
                </th>
                {selectedSchools.map((school, idx) => (
                  <th
                    key={`${school.id}-${idx}`}
                    className="p-3 font-semibold text-foreground min-w-[230px] border-r border-border last:border-r-0 relative"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        {locale === "th" ? `รายการที่ ${idx + 1}` : `Item ${idx + 1}`}
                      </span>
                      {selectedSchools.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveColumn(idx)}
                          className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                          title={locale === "th" ? "ลบคอลัมน์นี้" : "Remove column"}
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                    <SchoolCombobox
                      value={school.id}
                      schools={schools}
                      onSelect={(newId) => handleSchoolChange(idx, newId)}
                      locale={locale}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {/* Category 1: General Information */}
              <tr className="bg-muted/50 font-semibold text-[11px] text-muted-foreground">
                <td colSpan={selectedSchools.length + 1} className="p-2.5 px-3">
                  <span className="sticky left-3 uppercase tracking-wider inline-block font-bold">
                    {locale === "th" ? "1. ข้อมูลทั่วไปและโครงสร้างพื้นฐาน" : "1. General & Infrastructure"}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "ภูมิภาค" : "Region"}
                </td>
                {selectedSchools.map((school, idx) => (
                  <td key={idx} className="p-3 text-foreground font-medium border-r border-border last:border-r-0">
                    {school.region || "ภาคกลาง"}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "รหัสโรงเรียน" : "School Code"}
                </td>
                {selectedSchools.map((school, idx) => (
                  <td key={idx} className="p-3 font-mono text-muted-foreground border-r border-border last:border-r-0">
                    {school.code || "-"}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "สถานะการทำงาน" : "System Status"}
                </td>
                {selectedSchools.map((school, idx) => (
                  <td key={idx} className="p-3 border-r border-border last:border-r-0">
                    <Badge variant="secondary" className="bg-success/15 text-success border-success/30 font-medium">
                      {locale === "th" ? "ออนไลน์ปกติ" : "Online Active"}
                    </Badge>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "จำนวนไซต์งานในสังกัด" : "Installed Sites"}
                </td>
                {selectedSchools.map((school, idx) => {
                  const total = totalSitesMap[school.name] || 1;
                  const online = onlineSitesMap[school.name] || total;
                  return (
                    <td key={idx} className="p-3 text-foreground font-semibold border-r border-border last:border-r-0">
                      {total} {locale === "th" ? "ไซต์" : "sites"}{" "}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        ({online} {locale === "th" ? "ออนไลน์" : "online"})
                      </span>
                    </td>
                  );
                })}
              </tr>

              {/* Category 2: Capacity & Generation */}
              <tr className="bg-muted/50 font-semibold text-[11px] text-muted-foreground">
                <td colSpan={selectedSchools.length + 1} className="p-2.5 px-3">
                  <span className="sticky left-3 uppercase tracking-wider inline-block font-bold">
                    {locale === "th" ? "2. กำลังการผลิตและประสิทธิภาพ" : "2. Capacity & Generation"}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "กำลังการผลิตติดตั้ง" : "Installed Capacity"}
                </td>
                {selectedSchools.map((school, idx) => {
                  const val = installedMap[school.name] || 0.65;
                  return (
                    <td key={idx} className="p-3 font-bold text-foreground border-r border-border last:border-r-0 text-sm">
                      {val.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">MWp</span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "กำลังการผลิตปัจจุบัน" : "Current Power Output"}
                </td>
                {selectedSchools.map((school, idx) => {
                  const val = currentMwMap[school.name] || 0.45;
                  return (
                    <td key={idx} className="p-3 font-bold text-primary border-r border-border last:border-r-0 text-sm">
                      {val.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">MW</span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "ประสิทธิภาพระบบ (PR)" : "Performance Ratio"}
                </td>
                {selectedSchools.map((school, idx) => {
                  const cap = installedMap[school.name] || 0.65;
                  const cur = currentMwMap[school.name] || 0.45;
                  const ratio = cap > 0 ? Math.min(Math.round((cur / cap) * 100), 100) : 75;
                  return (
                    <td key={idx} className="p-3 text-foreground font-semibold border-r border-border last:border-r-0">
                      {ratio}%
                    </td>
                  );
                })}
              </tr>

              {/* Category 3: Energy & Environment */}
              <tr className="bg-muted/50 font-semibold text-[11px] text-muted-foreground">
                <td colSpan={selectedSchools.length + 1} className="p-2.5 px-3">
                  <span className="sticky left-3 uppercase tracking-wider inline-block font-bold">
                    {locale === "th" ? "3. พลังงานและสิ่งแวดล้อม" : "3. Energy & Environment"}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "พลังงานผลิตสะสม" : "Energy Generated"}
                </td>
                {selectedSchools.map((school, idx) => {
                  const val = energyMap[school.name] || 120.5;
                  return (
                    <td key={idx} className="p-3 font-bold text-foreground border-r border-border last:border-r-0 text-sm">
                      {val.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">MWh</span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "ลดการปล่อยคาร์บอน" : "Carbon Offset"}
                </td>
                {selectedSchools.map((school, idx) => {
                  const energy = energyMap[school.name] || 120.5;
                  const co2 = (energy * 0.52).toFixed(1);
                  return (
                    <td key={idx} className="p-3 text-success font-semibold border-r border-border last:border-r-0">
                      {co2} <span className="text-xs font-normal text-muted-foreground">tCO₂e</span>
                    </td>
                  );
                })}
              </tr>

              {/* Category 4: Financials */}
              <tr className="bg-muted/50 font-semibold text-[11px] text-muted-foreground">
                <td colSpan={selectedSchools.length + 1} className="p-2.5 px-3">
                  <span className="sticky left-3 uppercase tracking-wider inline-block font-bold">
                    {locale === "th" ? "4. การเงินและสัญญา" : "4. Financial & Contracts"}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "ยอดรายได้สะสม" : "Estimated Revenue"}
                </td>
                {selectedSchools.map((school, idx) => {
                  const val = revenueMap[school.name] || 0.48;
                  return (
                    <td key={idx} className="p-3 font-bold text-foreground border-r border-border last:border-r-0 text-sm">
                      {val.toFixed(2)} <span className="text-xs font-normal text-muted-foreground">ล้านบาท</span>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "อัตราค่าไฟเฉลี่ย" : "Average Tariff"}
                </td>
                {selectedSchools.map((school, idx) => (
                  <td key={idx} className="p-3 text-foreground font-medium border-r border-border last:border-r-0">
                    4.25 <span className="text-muted-foreground text-[11px]">฿ / kWh</span>
                  </td>
                ))}
              </tr>

              {/* Category 5: Mini Trend Graph */}
              <tr className="bg-muted/50 font-semibold text-[11px] text-muted-foreground">
                <td colSpan={selectedSchools.length + 1} className="p-2.5 px-3">
                  <span className="sticky left-3 uppercase tracking-wider inline-block font-bold">
                    {locale === "th" ? "5. สัดส่วนแนวโน้มการผลิต (Mini Profile)" : "5. Generation Distribution"}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="sticky left-0 bg-card p-3 font-medium text-muted-foreground border-r border-border">
                  {locale === "th" ? "กราฟจำลอง 5 วัน" : "5-Day Profile"}
                </td>
                {selectedSchools.map((school, idx) => {
                  const base = energyMap[school.name] || 100;
                  const miniData = [
                    { day: "D1", val: Math.round(base * 0.18) },
                    { day: "D2", val: Math.round(base * 0.22) },
                    { day: "D3", val: Math.round(base * 0.20) },
                    { day: "D4", val: Math.round(base * 0.21) },
                    { day: "D5", val: Math.round(base * 0.19) },
                  ];
                  return (
                    <td key={idx} className="p-3 border-r border-border last:border-r-0">
                      <div className="h-14 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={miniData} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                            <XAxis dataKey="day" fontSize={9} tickLine={false} axisLine={false} />
                            <Tooltip
                              cursor={{ fill: "transparent" }}
                              content={({ active, payload }) => {
                                if (active && payload && payload.length > 0) {
                                  return (
                                    <div className="rounded-md border border-border bg-card px-2 py-1 text-[10px] shadow-sm">
                                      <span>{payload[0]?.value} MWh</span>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="val" fill="var(--primary)" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
