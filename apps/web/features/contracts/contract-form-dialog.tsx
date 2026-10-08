"use client";
import {BRAND_NAME} from "../../components/brand/brand-mark";
import {useFinancialCapabilities} from '../../lib/financial-capabilities';
import {financialContractInput,nextRateStart,contractRatePayload} from './contract-financial-input';

import { AddButton } from "../../components/ui/add-button";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2, Calendar, FileText, Building2, UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { createContractSchema, type ContractFormValues } from "./contract-schema";
import { createContractIdentityAutofill, type ContractIdentityField } from "./contract-identity-autofill";
import { notify } from "../../components/feedback/notifications";
import {Table,TableHeader,TableHead,TableBody,TableRow,TableCell} from "../../components/ui/table";
import { Button } from "../../components/ui/button";
import { DatePicker } from "../../components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
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
import { useSessionUser } from "../../providers/session-user-provider";
import { loadContractSites } from "../shared/business-operation-options";

interface SiteOption {
  id: string;
  name: string;
  schoolName?: string;
}

interface RateRow {
  startDate: string;
  endDate: string;
  rate: number | "";
}

export function ContractFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const user = useSessionUser();
  const contractSchema = React.useMemo(() => createContractSchema(locale), [locale]);
  const capabilities=useFinancialCapabilities();
  const localTestMode=capabilities.financialScope==='TEST';
  const [paymentTermDays,setPaymentTermDays]=React.useState('');
  const [recipientUserId,setRecipientUserId]=React.useState('');
  const [recipientOptions,setRecipientOptions]=React.useState<Array<{id:string;email:string;displayName:string}>>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingSites, setLoadingSites] = React.useState(false);
  const [loadingOrganization,setLoadingOrganization]=React.useState(false);
  const [sites, setSites] = React.useState<SiteOption[]>([]);
  const [rateRows, setRateRows] = React.useState<RateRow[]>([
    {
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      rate: "",
    },
  ]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ContractFormValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      siteId: "",

      paymentTerms: "",
      signerName: "",
      taxId: "",
      companyName: "",
      branch: "",
      taxAddress: "",
      billingEmail: "",
      billingPhone: "",
    },
  });

  React.useEffect(() => {
    if (open) {
      setLoadingSites(true);
      loadContractSites(<T,>(path: string) => apiClient.get<T>(path))
        .then((siteList) => {
          if (Array.isArray(siteList)) {
            setSites(siteList);

          }
        })
        .catch((error: unknown) => { setSites([]); notify.error(error instanceof Error ? error.message : (locale === "th" ? "ไม่สามารถโหลดรายการไซต์งานได้" : "Unable to load sites")); })
        .finally(() => setLoadingSites(false));
    }
  }, [open, setValue, locale]);

  const localeRef=React.useRef(locale);
  localeRef.current=locale;
  const identityAutofill=React.useRef<ReturnType<typeof createContractIdentityAutofill>|null>(null);
  if(!identityAutofill.current)identityAutofill.current=createContractIdentityAutofill({
    loadDefaults:siteId=>apiClient.get(`/v1/operations/contracts/organization-defaults?siteId=${encodeURIComponent(siteId)}`),
    setField:(field,value)=>setValue(field,value),
    setLoading:setLoadingOrganization,
    onError:error=>notify.error(error instanceof Error?error.message:(localeRef.current==='th'?'โหลดข้อมูลเอกสารองค์กรไม่สำเร็จ':'Unable to load organization document defaults')),
  });
  const registerIdentity=(field:ContractIdentityField)=>register(field,{onChange:()=>identityAutofill.current!.markEdited(field)});
  const selectedSiteId=watch('siteId');
  React.useEffect(()=>identityAutofill.current!.activate({open,siteId:selectedSiteId}),[open,selectedSiteId]);

  React.useEffect(()=>{
    let active=true;setRecipientUserId('');setRecipientOptions([]);
    if(open&&selectedSiteId&&localTestMode)apiClient.get<Array<{id:string;email:string;displayName:string}>>(`/v1/operations/contracts/recipient-options?siteId=${encodeURIComponent(selectedSiteId)}`).then(rows=>{if(active)setRecipientOptions(rows);}).catch(()=>{if(active)setRecipientOptions([]);});
    return ()=>{active=false;};
  },[open,selectedSiteId,localTestMode]);
  const handleAddRateRow = () => {
    const lastRow = rateRows[rateRows.length - 1];
    const nextStart = lastRow?.endDate
      ? nextRateStart(lastRow.endDate)
      : new Date().toISOString().slice(0, 10);

    setRateRows((prev) => [
      ...prev,
      {
        startDate: nextStart,
        endDate: "",
        rate: "",
      },
    ]);
  };

  const handleRemoveRateRow = (index: number) => {
    if (rateRows.length <= 1) return;
    setRateRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRateRowChange = (index: number, field: keyof RateRow, val: any) => {
    setRateRows((prev) => {
      const copy = [...prev];
      const target = copy[index];
      if (!target) return prev;
      copy[index] = { ...target, [field]: val };
      return copy;
    });
  };

  const onSubmit = async (values: ContractFormValues) => {
    if(loadingOrganization)return;
    setLoading(true);
    try {
      const payload = {
        siteId: values.siteId,
        siteIds: [values.siteId],
        effectiveDate: values.effectiveDate,
        paymentTerms: values.paymentTerms,
        ...(localTestMode?financialContractInput(paymentTermDays,recipientUserId):(paymentTermDays?{paymentTermDays:Number(paymentTermDays)}:{})),
        signerName: values.signerName,
        taxId: values.taxId?.trim() || null,
        companyName: values.companyName?.trim() || null,
        branch: values.branch?.trim() || null,
        taxAddress: values.taxAddress?.trim() || null,
        billingEmail: values.billingEmail?.trim() || null,
        billingPhone: values.billingPhone?.trim() || null,
        ratePerKwh: Number(rateRows[0]?.rate),
        rates: contractRatePayload(rateRows),
      };

      await apiClient.post("/v1/contracts", payload);

      notify.success(
        locale === "th"
          ? "สร้างสัญญาและตารางอัตราค่าไฟสำเร็จ"
          : "Created contract and rate schedule successfully"
      );
      reset();setPaymentTermDays('');setRecipientUserId('');
      onOpenChange(false);
      router.refresh();
    } catch (err: unknown) {
      notify.error(err instanceof Error && err.message ? err.message : (locale === "th" ? "เกิดข้อผิดพลาดในการสร้างสัญญา" : "Unable to create the contract"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl sm:rounded-2xl sm:p-6 max-h-[92vh] overflow-y-auto">
        <DialogHeader className="min-w-0 pb-1">
          <div className="flex min-w-0 items-center gap-2.5 pr-6">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="block text-base font-semibold break-words">
                {locale === "th" ? "สร้างสัญญาซื้อขายไฟฟ้าและอัตราค่าไฟ (PPA)" : "Create PPA Contract & Rates"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {locale === "th"
                  ? "ระบุไซต์งาน ข้อมูลใบกำกับภาษี และกำหนดตารางอัตราค่าไฟแบบไดนามิก"
                  : "Specify solar site, tax invoice details, and dynamic tariff schedule"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="min-w-0 space-y-4 pt-2">
          {/* Section 1: Site and Signer Information */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="size-4 text-primary" />
              <span>{locale === "th" ? "ข้อมูลไซต์งานและคู่สัญญา" : "Site & Signer Details"}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                <Label htmlFor="payment-term-days" required={localTestMode}>{locale==='th'?'จำนวนวันชำระเงิน':'Payment term (calendar days)'}</Label>
                <Input id="payment-term-days" type="number" min="0" max="3650" step="1" required={localTestMode} value={paymentTermDays} onChange={event=>setPaymentTermDays(event.target.value)}/>
              </div>
              <div className="space-y-2">
                {localTestMode&&<><Label htmlFor="contract-recipient" required>{locale==='th'?'บัญชีผู้รับเอกสาร':'Document recipient account'}</Label>
                <Select value={recipientUserId} onValueChange={setRecipientUserId} disabled={!selectedSiteId}>
                  <SelectTrigger id="contract-recipient"><SelectValue placeholder={locale==='th'?'เลือกผู้รับที่ยืนยันอีเมลแล้ว':'Select verified recipient'}/></SelectTrigger>
                  <SelectContent>{recipientOptions.map(option=><SelectItem key={option.id} value={option.id}>{option.displayName} · {option.email}</SelectItem>)}</SelectContent>
                </Select>
                {!recipientOptions.length&&selectedSiteId&&<p className="text-xs text-muted-foreground">{locale==='th'?'ยังไม่มีบัญชีผู้รับที่ยืนยันอีเมลในองค์กรนี้':'No verified recipient account in this organization.'}</p>}</>}
              </div>
<div className="space-y-2 sm:col-span-2">
                <Label htmlFor="c-site" required className="text-xs font-medium">
                  {locale === "th" ? "เลือกไซต์งานติดตั้ง" : "Solar Site"}
                </Label>
                <Select
                  value={watch("siteId")}
                  onValueChange={(val: string) => setValue("siteId", val, { shouldValidate: true })}
                >
                  <SelectTrigger id="c-site" className="text-xs h-10 w-full bg-card">
                    <SelectValue placeholder={loadingSites ? (locale === "th" ? "กำลังโหลดไซต์งาน..." : "Loading sites...") : sites.length === 0 ? (locale === "th" ? "ไม่มีไซต์งานให้เลือก" : "No sites available") : (locale === "th" ? "เลือกไซต์งาน" : "Select a site")} />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name} {s.schoolName ? `(${s.schoolName})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.siteId && (
                  <p className="text-[11px] text-destructive">{errors.siteId.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="effective-date" required className="text-xs font-medium">
                  {locale === "th" ? "วันเริ่มต้นสัญญา" : "Contract Effective Date"}
                </Label>
                <DatePicker
                  id="effective-date"
                  value={watch("effectiveDate") || ""}
                  onValueChange={(val: string) => setValue("effectiveDate", val, { shouldValidate: true })}
                  required
                />
                {errors.effectiveDate && <p className="text-[11px] text-destructive">{errors.effectiveDate.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="terms" required className="text-xs font-medium">
                  {locale === "th" ? "เงื่อนไขการชำระเงิน" : "Payment Terms"}
                </Label>
                <Input
                  id="terms"
                  placeholder={locale === "th" ? "ชำระภายใน 30 วัน" : "Payment within 30 days"}
                  className="text-xs h-10 bg-card"
                  {...register("paymentTerms")}
                />
                {errors.paymentTerms && <p className="text-[11px] text-destructive">{errors.paymentTerms.message}</p>}
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="signer" required className="text-xs font-medium">
                  {locale === "th" ? "ผู้ลงนามฝ่ายผู้ให้บริการ" : "Authorized Signatory"}
                </Label>
                <Input
                  id="signer"
                  placeholder={locale === "th" ? "ชื่อผู้มีอำนาจลงนาม" : "Authorized signatory name"}
                  className="text-xs h-10 bg-card"
                  {...register("signerName")}
                />
                {errors.signerName && <p className="text-[11px] text-destructive">{errors.signerName.message}</p>}
              </div>
            </div>
          </div>

          {/* Section 2: Tax Invoice & Customer Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="size-4 text-primary" />
              <span>{locale === "th" ? "ข้อมูลออกใบกำกับภาษี / ใบเสร็จรับเงิน" : "Tax Invoice Information"}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="tax-id" className="text-xs font-medium">
                  {locale === "th" ? "เลขประจำตัวผู้เสียภาษี (13 หลัก)" : "Tax ID"}
                </Label>
                <Input
                  id="tax-id"
                  placeholder="0105558123456"
                  className="text-xs h-10 font-mono bg-card"
                  {...registerIdentity("taxId")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch" className="text-xs font-medium">
                  {locale === "th" ? "สาขา" : "Branch"}
                </Label>
                <Input
                  id="branch"
                  placeholder={locale === "th" ? "สำนักงานใหญ่ หรือ 00000" : "Head office or 00000"}
                  className="text-xs h-10 bg-card"
                  {...registerIdentity("branch")}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="company-name" className="text-xs font-medium">
                  {locale === "th" ? "ชื่อนิติบุคคล / องค์กร" : "Legal Entity / Organization Name"}
                </Label>
                <Input
                  id="company-name"
                  placeholder={locale === "th" ? "ชื่อองค์กรตามเอกสารจดทะเบียน" : "Registered organization name"}
                  className="text-xs h-10 bg-card"
                  {...registerIdentity("companyName")}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="tax-address" className="text-xs font-medium">
                  {locale === "th" ? "ที่อยู่จดทะเบียนสำหรับใบกำกับภาษี" : "Tax Registered Address"}
                </Label>
                <Input
                  id="tax-address"
                  placeholder={locale === "th" ? "ที่อยู่ตามเอกสารจดทะเบียน" : "Registered address"}
                  className="text-xs h-10 bg-card"
                  {...registerIdentity("taxAddress")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-email" className="text-xs font-medium">
                  {locale === "th" ? "อีเมลรับใบแจ้งหนี้ / ใบกำกับภาษี" : "Billing Email"}
                </Label>
                <Input
                  id="billing-email"
                  type="email"
                  placeholder="finance@example.com"
                  className="text-xs h-10 bg-card"
                  {...registerIdentity("billingEmail")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-phone" className="text-xs font-medium">
                  {locale === "th" ? "เบอร์โทรศัพท์ติดต่อการเงิน" : "Billing Phone"}
                </Label>
                <Input
                  id="billing-phone"
                  placeholder="02-123-4567"
                  className="text-xs h-10 bg-card"
                  {...registerIdentity("billingPhone")}
                />
              </div>
            </div>
          </div>

          {/* Section 3: Dynamic Rate Schedule Table */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Calendar className="size-4 text-primary" />
                <span>{locale === "th" ? "ตารางอัตราค่าไฟตามช่วงเวลา" : "Rate Schedule"}</span>
              </div>
              <AddButton
                type="button"
                variant="outline"

                onClick={handleAddRateRow}
                className="h-10 gap-1 text-xs px-2.5 bg-background cursor-pointer"
              >

                <span>{locale === "th" ? "เพิ่มช่วงเวลา" : "Add Rate Period"}</span>
              </AddButton>
            </div>

            <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-border">
              <Table className="w-full text-left text-xs">
                <TableHeader className="bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase">
                  <TableRow>
                    <TableHead className="p-2.5 pl-3">{locale === "th" ? "วันเริ่มต้น" : "Start Date"}</TableHead>
                    <TableHead className="p-2.5">{locale === "th" ? "วันสิ้นสุด (เว้นว่าง = ไม่มีกำหนด)" : "End Date (Blank = Ongoing)"}</TableHead>
                    <TableHead className="p-2.5 w-32">{locale === "th" ? "อัตรา (฿/kWh)" : "Rate (฿/kWh)"}</TableHead>
                    <TableHead className="p-2.5 w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {rateRows.map((row, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/20">
                      <TableCell className="p-2 pl-3">
                        <DatePicker
                          value={row.startDate}
                          onValueChange={(value) => handleRateRowChange(idx, "startDate", value)}
                          aria-label={locale === "th" ? "วันเริ่มต้นอัตราค่าไฟ" : "Rate start date"}
                          className="h-10 text-xs font-mono bg-card"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <DatePicker
                          value={row.endDate}
                          onValueChange={(value) => handleRateRowChange(idx, "endDate", value)}
                          aria-label={locale === "th" ? "วันสิ้นสุดอัตราค่าไฟ" : "Rate end date"}
                          placeholder={locale === "th" ? "ไม่มีกำหนด" : "Ongoing"}
                          className="h-10 text-xs font-mono bg-card"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        <Input
                          type="number"
                          step="0.01"
                          value={row.rate}
                          required
                          min="0"
                          aria-label={locale === "th" ? "อัตราค่าไฟที่ตกลง" : "Agreed tariff"}
                          onChange={(e) => handleRateRowChange(idx, "rate", e.target.value === "" ? "" : Number(e.target.value))}
                          className="h-10 text-xs font-mono font-bold text-primary bg-card"
                        />
                      </TableCell>
                      <TableCell className="p-2 pr-3 text-center">
                        {rateRows.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            type="button"
                            onClick={() => handleRemoveRateRow(idx)}
                            className="h-auto gap-0 px-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                            aria-label={locale === "th" ? "ลบช่วงเวลานี้" : "Remove this rate period"}
                            title={locale === "th" ? "ลบช่วงเวลานี้" : "Remove this rate period"}
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
            <p className="text-[11px] text-muted-foreground">
              {locale === "th"
                ? "* วันสิ้นสุดรวมวันนั้นด้วย หากเว้นว่างจะสิ้นสุดวันก่อนอัตราถัดไป หรือมีผลต่อเนื่องหากเป็นอัตราสุดท้าย"
                : "* End date includes that day. A blank end stops the day before the next rate, or continues for the final rate."}
            </p>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs h-10 px-4"
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={loading || loadingOrganization} className="text-xs h-10 px-5 font-semibold">
              {loading ? t("common.saving") : locale === "th" ? "บันทึกสัญญาและอัตราค่าไฟ" : "Save Contract"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}





