"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  Building2,
  Check,
  ChevronLeft,
  Clock,
  Coins,
  CreditCard,
  Edit2,
  Globe,
  Laptop,
  Loader2,
  Moon,
  Palette,
  Plus,
  Save,
  Sliders,
  Sun,
  Trash2,
  Zap,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useLocale, useSetLocale, useT } from "../../../../providers/locale-provider";
import { apiClient } from "../../../../lib/api-client";
import { notify } from "../../../../components/feedback/notifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Label } from "../../../../components/ui/label";
import { Input } from "../../../../components/ui/input";
import { Textarea } from "../../../../components/ui/textarea";
import { Switch } from "../../../../components/ui/switch";
import { Badge } from "../../../../components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";

interface CompanyProfile {
  id?: string;
  companyName: string;
  taxId: string;
  branch: string;
  address: string;
  phone: string;
  email: string;
  logoUrl?: string;
}

interface CompanyBankAccount {
  id?: string;
  bankName: string;
  bankCode?: string;
  accountName: string;
  accountNumber: string;
  branchName?: string;
  promptpayId?: string;
  isDefault: boolean;
}

const DEFAULT_COMPANY: CompanyProfile = {
  companyName: "", taxId: "", branch: "", address: "", phone: "", email: "",
};

const COMMON_BANKS = [
  "ธนาคารกสิกรไทย (KBANK)",
  "ธนาคารไทยพาณิชย์ (SCB)",
  "ธนาคารกรุงเทพ (BBL)",
  "ธนาคารกรุงไทย (KTB)",
  "ธนาคารทหารไทยธนชาต (TTB)",
  "ธนาคารกรุงศรีอยุธยา (BAY)",
];

export default function GeneralSettingsPage() {
  const t = useT();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const { theme, setTheme } = useTheme();

  const [defaultPaymentTermDays, setDefaultPaymentTermDays] = React.useState("");
  const [financialRemindersEnabled, setFinancialRemindersEnabled] = React.useState(false);
  const [financialReminderDays, setFinancialReminderDays] = React.useState("");
  const [savingFinancial, setSavingFinancial] = React.useState(false);
  const [financialLoaded, setFinancialLoaded] = React.useState(false);
  const saveFinancialSettings = async () => {
    const term = defaultPaymentTermDays === "" ? null : Number(defaultPaymentTermDays);
    const days = financialReminderDays.trim() === "" ? [] : financialReminderDays.split(",").map(value => Number(value.trim()));
    if ((term !== null && (!/^\d+$/.test(defaultPaymentTermDays) || !Number.isSafeInteger(term) || term > 3650)) || days.some(day => !Number.isSafeInteger(day) || day <= 0) || new Set(days).size !== days.length || (financialRemindersEnabled && !days.length)) { notify.error("Enter whole calendar days and a nonempty reminder schedule before enabling"); return; }
    setSavingFinancial(true);
    try {
      await apiClient.put("/v1/settings", {defaultPaymentTermDays: term, financialRemindersEnabled, financialReminderDays: days});
      notify.success("Financial settings saved");
    } catch (error: any) { notify.error(error.message || "Unable to save financial settings"); }
    finally { setSavingFinancial(false); }
  };

  // Basic settings
  const [criticalEmailAlert, setCriticalEmailAlert] = React.useState(true);
  const [inAppNotification, setInAppNotification] = React.useState(true);
  const [meterOfflineAlert, setMeterOfflineAlert] = React.useState(true);
  const [energyUnit, setEnergyUnit] = React.useState("kWh");

  // Company Profile states
  const [company, setCompany] = React.useState<CompanyProfile>(DEFAULT_COMPANY);
  const [savingCompany, setSavingCompany] = React.useState(false);

  // Bank Accounts states
  const [bankAccounts, setBankAccounts] = React.useState<CompanyBankAccount[]>([]);
  const [loadingBanks, setLoadingBanks] = React.useState(false);
  const [bankModalOpen, setBankModalOpen] = React.useState(false);
  const [savingBank, setSavingBank] = React.useState(false);
  const [editingBank, setEditingBank] = React.useState<CompanyBankAccount>({
    bankName: COMMON_BANKS[0] || "ธนาคารกสิกรไทย (KBANK)",
    accountName: "",
    accountNumber: "",
    branchName: "",
    isDefault: false,
  });

  const fetchCompany = React.useCallback(async () => {
    try {
      const res = await apiClient.get<CompanyProfile>("/v1/settings/company");
      if (res) {
        setCompany(res);
      }
    } catch {
      notify.error("Unable to load saved company configuration");
    }
  }, []);

  const fetchBankAccounts = React.useCallback(async () => {
    setLoadingBanks(true);
    try {
      const res = await apiClient.get<CompanyBankAccount[]>("/v1/settings/bank-accounts");
      if (Array.isArray(res)) {
        setBankAccounts(res);
      }
    } catch {
      // fallback
    } finally {
      setLoadingBanks(false);
    }
  }, []);

  React.useEffect(() => {
    apiClient
      .get<{ criticalEmailAlert?: boolean; inAppNotification?: boolean; defaultPaymentTermDays: number | null; financialRemindersEnabled: boolean; financialReminderDays: number[] }>("/v1/settings")
      .then((data) => {
        if (data) {
          setDefaultPaymentTermDays(data.defaultPaymentTermDays == null ? "" : String(data.defaultPaymentTermDays));
          setFinancialRemindersEnabled(data.financialRemindersEnabled === true);
          setFinancialReminderDays((data.financialReminderDays ?? []).join(", "));
          setFinancialLoaded(true);
          if (typeof data.criticalEmailAlert === "boolean") {
            setCriticalEmailAlert(data.criticalEmailAlert);
          }
          if (typeof data.inAppNotification === "boolean") {
            setInAppNotification(data.inAppNotification);
          }
        }
      })
      .catch(() => notify.error("Unable to load system settings"));

    fetchCompany();
    fetchBankAccounts();
  }, [fetchCompany, fetchBankAccounts]);

  const handleSaveNotifications = async (newEmail: boolean, newInApp: boolean) => {
    try {
      await apiClient.put("/v1/settings", {
        criticalEmailAlert: newEmail,
        inAppNotification: newInApp,
      });
      notify.success(locale === "th" ? "บันทึกการตั้งค่าเรียบร้อยแล้ว" : "Settings saved successfully");
    } catch {
      notify.error(locale === "th" ? "ไม่สามารถบันทึกการตั้งค่าได้" : "Failed to save settings");
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCompany(true);
    try {
      await apiClient.put("/v1/settings/company", company);
      notify.success(locale === "th" ? "บันทึกข้อมูลบริษัทเรียบร้อยแล้ว" : "Company profile updated");
    } catch (err: any) {
      notify.error(err?.message || "ไม่สามารถบันทึกข้อมูลบริษัทได้");
    } finally {
      setSavingCompany(false);
    }
  };

  const handleOpenAddBank = () => {
    setEditingBank({
      bankName: COMMON_BANKS[0] || "ธนาคารกสิกรไทย (KBANK)",
      accountName: company.companyName || "",
      accountNumber: "",
      branchName: "",
      isDefault: bankAccounts.length === 0,
    });
    setBankModalOpen(true);
  };

  const handleOpenEditBank = (bank: CompanyBankAccount) => {
    setEditingBank(bank);
    setBankModalOpen(true);
  };

  const handleSaveBank = async () => {
    if (!editingBank.bankName || !editingBank.accountNumber || !editingBank.accountName) {
      notify.error(locale === "th" ? "กรุณากรอกข้อมูลบัญชีให้ครบถ้วน" : "Please fill all required fields");
      return;
    }
    setSavingBank(true);
    try {
      if (editingBank.id) {
        await apiClient.put(`/v1/settings/bank-accounts/${editingBank.id}`, editingBank);
      } else {
        await apiClient.put("/v1/settings/bank-accounts", editingBank);
      }
      notify.success(locale === "th" ? "บันทึกบัญชีธนาคารเรียบร้อยแล้ว" : "Bank account saved");
      setBankModalOpen(false);
      fetchBankAccounts();
    } catch (err: any) {
      notify.error(err?.message || "ไม่สามารถบันทึกบัญชีธนาคารได้");
    } finally {
      setSavingBank(false);
    }
  };

  const handleDeleteBank = async (id?: string) => {
    if (!id) return;
    if (!confirm(locale === "th" ? "ยืนยันการลบบัญชีธนาคารนี้?" : "Delete this bank account?")) return;
    try {
      await apiClient.delete(`/v1/settings/bank-accounts/${id}`);
      notify.success(locale === "th" ? "ลบบัญชีธนาคารเรียบร้อยแล้ว" : "Bank account deleted");
      fetchBankAccounts();
    } catch (err: any) {
      notify.error(err?.message || "ไม่สามารถลบบัญชีธนาคารได้");
    }
  };

  return (
    <main className="content">
      <div className="ops-content max-w-4xl space-y-6">
        {/* Navigation Back Link (Mobile Only) */}
        <div className="block md:hidden">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ChevronLeft className="size-4" />
            <span>{locale === "th" ? "การตั้งค่า" : "Settings"}</span>
          </Link>
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl flex items-center gap-2.5">
            <Sliders className="size-6 text-primary" />
            <span>{locale === "th" ? "การตั้งค่าทั่วไป" : "General Settings"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === "th"
              ? "จัดการข้อมูลบริษัท บัญชีธนาคารรับเงิน ภาษา ธีมการแสดงผล และการแจ้งเตือน"
              : "Manage company billing profile, bank accounts, language, appearance, and alerts"}
          </p>
        </div>

        <Card>
          <CardHeader><CardTitle>กำหนดชำระและการเตือนเกินกำหนด</CardTitle><CardDescription>ค่าเริ่มต้นใช้กับสัญญาใหม่เท่านั้น ไม่เปลี่ยนสัญญาหรือบิลเดิม</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor="default-payment-days">จำนวนวันปฏิทินหลังออกบิล (ว่าง = ยังไม่กำหนด)</Label>
            <Input id="default-payment-days" type="number" min="0" step="1" value={defaultPaymentTermDays} onChange={event => setDefaultPaymentTermDays(event.target.value)} disabled={!financialLoaded} />
            <p className="text-sm text-muted-foreground">0 หมายถึงครบกำหนดวันออกบิล ต้องระบุจำนวนวันในสัญญาก่อนออกบิล</p>
            <div className="flex items-center gap-3"><Switch id="financial-reminders" checked={financialRemindersEnabled} onCheckedChange={setFinancialRemindersEnabled} disabled={!financialLoaded} /><Label htmlFor="financial-reminders">เปิดอีเมลเตือนเกินกำหนด</Label></div>
            <Label htmlFor="financial-reminder-days">วันที่ให้เตือนหลังครบกำหนด คั่นด้วยเครื่องหมายจุลภาค</Label>
            <Input id="financial-reminder-days" value={financialReminderDays} onChange={event => setFinancialReminderDays(event.target.value)} disabled={!financialLoaded} />
            <p className="text-sm text-muted-foreground">ไม่มีตารางเตือนเริ่มต้น หยุดเมื่อชำระหรือยกเลิก และพักระหว่างรอตรวจหลักฐาน</p>
            <Button onClick={saveFinancialSettings} disabled={!financialLoaded || savingFinancial}>{savingFinancial ? "Saving…" : "บันทึกการตั้งค่าการเงิน"}</Button>
          </CardContent>
        </Card>
        {/* Section 1: Company Profile (FlowAccount Standard) */}
        <Card className="panel border-border/80 shadow-xs">
          <CardHeader className="p-0 pb-3 border-b border-border/40 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Building2 className="size-4 text-primary" />
                <span>{locale === "th" ? "ข้อมูลบริษัท / นิติบุคคล (Company Billing Profile)" : "Company Billing Profile"}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {locale === "th"
                  ? "ข้อมูลที่จะปรากฏในหัวเอกสารใบแจ้งหนี้ ใบเสร็จรับเงิน/ใบกำกับภาษี และสัญญา PPA ตามมาตรฐาน FlowAccount"
                  : "Header information shown on invoices, tax receipts, and PPA contracts (FlowAccount standard)"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-4">
            <form onSubmit={handleSaveCompany} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground">
                    {locale === "th" ? "ชื่อบริษัท / นิติบุคคล *" : "Company Name *"}
                  </Label>
                  <Input
                    value={company.companyName}
                    onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                    required
                    className="h-9 text-xs"
                    placeholder="ชื่อบริษัทตามทะเบียน"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground">
                    {locale === "th" ? "เลขประจำตัวผู้เสียภาษี 13 หลัก *" : "Tax ID (13 Digits) *"}
                  </Label>
                  <Input
                    value={company.taxId}
                    onChange={(e) => setCompany({ ...company, taxId: e.target.value })}
                    required
                    maxLength={13}
                    className="h-9 text-xs font-mono"
                    placeholder="เลขประจำตัวผู้เสียภาษี"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground">
                    {locale === "th" ? "สาขา (Branch)" : "Branch"}
                  </Label>
                  <Input
                    value={company.branch}
                    onChange={(e) => setCompany({ ...company, branch: e.target.value })}
                    className="h-9 text-xs"
                    placeholder="ชื่อและรหัสสาขา"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-medium text-foreground">
                    {locale === "th" ? "เบอร์โทรศัพท์ติดต่อ" : "Phone Number"}
                  </Label>
                  <Input
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                    className="h-9 text-xs"
                    placeholder="หมายเลขโทรศัพท์"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs font-medium text-foreground">
                    {locale === "th" ? "อีเมลสำหรับการเงินและใบแจ้งหนี้ *" : "Billing Email *"}
                  </Label>
                  <Input
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                    required
                    className="h-9 text-xs"
                    placeholder="อีเมลสำหรับติดต่อ"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label className="text-xs font-medium text-foreground">
                    {locale === "th" ? "ที่อยู่จดทะเบียนภาษี (Tax Address) *" : "Tax Address *"}
                  </Label>
                  <Textarea
                    value={company.address}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                    required
                    className="text-xs min-h-[60px]"
                    placeholder="ที่อยู่ตามทะเบียน"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={savingCompany}
                  className="h-9 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                >
                  {savingCompany ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  <span>{locale === "th" ? "บันทึกข้อมูลบริษัท" : "Save Company Profile"}</span>
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Section 2: Bank Accounts for Payments (FlowAccount Standard) */}
        <Card className="panel border-border/80 shadow-xs">
          <CardHeader className="p-0 pb-3 border-b border-border/40 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <CreditCard className="size-4 text-primary" />
                <span>{locale === "th" ? "บัญชีธนาคารสำหรับรับชำระเงิน (Bank Accounts)" : "Payment Bank Accounts"}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {locale === "th"
                  ? "บัญชีที่จะแสดงในส่วนท้ายของใบแจ้งหนี้เพื่อให้ลูกค้าโอนชำระเงิน"
                  : "Bank accounts displayed in billing invoices for customer payment transfer"}
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={handleOpenAddBank}
              className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
            >
              <Plus className="size-3.5" />
              <span>{locale === "th" ? "เพิ่มบัญชี" : "Add Account"}</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0 pt-4 space-y-3">
            {loadingBanks ? (
              <div className="flex items-center justify-center p-6 text-muted-foreground text-xs gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span>กำลังโหลดข้อมูลบัญชีธนาคาร...</span>
              </div>
            ) : bankAccounts.length === 0 ? (
              <div className="p-6 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground space-y-2">
                <CreditCard className="size-8 mx-auto text-muted-foreground/40" />
                <p>{locale === "th" ? "ยังไม่มีการเพิ่มบัญชีธนาคาร" : "No bank accounts added yet"}</p>
                <Button size="sm" variant="outline" onClick={handleOpenAddBank} className="h-7 text-xs">
                  {locale === "th" ? "เพิ่มบัญชีแรก" : "Add first account"}
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {bankAccounts.map((b) => (
                  <div
                    key={b.id || b.accountNumber}
                    className="p-3.5 rounded-xl border border-border/70 bg-card/70 flex items-start justify-between gap-3 shadow-2xs hover:border-primary/40 transition-colors"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-foreground truncate">{b.bankName}</span>
                        {b.isDefault && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border border-primary/20">
                            {locale === "th" ? "บัญชีหลัก" : "Default"}
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-sm font-bold text-primary tracking-wide">
                        {b.accountNumber}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{b.accountName}</p>
                      {b.branchName && (
                        <p className="text-[10px] text-muted-foreground/80">สาขา: {b.branchName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleOpenEditBank(b)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteBank(b.id)}
                        className="text-muted-foreground hover:text-rose-600"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 3: Preference Cards (Language, Theme, Alerts, Units) */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Card: Language & Region */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Globe className="size-4 text-primary" />
                <span>{locale === "th" ? "ภาษาและภูมิภาค" : "Language & Region"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th" ? "กำหนดภาษาหลักที่ใช้แสดงผลในระบบ" : "Select your preferred platform language"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-3 space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {locale === "th" ? "เลือกภาษา (Language)" : "Language"}
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setLocale("th")}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      locale === "th"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🇹🇭</span>
                      <span>ภาษาไทย (TH)</span>
                    </div>
                    {locale === "th" && <Check className="size-4 text-[#EAB308]" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setLocale("en")}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      locale === "en"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🇬🇧</span>
                      <span>English (EN)</span>
                    </div>
                    {locale === "en" && <Check className="size-4 text-[#EAB308]" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {locale === "th" ? "เขตเวลา (Timezone)" : "Timezone"}
                </span>
                <span className="font-medium text-foreground">Asia/Bangkok (GMT+7)</span>
              </div>
            </CardContent>
          </Card>

          {/* Card: Theme & Appearance */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Palette className="size-4 text-primary" />
                <span>{locale === "th" ? "ธีมการแสดงผล" : "Appearance & Theme"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th" ? "เลือกโหมดการแสดงผลที่สบายตากับคุณ" : "Choose your preferred color theme"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-3 space-y-3">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {locale === "th" ? "โหมดสี (Theme Mode)" : "Theme Mode"}
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTheme("light")}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      theme === "light"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Sun className="size-5" />
                    <span>{locale === "th" ? "โหมดสว่าง" : "Light"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme("dark")}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      theme === "dark"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Moon className="size-5" />
                    <span>{locale === "th" ? "โหมดมืด" : "Dark"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTheme("system")}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      theme === "system"
                        ? "border-[#EAB308] bg-[#EAB308]/10 text-foreground ring-1 ring-[#EAB308]"
                        : "border-border/60 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Laptop className="size-5" />
                    <span>{locale === "th" ? "ตามระบบ" : "System"}</span>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Notification Preferences */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                <span>{locale === "th" ? "การตั้งค่าการแจ้งเตือน" : "Notification Preferences"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th"
                  ? "ควบคุมช่องทางการแจ้งเตือนเหตุการณ์สำคัญ"
                  : "Control channels for alerts and events"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-3 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="critical-email" className="text-xs font-medium cursor-pointer">
                    {locale === "th" ? "อีเมลแจ้งเตือนเหตุวิกฤต (Critical Email)" : "Critical Email Alerts"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th"
                      ? "ส่งอีเมลทันทีเมื่อมิเตอร์ขัดข้องหรือแรงดันไฟผิดปกติ"
                      : "Receive instant emails on critical inverter faults"}
                  </p>
                </div>
                <Switch
                  id="critical-email"
                  checked={criticalEmailAlert}
                  onCheckedChange={(checked) => {
                    setCriticalEmailAlert(checked);
                    handleSaveNotifications(checked, inAppNotification);
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label htmlFor="in-app" className="text-xs font-medium cursor-pointer">
                    {locale === "th" ? "การแจ้งเตือนในระบบ (In-App Alerts)" : "In-App Notifications"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th"
                      ? "แสดงป๊อปอัปและแบดจ์แจ้งเตือนที่ปุ่มกระดิ่ง"
                      : "Show notifications badge in header"}
                  </p>
                </div>
                <Switch
                  id="in-app"
                  checked={inAppNotification}
                  onCheckedChange={(checked) => {
                    setInAppNotification(checked);
                    handleSaveNotifications(criticalEmailAlert, checked);
                  }}
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label htmlFor="meter-offline" className="text-xs font-medium cursor-pointer">
                    {locale === "th" ? "แจ้งเตือนมิเตอร์ออฟไลน์ (Offline Alert)" : "Meter Offline Alerts"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th"
                      ? "แจ้งเตือนเมื่ออุปกรณ์หยุดส่งข้อมูลเกิน 2 นาที"
                      : "Notify when device telemetry disconnects > 2m"}
                  </p>
                </div>
                <Switch
                  id="meter-offline"
                  checked={meterOfflineAlert}
                  onCheckedChange={(checked) => {
                    setMeterOfflineAlert(checked);
                    notify.info(
                      locale === "th"
                        ? checked
                          ? "เปิดการแจ้งเตือนมิเตอร์ออฟไลน์แล้ว"
                          : "ปิดการแจ้งเตือนมิเตอร์ออฟไลน์แล้ว"
                        : "Offline alert updated"
                    );
                  }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Card: Units & Measurement */}
          <Card className="panel">
            <CardHeader className="p-0 pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Zap className="size-4 text-primary" />
                <span>{locale === "th" ? "หน่วยการแสดงผล" : "Units & Measurement"}</span>
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === "th" ? "หน่วยวัดพลังงานและค่าเงินในแดชบอร์ด" : "Default power and currency units"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">
                    {locale === "th" ? "หน่วยพลังงานสะสม" : "Energy Unit"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th" ? "หน่วยแสดงผลบนกราฟและสถิติ" : "Display unit for chart and stats"}
                  </p>
                </div>
                <Select value={energyUnit} onValueChange={setEnergyUnit}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kWh" className="text-xs">kWh</SelectItem>
                    <SelectItem value="MWh" className="text-xs">MWh</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">
                    {locale === "th" ? "สกุลเงิน (Currency)" : "Currency"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th" ? "แสดงผลเป็นบาทตามมาตรฐาน (฿)" : "Currency for billing calculation"}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md bg-muted border border-border/60">
                  <Coins className="size-3.5 text-primary" />
                  <span>THB (บาท ฿)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Bank Account Add/Edit Modal */}
        <Dialog open={bankModalOpen} onOpenChange={setBankModalOpen}>
          <DialogContent className="sm:max-w-md w-full bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <CreditCard className="size-4 text-primary" />
                <span>
                  {editingBank.id
                    ? locale === "th"
                      ? "แก้ไขบัญชีธนาคาร"
                      : "Edit Bank Account"
                    : locale === "th"
                    ? "เพิ่มบัญชีธนาคารใหม่"
                    : "Add New Bank Account"}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {locale === "th"
                  ? "กรอกข้อมูลบัญชีเพื่อแสดงในใบแจ้งหนี้ให้ลูกค้าโอนชำระเงิน"
                  : "Enter bank account details to display in billing invoices"}
              </DialogDescription>
            </DialogHeader>

            <div className="py-3 space-y-3 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-medium">{locale === "th" ? "ธนาคาร *" : "Bank Name *"}</Label>
                <Select
                  value={editingBank.bankName}
                  onValueChange={(val) => setEditingBank({ ...editingBank, bankName: val })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="เลือกธนาคาร" />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_BANKS.map((b) => (
                      <SelectItem key={b} value={b} className="text-xs">
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">{locale === "th" ? "เลขที่บัญชี *" : "Account Number *"}</Label>
                <Input
                  value={editingBank.accountNumber}
                  onChange={(e) => setEditingBank({ ...editingBank, accountNumber: e.target.value })}
                  placeholder="เลขบัญชีธนาคาร"
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">{locale === "th" ? "ชื่อบัญชี *" : "Account Name *"}</Label>
                <Input
                  value={editingBank.accountName}
                  onChange={(e) => setEditingBank({ ...editingBank, accountName: e.target.value })}
                  placeholder="ชื่อเจ้าของบัญชี"
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium">{locale === "th" ? "สาขา (Branch)" : "Branch"}</Label>
                <Input
                  value={editingBank.branchName || ""}
                  onChange={(e) => setEditingBank({ ...editingBank, branchName: e.target.value })}
                  placeholder="ชื่อสาขาธนาคาร"
                  className="h-9 text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label htmlFor="bank-default" className="text-xs font-medium cursor-pointer">
                    {locale === "th" ? "ตั้งเป็นบัญชีหลัก (Default Account)" : "Set as Default Account"}
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {locale === "th" ? "บัญชีนี้จะถูกเลือกแสดงเป็นลำดับแรก" : "This account will be highlighted first"}
                  </p>
                </div>
                <Switch
                  id="bank-default"
                  checked={editingBank.isDefault}
                  onCheckedChange={(checked) => setEditingBank({ ...editingBank, isDefault: checked })}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBankModalOpen(false)}
                className="text-xs"
              >
                {locale === "th" ? "ยกเลิก" : "Cancel"}
              </Button>
              <Button
                size="sm"
                onClick={handleSaveBank}
                disabled={savingBank}
                className="text-xs bg-primary text-primary-foreground font-medium gap-1.5"
              >
                {savingBank ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                <span>{locale === "th" ? "บันทึกบัญชี" : "Save Account"}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
