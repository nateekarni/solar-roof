"use client";

import * as React from "react";
import {
  Activity,
  Cpu,
  Plus,
  Trash2,
  CheckCircle2,
  Search,
  Sliders,
  Sparkles,
  Layers,
} from "lucide-react";
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
import { notify } from "../../../../components/feedback/notifications";
import { apiClient } from "../../../../lib/api-client";
import { useT } from "../../../../providers/locale-provider";

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

const DEFAULT_PRESETS: MeterPresetItem[] = [
  {
    id: "preset-1",
    brand: "Huawei",
    model: "SUN2000-SmartLogger",
    deviceType: "smart_logger",
    description: "Huawei SmartLogger 3000A / Smart Inverter Data Collector",
    registers: [
      {
        semanticField: "voltage",
        nameTh: "แรงดันไฟฟ้า (Phase A-B)",
        registerAddress: "32069",
        dataType: "uint16",
        byteOrder: "AB",
        scale: 0.1,
        unit: "V",
      },
      {
        semanticField: "current",
        nameTh: "กระแสไฟฟ้า (Phase A)",
        registerAddress: "32072",
        dataType: "int32",
        byteOrder: "ABCD",
        scale: 0.01,
        unit: "A",
      },
      {
        semanticField: "active_power",
        nameTh: "กำลังไฟฟ้าจริง (Active Power)",
        registerAddress: "32080",
        dataType: "int32",
        byteOrder: "ABCD",
        scale: 0.001,
        unit: "kW",
      },
      {
        semanticField: "total_energy",
        nameTh: "พลังงานไฟฟ้ารวมสะสม (Total Energy)",
        registerAddress: "32106",
        dataType: "uint32",
        byteOrder: "ABCD",
        scale: 0.01,
        unit: "kWh",
      },
      {
        semanticField: "wind_speed",
        nameTh: "ความเร็วลม / กระแสแรงลม",
        registerAddress: "40032",
        dataType: "float32",
        byteOrder: "ABCD",
        scale: 1.0,
        unit: "m/s",
      },
    ],
  },
  {
    id: "preset-2",
    brand: "Acrel",
    model: "ADW200-MultiCircuit",
    deviceType: "meter",
    description: "Acrel ADW200 Multi-channel IoT Power Meter",
    registers: [
      {
        semanticField: "voltage",
        nameTh: "แรงดัน (Voltage Line-Neutral)",
        registerAddress: "0001H",
        dataType: "uint16",
        byteOrder: "AB",
        scale: 0.1,
        unit: "V",
      },
      {
        semanticField: "current",
        nameTh: "กระแส (Current)",
        registerAddress: "0007H",
        dataType: "uint16",
        byteOrder: "AB",
        scale: 0.01,
        unit: "A",
      },
      {
        semanticField: "active_power",
        nameTh: "กำลังไฟฟ้า (Active Power)",
        registerAddress: "0013H",
        dataType: "int32",
        byteOrder: "ABCD",
        scale: 0.001,
        unit: "kW",
      },
      {
        semanticField: "total_energy",
        nameTh: "พลังงานรวม (Total Active Energy)",
        registerAddress: "0030H",
        dataType: "uint32",
        byteOrder: "ABCD",
        scale: 0.01,
        unit: "kWh",
      },
    ],
  },
  {
    id: "preset-3",
    brand: "Eastron",
    model: "SDM630-Modbus-V2",
    deviceType: "meter",
    description: "Eastron SDM630 Three Phase Multifunction Energy Meter",
    registers: [
      {
        semanticField: "voltage",
        nameTh: "แรงดันไฟฟ้า (Line to Neutral Volts)",
        registerAddress: "30001",
        dataType: "float32",
        byteOrder: "ABCD",
        scale: 1.0,
        unit: "V",
      },
      {
        semanticField: "current",
        nameTh: "กระแสไฟฟ้า (Current Amps)",
        registerAddress: "30007",
        dataType: "float32",
        byteOrder: "ABCD",
        scale: 1.0,
        unit: "A",
      },
      {
        semanticField: "active_power",
        nameTh: "กำลังไฟฟ้า (Total System Power)",
        registerAddress: "30053",
        dataType: "float32",
        byteOrder: "ABCD",
        scale: 0.001,
        unit: "kW",
      },
      {
        semanticField: "total_energy",
        nameTh: "พลังงานไฟฟ้ารวม (Total Imported Energy)",
        registerAddress: "30343",
        dataType: "float32",
        byteOrder: "ABCD",
        scale: 1.0,
        unit: "kWh",
      },
    ],
  },
];

export default function MeterPresetsPage() {
  const t = useT();
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
          setPresets(DEFAULT_PRESETS);
          setApiError(false);
        }
      })
      .catch(() => {
        setPresets(DEFAULT_PRESETS);
        setApiError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const [searchTerm, setSearchTerm] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);

  // New Preset Form State
  const [brand, setBrand] = React.useState("");
  const [model, setModel] = React.useState("");
  const [deviceType, setDeviceType] = React.useState<"meter" | "smart_logger" | "smart_locker">("meter");
  const [description, setDescription] = React.useState("");
  const [registers, setRegisters] = React.useState<RegisterField[]>([
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
  ]);

  const handleAddPreset = async () => {
    if (!brand.trim() || !model.trim()) {
      notify.error("กรุณากรอกยี่ห้อและรุ่นของอุปกรณ์");
      return;
    }

    try {
      const saved = await apiClient.post<any>("/v1/meter-presets", {
        brand: brand.trim(),
        model: model.trim(),
        deviceType,
        registers,
      });

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

  return (
    <main className="content">
      <div className="ops-content space-y-6">
        {/* Header */}
        <div className="page-heading flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="eyebrow">SYSTEM CONFIGURATION</span>
            <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl flex items-center gap-2.5">
              <Sliders className="size-6 text-primary" />
              {t("navigation.meterPresets")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              จัดการ Preset สำหรับ Register Mapping ของมิเตอร์และอุปกรณ์ IoT เพื่อนำไป Auto-fill ตอนเพิ่มอุปกรณ์
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer">
                <Plus className="size-4" />
                เพิ่ม Preset ใหม่
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <Cpu className="size-5 text-primary" />
                  เพิ่ม Preset รุ่นและยี่ห้อมิเตอร์
                </DialogTitle>
                <DialogDescription className="text-xs">
                  กำหนด Address และ Register Mapping มาตรฐานสำหรับใช้อ้างอิงตอนเพิ่มอุปกรณ์
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">ยี่ห้อ (Brand)</Label>
                    <Input
                      placeholder="เช่น Huawei, Acrel, Eastron"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">รุ่น (Model)</Label>
                    <Input
                      placeholder="เช่น SUN2000, ADW200, SDM630"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">ประเภทอุปกรณ์ (Device Type)</Label>
                    <Select
                      value={deviceType}
                      onValueChange={(val: any) => setDeviceType(val)}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="meter">Meter (มิเตอร์วัดพลังงานไฟฟ้า)</SelectItem>
                        <SelectItem value="smart_logger">Smart Logger (Inverter / Gateway)</SelectItem>
                        <SelectItem value="smart_locker">Smart Locker (ตู้ควบคุมอัจฉริยะ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">คำอธิบาย</Label>
                    <Input
                      placeholder="รายละเอียดเพิ่มเติมของรุ่นนี้"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Registers Mapping Table */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                      <Layers className="size-3.5 text-primary" />
                      รายการ Register ที่แมป (Mapping Fields)
                    </Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddRegisterRow}
                      className="h-7 text-xs px-2"
                    >
                      <Plus className="size-3 mr-1" />
                      เพิ่ม Register
                    </Button>
                  </div>

                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-muted/70 text-muted-foreground border-b border-border">
                        <tr>
                          <th className="p-2">ตัวแปร (Field)</th>
                          <th className="p-2">ชื่อเรียก</th>
                          <th className="p-2">Register Address</th>
                          <th className="p-2">Data Type</th>
                          <th className="p-2">Scale</th>
                          <th className="p-2">Unit</th>
                          <th className="p-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {registers.map((reg, idx) => (
                          <tr key={idx} className="hover:bg-muted/30">
                            <td className="p-1.5">
                              <Select
                                value={reg.semanticField}
                                onValueChange={(val) =>
                                  handleUpdateRegister(idx, "semanticField", val)
                                }
                              >
                                <SelectTrigger className="h-7 text-[11px] w-28">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="voltage">voltage</SelectItem>
                                  <SelectItem value="current">current</SelectItem>
                                  <SelectItem value="active_power">active_power</SelectItem>
                                  <SelectItem value="total_energy">total_energy</SelectItem>
                                  <SelectItem value="wind_speed">wind_speed</SelectItem>
                                  <SelectItem value="custom">custom</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={reg.nameTh}
                                onChange={(e) =>
                                  handleUpdateRegister(idx, "nameTh", e.target.value)
                                }
                                className="h-7 text-[11px] w-28"
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={reg.registerAddress}
                                onChange={(e) =>
                                  handleUpdateRegister(idx, "registerAddress", e.target.value)
                                }
                                className="h-7 text-[11px] w-20 font-mono"
                              />
                            </td>
                            <td className="p-1.5">
                              <Select
                                value={reg.dataType}
                                onValueChange={(val) =>
                                  handleUpdateRegister(idx, "dataType", val)
                                }
                              >
                                <SelectTrigger className="h-7 text-[11px] w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="uint16">uint16</SelectItem>
                                  <SelectItem value="int16">int16</SelectItem>
                                  <SelectItem value="uint32">uint32</SelectItem>
                                  <SelectItem value="int32">int32</SelectItem>
                                  <SelectItem value="float32">float32</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-1.5">
                              <Input
                                type="number"
                                step="0.001"
                                value={reg.scale}
                                onChange={(e) =>
                                  handleUpdateRegister(idx, "scale", Number(e.target.value))
                                }
                                className="h-7 text-[11px] w-16"
                              />
                            </td>
                            <td className="p-1.5">
                              <Input
                                value={reg.unit}
                                onChange={(e) =>
                                  handleUpdateRegister(idx, "unit", e.target.value)
                                }
                                className="h-7 text-[11px] w-14"
                              />
                            </td>
                            <td className="p-1.5 text-center">
                              {registers.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRegisterRow(idx)}
                                  className="text-destructive hover:opacity-80 p-1"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDialogOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button size="sm" onClick={handleAddPreset}>
                  บันทึก Preset
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาตามชื่อยี่ห้อ, รุ่น, หรือคำอธิบาย..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 text-xs w-full sm:w-44">
                <SelectValue placeholder="ทุกประเภทอุปกรณ์" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">ทุกประเภทอุปกรณ์</SelectItem>
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
            <span>⚠️ ไม่สามารถเชื่อมต่อ API ได้ — แสดงข้อมูลตัวอย่างเริ่มต้น (DEFAULT_PRESETS)</span>
          </div>
        )}

        {/* Preset Cards Grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="panel h-48 animate-pulse bg-muted/60 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
            ไม่พบ Preset ที่ตรงกับเงื่อนไขการค้นหา
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

                      <button
                        type="button"
                        onClick={() => handleDeletePreset(item.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 cursor-pointer"
                        title="ลบ Preset"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {item.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-0 pt-2 border-t border-border/60">
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Register Mapping ({item.registers.length} รายการ):
                      </span>
                      <div className="space-y-1">
                        {item.registers.map((r, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-[11px] p-1.5 rounded-md bg-muted/40 font-mono"
                          >
                            <span className="font-sans font-medium text-foreground truncate max-w-[130px]">
                              {r.nameTh || r.semanticField}
                            </span>
                            <span className="text-muted-foreground shrink-0">
                              addr: <strong className="text-primary">{r.registerAddress}</strong> ({r.unit || "-"})
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
                    พร้อมใช้งาน Auto-fill
                  </span>
                  <span className="font-mono text-[9px]">{item.id}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
