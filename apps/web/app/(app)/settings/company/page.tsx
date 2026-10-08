"use client";

import { AddButton } from "../../../../components/ui/add-button";

import * as React from "react";
import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  CreditCard,
  Edit2,
  Loader2,
  Save,
  Sliders,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { useLocale } from "../../../../providers/locale-provider";
import { apiClient } from "../../../../lib/api-client";
import { AppLoading } from "../../../../components/feedback/app-loading";
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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../../../components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../../../components/ui/table";
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
  signatoryName?: string;
  signatoryTitle?: string;
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

const DEFAULT_COMPANY: CompanyProfile = { companyName: '', taxId: '', branch: '', address: '', phone: '', email: '' };

const COMMON_BANKS = [
  "ธนาคารกสิกรไทย (KBANK)",
  "ธนาคารไทยพาณิชย์ (SCB)",
  "ธนาคารกรุงเทพ (BBL)",
  "ธนาคารกรุงไทย (KTB)",
  "ธนาคารทหารไทยธนชาต (TTB)",
  "ธนาคารกรุงศรีอยุธยา (BAY)",
];

export default function CompanyBankingPage() {
  const locale = useLocale();
  const bankDisplayName = (name: string) => {
    const thaiName = name.replace(/ \(.*\)$/, "");
    const index = COMMON_BANKS.findIndex(bank => bank.replace(/ \(.*\)$/, "") === thaiName);
    if (index < 0) return locale === "th" ? thaiName : name;
    return locale === "th" ? name.replace(/ \(.*\)$/, "") : ["Kasikorn Bank", "Siam Commercial Bank", "Bangkok Bank", "Krung Thai Bank", "TMBThanachart Bank", "Bank of Ayudhya"][index];
  };
  // Company Profile states
  const [company, setCompany] = React.useState<CompanyProfile>(DEFAULT_COMPANY);
  const [editingCompany, setEditingCompany] = React.useState(false);
  const [savedCompany, setSavedCompany] = React.useState<CompanyProfile>(DEFAULT_COMPANY);
  const [loadingCompany, setLoadingCompany] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [savingCompany, setSavingCompany] = React.useState(false);

  // Bank Accounts states
  const [bankAccounts, setBankAccounts] = React.useState<CompanyBankAccount[]>([]);
  const [loadingBanks, setLoadingBanks] = React.useState(false);
  const [bankModalOpen, setBankModalOpen] = React.useState(false);
  const [bankToDelete,setBankToDelete] = React.useState<string|null>(null);
  const [deletingBank,setDeletingBank] = React.useState(false);
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
      if (res && res.companyName) {
        setCompany(res);
        setSavedCompany(res);
      }
    } catch {
      setLoadError(locale === "th" ? "ไม่สามารถโหลดข้อมูลบริษัทได้" : "Unable to load company profile");
    } finally {
      setLoadingCompany(false);
    }
  }, [locale]);

  const fetchBankAccounts = React.useCallback(async () => {
    setLoadingBanks(true);
    try {
      const res = await apiClient.get<CompanyBankAccount[]>("/v1/settings/bank-accounts");
      if (Array.isArray(res)) {
        setBankAccounts(res);
      }
    } catch {
      setLoadError(locale === "th" ? "ไม่สามารถโหลดบัญชีธนาคารได้" : "Unable to load bank accounts");
    } finally {
      setLoadingBanks(false);
    }
  }, []);

  React.useEffect(() => {
    fetchCompany();
    fetchBankAccounts();
  }, [fetchCompany, fetchBankAccounts]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCompany(true);
    try {
      await apiClient.put("/v1/settings/company", company);
      setSavedCompany(company);
      setEditingCompany(false);
      notify.success(locale === "th" ? "บันทึกข้อมูลบริษัทเรียบร้อยแล้ว" : "Company profile updated");
    } catch (err: any) {
      notify.error(err?.message || (locale === "th" ? "ไม่สามารถบันทึกข้อมูลบริษัทได้" : "Unable to save company profile"));
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
      notify.error(err?.message || (locale === "th" ? "ไม่สามารถบันทึกบัญชีธนาคารได้" : "Unable to save bank account"));
    } finally {
      setSavingBank(false);
    }
  };

  const handleDeleteBank = async (id?: string) => {
    if (!id || deletingBank) return;
    setDeletingBank(true);
    try {
      await apiClient.delete(`/v1/settings/bank-accounts/${id}`);
      setBankToDelete(null);
      notify.success(locale === "th" ? "ลบบัญชีธนาคารเรียบร้อยแล้ว" : "Bank account deleted");
      fetchBankAccounts();
    } catch (err: any) {
      notify.error(err?.message || (locale === "th" ? "ไม่สามารถลบบัญชีธนาคารได้" : "Unable to delete bank account"));
    } finally { setDeletingBank(false); }
  };

  if (loadingCompany) return <main className="content"><AppLoading message={locale === "th" ? "กำลังโหลดข้อมูลบริษัท…" : "Loading company profile…"} /></main>;

  return (
    <main className="content">
      <div className="ops-content w-full space-y-6">
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
            <span>{locale === "th" ? "ข้อมูลบริษัทและบัญชีธนาคาร" : "Company and Bank Accounts"}</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {locale === "th"
              ? "จัดการข้อมูลบริษัทและบัญชีธนาคารสำหรับรับชำระเงิน"
              : "Manage company billing profile and payment bank accounts"}
          </p>
        </div>

        {loadError && <p role="alert">{loadError}</p>}
        {/* Section 1: Company Profile (FlowAccount Standard) */}
        <Card className="panel border-border/80 shadow-xs">
          <CardHeader className="p-0 pb-2 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <span>{locale === "th" ? "ข้อมูลบริษัท / นิติบุคคล" : "Company Billing Profile"}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {locale === "th"
                  ? "ข้อมูลที่จะปรากฏในหัวเอกสารใบแจ้งหนี้ ใบเสร็จรับเงิน/ใบกำกับภาษี และสัญญา PPA ตามมาตรฐาน FlowAccount"
                  : "Header information shown on invoices, tax receipts, and PPA contracts (FlowAccount standard)"}
              </CardDescription>
            </div>
            {!editingCompany && <Button type="button" variant="outline" size="sm" disabled={loadingCompany || !!loadError} onClick={() => setEditingCompany(true)} className="h-10 shrink-0 gap-1.5 text-xs"><Edit2 className="size-3.5" /><span>{locale === "th" ? "แก้ไข" : "Edit"}</span></Button>}
          </CardHeader>
          <CardContent className="p-0 pt-4">
            {!editingCompany ? <div className="space-y-4"><dl className="grid grid-cols-1 gap-4 md:grid-cols-2">{([
                ['companyName', 'ชื่อบริษัท / นิติบุคคล', 'Company name'], ['taxId', 'เลขประจำตัวผู้เสียภาษี', 'Tax ID'], ['branch', 'สาขา', 'Branch'], ['phone', 'เบอร์โทรศัพท์', 'Phone'], ['email', 'อีเมลสำหรับการเงิน', 'Billing email'], ['address', 'ที่อยู่จดทะเบียนภาษี', 'Tax address'], ['signatoryName', 'ชื่อผู้ลงนามฝ่ายผู้ให้บริการ', 'Default provider signatory'], ['signatoryTitle', 'ตำแหน่งผู้ลงนาม', 'Default signatory title']
              ] as const).map(([key, th, en]) => <div key={key} className={key === "address" ? "space-y-1 md:col-span-2" : "space-y-1"}><dt className="text-sm text-muted-foreground">{locale === 'th' ? th : en}</dt><dd className="text-sm font-medium whitespace-pre-wrap break-words">{company[key] || '—'}</dd></div>)}</dl></div> : <form onSubmit={handleSaveCompany} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {(['signatoryName','signatoryTitle'] as const).map(key=><div className="space-y-2" key={key}>
                  <Label htmlFor={`company-${key}`}>{key==='signatoryName'?(locale==='th'?'ชื่อผู้ลงนามฝ่ายผู้ให้บริการ':'Default provider signatory'):(locale==='th'?'ตำแหน่งผู้ลงนาม':'Default signatory title')}</Label>
                  <Input id={`company-${key}`} value={company[key]??''} onChange={event=>setCompany({...company,[key]:event.target.value})}/>
                </div>)}
                <div className="space-y-2">
                  <Label htmlFor="company-companyName" className="text-xs font-medium text-foreground">
                    {locale === "th" ? "ชื่อบริษัท / นิติบุคคล *" : "Company Name *"}
                  </Label>
                  <Input id="company-companyName"
                    value={company.companyName}
                    onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
                    required
                    className="h-10 text-xs"
                    placeholder={locale === "th" ? "เช่น บริษัท โซลาร์ รูฟท็อป เอนเนอร์ยี่ จำกัด" : "e.g. Solar Rooftop Energy Co., Ltd."}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-taxId" className="text-xs font-medium text-foreground">
                    {locale === "th" ? "เลขประจำตัวผู้เสียภาษี 13 หลัก *" : "Tax ID (13 Digits) *"}
                  </Label>
                  <Input id="company-taxId"
                    value={company.taxId}
                    onChange={(e) => setCompany({ ...company, taxId: e.target.value })}
                    required
                    maxLength={13}
                    className="h-10 text-xs font-mono"
                    placeholder="0105562089412"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-branch" className="text-xs font-medium text-foreground">
                    {locale === "th" ? "สาขา" : "Branch"}
                  </Label>
                  <Input id="company-branch"
                    value={company.branch}
                    onChange={(e) => setCompany({ ...company, branch: e.target.value })}
                    className="h-10 text-xs"
                    placeholder={locale === "th" ? "สำนักงานใหญ่ (00000)" : "Head office (00000)"}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-phone" className="text-xs font-medium text-foreground">
                    {locale === "th" ? "เบอร์โทรศัพท์ติดต่อ" : "Phone Number"}
                  </Label>
                  <Input id="company-phone"
                    value={company.phone}
                    onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                    className="h-10 text-xs"
                    placeholder="02-555-9000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company-email" className="text-xs font-medium text-foreground">
                    {locale === "th" ? "อีเมลสำหรับการเงินและใบแจ้งหนี้ *" : "Billing Email *"}
                  </Label>
                  <Input id="company-email"
                    type="email"
                    value={company.email}
                    onChange={(e) => setCompany({ ...company, email: e.target.value })}
                    required
                    className="h-10 text-xs"
                    placeholder="billing@solarrooftop.co.th"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="company-address" className="text-xs font-medium text-foreground">
                    {locale === "th" ? "ที่อยู่จดทะเบียนภาษี *" : "Tax Address *"}
                  </Label>
                  <Textarea id="company-address"
                    value={company.address}
                    onChange={(e) => setCompany({ ...company, address: e.target.value })}
                    required
                    className="text-xs min-h-[60px]"
                    placeholder={locale === "th" ? "88 อาคารโซลาร์ทาวเวอร์ ชั้น 18 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110" : "88 Solar Tower, 18th floor, Sukhumvit Road, Bangkok 10110"}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" disabled={savingCompany} onClick={() => { setCompany(savedCompany); setEditingCompany(false); }}>{locale === "th" ? "ยกเลิก" : "Cancel"}</Button>
                <Button
                  type="submit"
                  disabled={savingCompany}
                  className="h-10 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
                >
                  {savingCompany ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  <span>{locale === "th" ? "บันทึกข้อมูลบริษัท" : "Save Company Profile"}</span>
                </Button>
              </div>
            </form>}
          </CardContent>
        </Card>

        {/* Section 2: Bank Accounts for Payments (FlowAccount Standard) */}
        <Card className="gap-0 border-border/80 shadow-xs">
          <CardHeader className="px-6 pt-4 pb-3 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <span>{locale === "th" ? "บัญชีธนาคารสำหรับรับชำระเงิน" : "Payment Bank Accounts"}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {locale === "th"
                  ? "บัญชีที่จะแสดงในส่วนท้ายของใบแจ้งหนี้เพื่อให้ลูกค้าโอนชำระเงิน"
                  : "Bank accounts displayed in billing invoices for customer payment transfer"}
              </CardDescription>
            </div>
            <AddButton

              onClick={handleOpenAddBank}
              className="h-10 text-xs font-medium  gap-1"
            >

              <span>{locale === "th" ? "เพิ่มบัญชี" : "Add Account"}</span>
            </AddButton>
          </CardHeader>
          <CardContent className="px-0 [&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6">
            {loadingBanks ? (
              <AppLoading fullPage={false} message={locale === "th" ? "กำลังโหลดข้อมูลบัญชีธนาคาร…" : "Loading bank accounts…"} />
            ) : bankAccounts.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                <CreditCard className="size-8 mx-auto text-muted-foreground/40" />
                <p>{locale === "th" ? "ยังไม่มีการเพิ่มบัญชีธนาคาร" : "No bank accounts added yet"}</p>
                <AddButton  variant="outline" onClick={handleOpenAddBank} className="">
                  {locale === "th" ? "เพิ่มบัญชีแรก" : "Add first account"}
                </AddButton>
              </div>
            ) : (
              <Table className="text-xs">
                <TableHeader className="[&_tr]:border-0"><TableRow className="border-0 bg-muted/50 hover:bg-muted/50">
                  {[locale === "th" ? "ธนาคาร" : "Bank", locale === "th" ? "เลขที่บัญชี" : "Account number", locale === "th" ? "ชื่อบัญชี" : "Account name", locale === "th" ? "สาขา" : "Branch", locale === "th" ? "พร้อมเพย์" : "PromptPay"].map(label => <TableHead key={label} className="text-xs">{label}</TableHead>)}<TableHead style={{width:64,minWidth:64,maxWidth:64}} />
                </TableRow></TableHeader>
                <TableBody className="[&_tr]:border-y [&_tr]:border-border [&_tr:last-child]:border-t [&_tr:last-child]:border-b-0">{bankAccounts.map(b => <TableRow key={b.id || b.accountNumber}>
                  <TableCell><div className="flex items-center gap-1.5"><span className="font-semibold">{bankDisplayName(b.bankName)}</span>{b.isDefault && <Badge className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border border-primary/20">{locale === "th" ? "บัญชีหลัก" : "Default"}</Badge>}</div></TableCell>
                  <TableCell className="font-mono">{b.accountNumber}</TableCell><TableCell>{b.accountName}</TableCell><TableCell>{b.branchName || "—"}</TableCell><TableCell>{b.promptpayId || "—"}</TableCell>
                  <TableCell style={{width:64,minWidth:64,maxWidth:64}}><div className="flex justify-end"><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="size-10" aria-label={locale === "th" ? "เมนูบัญชีธนาคาร" : "Bank account actions"}><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>handleOpenEditBank(b)}>{locale === "th" ? "แก้ไขบัญชีธนาคาร" : "Edit bank account"}</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={()=>b.id && setBankToDelete(b.id)}>{locale === "th" ? "ลบบัญชีธนาคาร" : "Delete bank account"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={!!bankToDelete} onOpenChange={open=>{if(!open && !deletingBank)setBankToDelete(null);}}><DialogContent showCloseButton={!deletingBank}><DialogHeader><DialogTitle>{locale === "th" ? "ลบบัญชีธนาคาร" : "Delete bank account"}</DialogTitle><DialogDescription>{locale === "th" ? "ยืนยันการลบบัญชีธนาคารนี้? บัญชีนี้จะไม่แสดงเป็นช่องทางรับชำระเงินอีก" : "Delete this bank account? It will no longer be available as a payment account."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={deletingBank} onClick={()=>setBankToDelete(null)}>{locale === "th" ? "ยกเลิก" : "Cancel"}</Button><Button variant="destructive" disabled={deletingBank} onClick={()=>void handleDeleteBank(bankToDelete ?? undefined)}>{deletingBank ? (locale === "th" ? "กำลังลบ…" : "Deleting…") : (locale === "th" ? "ลบบัญชีธนาคาร" : "Delete bank account")}</Button></DialogFooter></DialogContent></Dialog>
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
              <div className="space-y-2">
                <Label className="text-xs font-medium">{locale === "th" ? "ธนาคาร *" : "Bank Name *"}</Label>
                <Select
                  value={editingBank.bankName}
                  onValueChange={(val) => setEditingBank({ ...editingBank, bankName: val })}
                >
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder={locale === "th" ? "เลือกธนาคาร" : "Select bank"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(editingBank.bankName && !COMMON_BANKS.some(bank=>bank.replace(/ \(.*\)$/, "") === editingBank.bankName.replace(/ \(.*\)$/, "")) ? [editingBank.bankName,...COMMON_BANKS] : COMMON_BANKS.map(bank=>bank.replace(/ \(.*\)$/, "") === editingBank.bankName.replace(/ \(.*\)$/, "") ? editingBank.bankName : bank)).map((b) => (
                      <SelectItem key={b} value={b} className="text-xs">
                        {bankDisplayName(b)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">{locale === "th" ? "เลขที่บัญชี *" : "Account Number *"}</Label>
                <Input
                  value={editingBank.accountNumber}
                  onChange={(e) => setEditingBank({ ...editingBank, accountNumber: e.target.value })}
                  placeholder={locale === "th" ? "เช่น 045-8-91234-5" : "e.g. 045-8-91234-5"}
                  className="h-10 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">{locale === "th" ? "ชื่อบัญชี *" : "Account Name *"}</Label>
                <Input
                  value={editingBank.accountName}
                  onChange={(e) => setEditingBank({ ...editingBank, accountName: e.target.value })}
                  placeholder={locale === "th" ? "เช่น บจก. โซลาร์ รูฟท็อป เอนเนอร์ยี่" : "e.g. Solar Rooftop Energy Co., Ltd."}
                  className="h-10 text-xs"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">{locale === "th" ? "สาขา" : "Branch"}</Label>
                <Input
                  value={editingBank.branchName || ""}
                  onChange={(e) => setEditingBank({ ...editingBank, branchName: e.target.value })}
                  placeholder={locale === "th" ? "เช่น สาขาสุขุมวิท" : "e.g. Sukhumvit branch"}
                  className="h-10 text-xs"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                <div className="space-y-0.5">
                  <Label htmlFor="bank-default" className="text-xs font-medium cursor-pointer">
                    {locale === "th" ? "ตั้งเป็นบัญชีหลัก" : "Set as Default Account"}
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

            <DialogFooter className="gap-2 sm:gap-2">
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
