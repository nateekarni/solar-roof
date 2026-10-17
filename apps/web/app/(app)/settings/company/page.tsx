"use client";

import { AddButton } from "../../../../components/ui/add-button";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  CreditCard,
  Loader2,
  Save,
  MoreHorizontal,
} from "lucide-react";
import { useLocale } from "../../../../providers/locale-provider";
import { apiClient } from "../../../../lib/api-client";
import { useAuth } from "../../../../stores/auth-store";
import { companyBrandingUpdated } from "../../../../components/brand/branding-logo";
import { CompanyProfileCard, type CompanyProfile } from "../../../../features/settings/company-profile-card";
import { AppLoading } from "../../../../components/feedback/app-loading";
import { notify } from "../../../../components/feedback/notifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../../../components/ui/card";
import { Label } from "../../../../components/ui/label";
import { Input } from "../../../../components/ui/input";
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
import { DataTable } from "../../../../components/ui/data-table";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../../components/ui/dialog";


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
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
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
  }, [locale]);

  React.useEffect(() => {
    void Promise.all([fetchCompany(), fetchBankAccounts()]);
  }, [fetchCompany, fetchBankAccounts]);

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    setSavingCompany(true);
    try {
      await apiClient.put("/v1/settings/company", company);
      setSavedCompany(company);
      setEditingCompany(false);
      if ((company.logoUrl ?? '') !== (savedCompany.logoUrl ?? '')) companyBrandingUpdated();
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
    if (!isOwner) return;
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
      await fetchBankAccounts();
    } catch (err: any) {
      notify.error(err?.message || (locale === "th" ? "ไม่สามารถบันทึกบัญชีธนาคารได้" : "Unable to save bank account"));
    } finally {
      setSavingBank(false);
    }
  };

  const handleDeleteBank = async (id?: string) => {
    if (!id || deletingBank || !isOwner) return;
    setDeletingBank(true);
    try {
      await apiClient.delete(`/v1/settings/bank-accounts/${id}`);
      setBankToDelete(null);
      notify.success(locale === "th" ? "ลบบัญชีธนาคารเรียบร้อยแล้ว" : "Bank account deleted");
      await fetchBankAccounts();
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
        <CompanyProfileCard company={company} locale={locale} editingCompany={editingCompany} canEdit={isOwner} disabled={loadingCompany || !!loadError} savingCompany={savingCompany} setCompany={setCompany} onEdit={() => setEditingCompany(true)} onCancel={() => {setCompany(savedCompany); setEditingCompany(false);}} onSave={handleSaveCompany}/>

        {/* Section 2: Bank Accounts for Payments (FlowAccount Standard) */}
        <Card id="company-bank-accounts" className="gap-0 border-border/80 shadow-xs">
          <CardHeader className="px-6 pt-4 pb-3 flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <span>{locale === "th" ? "บัญชีธนาคารสำหรับรับชำระเงิน" : "Payment Bank Accounts"}</span>
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {locale === "th"
                  ? "บัญชีที่จะแสดงในส่วนท้ายของใบวางบิลเพื่อให้ลูกค้าโอนชำระเงิน"
                  : "Bank accounts displayed in billing invoices for customer payment transfer"}
              </CardDescription>
            </div>
            {isOwner && <AddButton
              onClick={handleOpenAddBank}
              className="h-10 text-xs font-medium  gap-1"
            >
              <span>{locale === "th" ? "เพิ่มบัญชี" : "Add Account"}</span>
            </AddButton>}
          </CardHeader>
          <CardContent className="px-0">
            {loadingBanks ? (
              <AppLoading fullPage={false} message={locale === "th" ? "กำลังโหลดข้อมูลบัญชีธนาคาร…" : "Loading bank accounts…"} />
            ) : bankAccounts.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                <CreditCard className="size-8 mx-auto text-muted-foreground/40" />
                <p>{locale === "th" ? "ยังไม่มีการเพิ่มบัญชีธนาคาร" : "No bank accounts added yet"}</p>
                {isOwner && <AddButton variant="outline" onClick={handleOpenAddBank} className="">
                  {locale === "th" ? "เพิ่มบัญชีแรก" : "Add first account"}
                </AddButton>}
              </div>
            ) : (
              <DataTable<CompanyBankAccount,unknown> variant="embedded" hideSearch data={bankAccounts} getRowId={b=>b.id||b.accountNumber} columns={[
 {accessorKey:'bankName',header:locale==='th'?'ธนาคาร':'Bank',cell:({row})=><div className="flex items-center gap-2"><span className="font-semibold">{bankDisplayName(row.original.bankName)}</span>{row.original.isDefault&&<Badge variant="secondary">{locale==='th'?'บัญชีหลัก':'Default'}</Badge>}</div>},
 {accessorKey:'accountNumber',header:locale==='th'?'เลขที่บัญชี':'Account number'},
 {accessorKey:'accountName',header:locale==='th'?'ชื่อบัญชี':'Account name'},
 {accessorKey:'branchName',header:locale==='th'?'สาขา':'Branch',cell:({row})=>row.original.branchName||'—'},
 {accessorKey:'promptpayId',header:locale==='th'?'พร้อมเพย์':'PromptPay',cell:({row})=>row.original.promptpayId||'—'},
 {id:'actions',header:'',enableSorting:false,cell:({row})=>isOwner?<DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={locale==='th'?'เมนูบัญชีธนาคาร':'Bank account actions'}><MoreHorizontal/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>handleOpenEditBank(row.original)}>{locale==='th'?'แก้ไขบัญชีธนาคาร':'Edit bank account'}</DropdownMenuItem><DropdownMenuItem variant="destructive" onSelect={()=>row.original.id&&setBankToDelete(row.original.id)}>{locale==='th'?'ลบบัญชีธนาคาร':'Delete bank account'}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>:null}
 ]}/>
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
                  ? "กรอกข้อมูลบัญชีเพื่อแสดงในใบวางบิลให้ลูกค้าโอนชำระเงิน"
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
