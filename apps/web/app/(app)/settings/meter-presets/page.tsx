"use client";

import { AddButton } from "../../../../components/ui/add-button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../../components/ui/tabs";
import { PayloadProfileSettings } from "../../../../features/shared/payload-profile-settings";
import * as React from "react";
import Link from "next/link";
import {
  Activity,
  ChevronLeft,
  Cpu,
  Trash2,
  CheckCircle2,
  Search,
  Sliders,
  Sparkles,
  Layers,
  Pencil,
} from "lucide-react";
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from "../../../../components/ui/table";
import { Button } from "../../../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../../../components/ui/dialog";
import { AppLoading } from "../../../../components/feedback/app-loading";
import { notify } from "../../../../components/feedback/notifications";
import { apiClient } from "../../../../lib/api-client";
import { useT, useLocale } from "../../../../providers/locale-provider";

const createDefaultRegisters = (): RegisterField[] => [
    {
      semanticField: "voltage",
      nameTh: "แรงดันไฟฟ้า",
      registerAddress: "40001",
      dataType: "uint16",
      byteOrder: "AB",
      scale: 0.1,
      unit: "V",
    },
    {
      semanticField: "current",
      nameTh: "กระแสไฟฟ้า",
      registerAddress: "40002",
      dataType: "uint16",
      byteOrder: "AB",
      scale: 0.01,
      unit: "A",
    },
    {
      semanticField: "active_power",
      nameTh: "กำลังไฟฟ้า (Active Power)",
      registerAddress: "40003",
      dataType: "int32",
      byteOrder: "ABCD",
      scale: 0.001,
      unit: "kW",
    },
    {
      semanticField: "total_energy",
      nameTh: "พลังงานไฟฟ้ารวม (Total Energy)",
      registerAddress: "40005",
      dataType: "uint32",
      byteOrder: "ABCD",
      scale: 0.01,
      unit: "kWh",
    },
  ];

export interface RegisterField {
  semanticField: string;
  nameTh: string;
  registerAddress: string;
  dataType: string;
  byteOrder: string;
  scale: number;
  unit: string;
}

export interface MeterPresetItem {
  id: string;
  brand: string;
  model: string;
  deviceType: "meter" | "smart_logger" | "smart_locker";
  description: string;
  registers: RegisterField[];
}

export default function MeterPresetsPage() {
  const t = useT();
  const locale = useLocale();
  const text = (th: string, en: string) => locale === "th" ? th : en;
  const [presets, setPresets] = React.useState<MeterPresetItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [apiError, setApiError] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    apiClient
      .get<any[]>("/v1/meter-presets")
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          const parsed = data.map((d) => ({
            id: d.id,
            brand: d.brand,
            model: d.model,
            deviceType: d.deviceType || "meter",
            description: `${d.brand} ${d.model}`,
            registers:
              typeof d.registers === "string"
                ? JSON.parse(d.registers)
                : d.registers || [],
          }));
          setPresets(parsed);
          setApiError(false);
        } else {
          setPresets([]);
          setApiError(false);
        }
      })
      .catch(() => {
        setPresets([]);
        setApiError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [editingPresetId, setEditingPresetId] = React.useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  // New Preset Form State
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [deviceType, setDeviceType] = React.useState<"meter" | "smart_logger" | "smart_locker">("meter");
  const [description, setDescription] = React.useState("");
  const [registers, setRegisters] = React.useState<RegisterField[]>(createDefaultRegisters());

  const handleAddPreset = async () => {
    if (!brand.trim() || !model.trim()) {
      notify.error("กรุณากรอกยี่ห้อและรุ่นของอุปกรณ์");
      return;
    }

    try {
      const payload = {
        brand: brand.trim(),
        model: model.trim(),
        deviceType,
        registers,
      };
      const saved = editingPresetId ? await apiClient.put<any>(`/v1/meter-presets/${editingPresetId}`, payload) : await apiClient.post<any>("/v1/meter-presets", payload);

      const newPreset: MeterPresetItem = {
        id: saved.id,
        brand: saved.brand,
        model: saved.model,
        deviceType: saved.deviceType || deviceType,
        description: description.trim() || `${brand.trim()} ${model.trim()}`,
        registers:
          typeof saved.registers === "string"
            ? JSON.parse(saved.registers)
            : saved.registers || registers,
      };

      setPresets((prev) => [newPreset, ...prev.filter((p) => p.id !== saved.id)]);
      notify.success("บันทึก Preset มิเตอร์สำเร็จ");
      setIsDialogOpen(false);

      // Reset Form
      setBrand("");
      setModel("");
      setDescription("");
    } catch (err: any) {
      notify.error(err.message || "ไม่สามารถบันทึก Preset มิเตอร์ได้");
    }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      await apiClient.delete(`/v1/meter-presets/${id}`);
      setPresets((prev) => prev.filter((p) => p.id !== id));
      notify.success("ลบ Preset เรียบร้อยแล้ว");
    } catch (err: any) {
      notify.error(err.message || "ไม่สามารถลบ Preset ได้ กรุณาลองใหม่อีกครั้ง");
    }
  };

  const handleAddRegisterRow = () => {
    setRegisters([
      ...registers,
      {
        semanticField: "custom_field",
        nameTh: "ค่าตัวแปรใหม่",
        registerAddress: "40010",
        dataType: "uint16",
        byteOrder: "AB",
        scale: 1.0,
        unit: "",
      },
    ]);
  };

  const handleRemoveRegisterRow = (index: number) => {
    setRegisters(registers.filter((_, i) => i !== index));
  };

  const handleUpdateRegister = (index: number, field: keyof RegisterField, val: any) => {
    setRegisters((prev) =>
      prev.map((reg, i) => (i === index ? { ...reg, [field]: val } : reg))
    );
  };

  const filtered = presets.filter((p) => {
    const matchesSearch =
      p.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || p.deviceType === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loading) return <main className="content"><AppLoading message={text("กำลังโหลดชุดรีจิสเตอร์…", "Loading register presets…")} /></main>;

  return (
    <main className="content">
      <div className="ops-content space-y-6">
        {/* Mobile Back Button (Mobile Only) */}
        <div className="block md:hidden">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <ChevronLeft className="size-4" />
            <span>{text("การตั้งค่า", "Settings")}</span>
          </Link>
        </div>


        <Tabs defaultValue="profiles" className="w-full gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">        <header><h1 className="flex items-center gap-2.5 text-xl font-bold tracking-tight md:text-2xl">{t("navigation.meterPresets")}</h1><p className="mt-1 text-sm text-muted-foreground">{text("จัดการโปรไฟล์ข้อมูลและชุดรีจิสเตอร์สำหรับอุปกรณ์", "Manage payload profiles and register mappings for devices.")}</p></header><TabsList className="ml-auto h-10 p-0 group-data-horizontal/tabs:h-10 bg-primary/10" aria-label={text("ประเภทการตั้งค่ามิเตอร์", "Meter configuration type")}><TabsTrigger className="h-10 px-4 data-active:bg-primary data-active:text-primary-foreground" value="profiles">{text("โปรไฟล์ข้อมูล", "Payload profiles")}</TabsTrigger><TabsTrigger className="h-10 px-4 data-active:bg-primary data-active:text-primary-foreground" value="registers">{text("ชุดรีจิสเตอร์", "Register presets")}</TabsTrigger></TabsList></div>
          <TabsContent value="profiles"><PayloadProfileSettings /></TabsContent>
          <TabsContent value="registers">
        <section aria-labelledby="register-presets-heading" className="flex flex-col gap-4">
        {/* Register presets */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>

            <h2 id="register-presets-heading" className="text-lg font-semibold">{text("ชุดรีจิสเตอร์", "Register presets")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {text("ชุดรีจิสเตอร์ตามยี่ห้อและรุ่น สำหรับเติมค่าตอนเพิ่มอุปกรณ์", "Brand and model register mappings used to fill defaults when adding a device.")}
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <AddButton onClick={() => {setEditingPresetId(null); setBrand(""); setModel(""); setDescription(""); setDeviceType("meter"); setRegisters(createDefaultRegisters());}} size="sm" className="font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer">

                {text("เพิ่มชุดรีจิสเตอร์", "Add register preset")}
              </AddButton>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-none sm:w-[80vw] sm:max-w-[80vw] max-h-[90vh] overflow-y-auto sm:rounded-2xl sm:p-6">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Cpu className="size-4" />
                  </div>
                  {editingPresetId ? text("แก้ไขชุดรีจิสเตอร์", "Edit register preset") : text("เพิ่มชุดรีจิสเตอร์", "Add register preset")}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {text("กำหนดที่อยู่รีจิสเตอร์มาตรฐานสำหรับใช้อ้างอิงตอนเพิ่มอุปกรณ์", "Define standard register addresses and mappings for new devices.")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">{text("ยี่ห้อ (Brand)", "Brand")}</Label>
                    <Input
                      placeholder="เช่น Huawei, Acrel, Eastron"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="h-10 text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{text("รุ่น (Model)", "Model")}</Label>
                    <Input
                      placeholder="เช่น SUN2000, ADW200, SDM630"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="h-10 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">{text("ประเภทอุปกรณ์ (Device Type)", "Device type")}</Label>
                    <Select
                      value={deviceType}
                      onValueChange={(val: any) => setDeviceType(val)}
                    >
                      <SelectTrigger className="h-10 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meter">Meter (มิเตอร์วัดพลังงานไฟฟ้า)</SelectItem>
                        <SelectItem value="smart_logger">Smart Logger (Inverter / Gateway)</SelectItem>
                        <SelectItem value="smart_locker">Smart Locker (ตู้ควบคุมอัจฉริยะ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">{text("คำอธิบาย", "Description")}</Label>
                    <Input
                      placeholder="รายละเอียดเพิ่มเติมของรุ่นนี้"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="h-10 text-xs"
                    />
                  </div>
                </div>

                {/* Registers Mapping Table */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Layers className="size-3.5 text-primary" />
                      {text("รายการ Register ที่แมป (Mapping Fields)", "Register mapping fields")}
                    </Label>
                    <AddButton
                      type="button"
                      variant="outline"

                      onClick={handleAddRegisterRow}
                      className=" px-2"
                    >

                      {text("เพิ่ม Register", "Add register")}
                    </AddButton>
                  </div>

                  <div className="rounded-lg border border-border overflow-hidden">
                    <Table className="w-full text-left text-[11px]">
                      <TableHeader className="bg-muted/70 text-muted-foreground border-b border-border">
                        <TableRow>
                          <TableHead className="p-2">{text("ตัวแปร (Field)", "Field")}</TableHead>
                          <TableHead className="p-2">{text("ชื่อเรียก", "Display name")}</TableHead>
                          <TableHead className="p-2">Register Address</TableHead>
                          <TableHead className="p-2">Data Type</TableHead>
                          <TableHead className="p-2">Scale</TableHead>
                          <TableHead className="p-2">Unit</TableHead>
                          <TableHead className="p-2 w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-border">
                        {registers.map((reg, idx) => (
                          <TableRow key={idx} className="hover:bg-muted/30">
                            <TableCell className="p-1.5">
                              <Select
                                value={reg.semanticField}
                                onValueChange={(val) => {
                                  handleUpdateRegister(idx, "semanticField", val);
                                  if (!reg.nameTh || reg.nameTh === "ตัวแปรใหม่") {
                                    const defaultNames: Record<string, string> = {
                                      voltage: "แรงดันไฟฟ้า",
                                      current: "กระแสไฟฟ้า",
                                      active_power: "กำลังไฟฟ้า",
                                      total_energy: "พลังงานไฟฟ้ารวม",
                                      wind_speed: "ความเร็วลม",
                                      custom: "ค่ากำหนดเอง",
                                    };
                                    if (defaultNames[val]) {
                                      handleUpdateRegister(idx, "nameTh", defaultNames[val]);
                                    }
                                  }
                                }}
                              >
                                <SelectTrigger className="h-10 text-xs w-44">
                                  <SelectValue placeholder="เลือกตัวแปร" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="voltage" className="text-xs">แรงดันไฟฟ้า (voltage)</SelectItem>
                                  <SelectItem value="current" className="text-xs">กระแสไฟฟ้า (current)</SelectItem>
                                  <SelectItem value="active_power" className="text-xs">กำลังไฟฟ้า (active_power)</SelectItem>
                                  <SelectItem value="total_energy" className="text-xs">พลังงานไฟฟ้ารวม (total_energy)</SelectItem>
                                  <SelectItem value="wind_speed" className="text-xs">ความเร็วลม (wind_speed)</SelectItem>
                                  <SelectItem value="custom" className="text-xs">กำหนดเอง (custom)</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Input
                                value={reg.nameTh}
                                onChange={(e) =>
                                  handleUpdateRegister(idx, "nameTh", e.target.value)
                                }
                                className="h-10 text-xs w-32"
                              />
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Input
                                value={reg.registerAddress}
                                onChange={(e) =>
                                  handleUpdateRegister(idx, "registerAddress", e.target.value)
                                }
                                className="h-10 text-xs w-24 font-mono"
                              />
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Select
                                value={reg.dataType}
                                onValueChange={(val) =>
                                  handleUpdateRegister(idx, "dataType", val)
                                }
                              >
                                <SelectTrigger className="h-10 text-xs w-28">
                                  <SelectValue placeholder="Data Type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="uint16" className="text-xs">UINT16</SelectItem>
                                  <SelectItem value="int16" className="text-xs">INT16</SelectItem>
                                  <SelectItem value="uint32" className="text-xs">UINT32</SelectItem>
                                  <SelectItem value="int32" className="text-xs">INT32</SelectItem>
                                  <SelectItem value="float32" className="text-xs">FLOAT32</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Input
                                type="number"
                                step="0.001"
                                value={reg.scale}
                                onChange={(e) =>
                                  handleUpdateRegister(idx, "scale", Number(e.target.value))
                                }
                                className="h-10 text-[11px] w-16"
                              />
                            </TableCell>
                            <TableCell className="p-1.5">
                              <Input
                                value={reg.unit}
                                onChange={(e) =>
                                  handleUpdateRegister(idx, "unit", e.target.value)
                                }
                                className="h-10 text-[11px] w-14"
                              />
                            </TableCell>
                            <TableCell className="p-1.5 text-center">
                              {registers.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  aria-label={text("ลบแถวรีจิสเตอร์", "Delete register row")}
                                  onClick={() => handleRemoveRegisterRow(idx)}
                                  className="h-auto gap-0 px-0 text-destructive hover:opacity-80 p-1"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDialogOpen(false)}
                >
                  {text("ยกเลิก", "Cancel")}
                </Button>
                <Button size="sm" onClick={handleAddPreset}>
                  {text("บันทึก Preset", "Save preset")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full max-w-xs space-y-2"><Label htmlFor="register-search">{text("ค้นหาชุดรีจิสเตอร์", "Search register presets")}</Label><div className="relative">
            <Search className="pointer-events-none absolute left-[calc(0.75rem+1px)] top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              id="register-search" placeholder={text("ค้นหายี่ห้อ รุ่น หรือคำอธิบาย", "Search brand, model, or description")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-10"
            />
          </div>
          </div><div className="w-full space-y-2 sm:w-auto"><Label htmlFor="register-type">{text("ประเภทอุปกรณ์", "Device type")}</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger id="register-type" className="h-10 w-full sm:w-52">
                <SelectValue placeholder={text("ทุกประเภทอุปกรณ์", "All device types")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{text("ทุกประเภทอุปกรณ์", "All device types")}</SelectItem>
                <SelectItem value="meter">Power Meter</SelectItem>
                <SelectItem value="smart_logger">Smart Logger</SelectItem>
                <SelectItem value="smart_locker">Smart Locker</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* API Error Fallback Notice */}
        {apiError && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            <span>{text("ไม่สามารถโหลด Preset มิเตอร์ได้ กรุณาลองใหม่", "Could not load register presets. Please try again.")}</span>
          </div>
        )}

        {/* Preset Cards Grid */}
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground border rounded-xl">
            {text("ไม่พบ Preset ที่ตรงกับเงื่อนไขการค้นหา", "No register presets match your search.")}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => (
              <Card key={item.id} className="panel flex flex-col justify-between hover:border-primary/50 transition-colors">
                <div>
                  <CardHeader className="p-0 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-primary uppercase tracking-wide">
                            {item.brand}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 h-4 font-normal"
                          >
                            {item.deviceType === "meter"
                              ? "Power Meter"
                              : item.deviceType === "smart_logger"
                              ? "Smart Logger"
                              : "Smart Locker"}
                          </Badge>
                        </div>
                        <CardTitle className="text-sm font-semibold text-foreground mt-0.5">
                          {item.model}
                        </CardTitle>
                      </div>

                      <div className="flex gap-1"><Button variant="ghost" size="icon-sm" aria-label={text("แก้ไขชุดรีจิสเตอร์", "Edit register preset")} onClick={() => {setEditingPresetId(item.id); setBrand(item.brand); setModel(item.model); setDescription(item.description); setDeviceType(item.deviceType); setRegisters(item.registers.map(r=>({...r}))); setIsDialogOpen(true);}}><Pencil className="size-3.5"/></Button><Button
  variant="ghost"
  size="sm"
                        type="button"
                        onClick={() => handleDeletePreset(item.id)}
                        className="h-auto gap-0 px-0 text-muted-foreground hover:text-destructive transition-colors p-1 cursor-pointer"
                        aria-label={text("ลบชุดรีจิสเตอร์", "Delete register preset")}
                        title={text("ลบชุดรีจิสเตอร์", "Delete register preset")}
                      >
                        <Trash2 className="size-3.5" />
                      </Button></div>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {item.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-0 pt-2 border-t border-border/60">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        {text("รีจิสเตอร์", "Register mappings")} ({item.registers.length})
                      </span>
                      <div className="space-y-1">
                        {item.registers.map((r, i) => (
                          <div
                            key={i}
                            className="flex flex-col gap-1 text-sm p-2 rounded-md bg-muted/40 font-mono"
                          >
                            <span className="font-sans font-medium text-foreground break-words">
                              {locale === "th" ? (r.nameTh || r.semanticField).replace(/ \([^)]*\)$/, "") : (r.nameTh?.match(/\(([^)]*)\)$/)?.[1] || r.semanticField)}
                            </span>
                            <span className="text-muted-foreground shrink-0">
                              {text("ที่อยู่:", "Address:")} <strong className="text-primary">{r.registerAddress}</strong> ({r.unit || "-"})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="pt-3 mt-3 border-t border-border flex items-center justify-between text-[10.5px] text-muted-foreground">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3" />
                    {text("พร้อมเติมค่าอัตโนมัติ", "Ready to fill defaults")}
                  </span>

                </div>
              </Card>
            ))}
          </div>
        )}
        </section>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
