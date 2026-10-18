'use client';
import * as React from 'react';
import type {IssuanceApprovalBatch,IssuanceApprovalResult,IssuancePreviewResponse,OperationRow} from '@solar/api-contracts';
import {ChevronDown, Download, Eye, EyeOff, FileCheck} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '../../components/ui/dialog';
import {Table,TableHeader,TableBody,TableRow,TableHead,TableCell} from '../../components/ui/table';
import {Checkbox} from '../../components/ui/checkbox';
import {cn} from '../../lib/utils';
import {formatAppDate} from '../../lib/date-format';
import {apiClient} from '../../lib/api-client';
import {notify} from '../../components/feedback/notifications';
import {eligibleBillingRows} from './billing-selection';
import {BillingIssuanceApprover,BillingIssuanceBill,BillingIssuanceReview,issuanceBillFromRow,type IssuanceApprover} from './billing-issuance-review';

const formatMoney = (val: unknown, locale: 'th' | 'en' = 'th') => {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  return Number.isFinite(num)
    ? new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num)
    : String(val);
};

export function exportSelectedRowsAsCsv(rows: readonly OperationRow[], locale: 'th' | 'en' = 'th') {
  if (!rows || rows.length === 0) return;
  const th = locale === 'th';
  const headers = th
    ? ['รอบบิล', 'ลูกค้า', 'สถานที่', 'พลังงาน (kWh)', 'อัตราค่าไฟ (บาท/kWh)', 'ยอดเงินรวม (บาท)', 'สถานะ']
    : ['Billing Period', 'Customer', 'Site', 'Energy (kWh)', 'Rate (THB/kWh)', 'Total Amount (THB)', 'Status'];

  const escapeCsv = (val: unknown) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = rows.map(row => {
    const period = row.period ?? row.billingPeriod ?? '';
    const customer = row.customerName ?? row.customer ?? '';
    const site = row.siteName ?? row.site ?? '';
    const energy = row.consumedKwh ?? row.energy ?? '';
    const rate = row.rate !== undefined && row.rate !== null && typeof row.rate === 'number'
      ? row.rate.toFixed(2)
      : (row.rate ?? '');
    const amount = row.amount !== undefined && row.amount !== null && typeof row.amount === 'number'
      ? row.amount.toFixed(2)
      : (row.amount ?? '');
    const status = row.billingStatusView ?? row.status ?? '';

    return [
      escapeCsv(period),
      escapeCsv(customer),
      escapeCsv(site),
      escapeCsv(energy),
      escapeCsv(rate),
      escapeCsv(amount),
      escapeCsv(status),
    ].join(',');
  });

  const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...csvRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().slice(0, 10);
  a.download = `billing-selected-${timestamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type ApprovalMode='single'|'bulk';
type ApprovalPost=(path:string,body:unknown)=>Promise<unknown>;

export async function submitBillingApproval(rows:readonly OperationRow[],mode:ApprovalMode,password?:string,post:ApprovalPost=apiClient.post):Promise<IssuanceApprovalResult[]>{
 if(!password||!password.trim())throw new Error('Password required for issuance');
 if(rows.length===0||rows.length>100||eligibleBillingRows(rows).length!==rows.length||(mode==='single'&&rows.length!==1))throw new Error('Select 1 to 100 pending bills');
 if(rows.some(row=>typeof row.reviewToken!=='string'||! /^[0-9a-f]{64}$/.test(row.reviewToken)))throw new Error('Review each bill before approval');
 if(mode==='single')return [await post(`/v1/billing-cycles/${encodeURIComponent(rows[0]!.id)}/approve-issuance`,{reviewToken:rows[0]!.reviewToken,password}) as IssuanceApprovalResult];
 return (await post('/v1/billing-cycles/approve-issuance',{billingCycleIds:[...new Set(rows.map(row=>row.id))],reviewTokens:Object.fromEntries(rows.map(row=>[row.id,row.reviewToken])),password}) as IssuanceApprovalBatch).results;
}

const englishMessages:Record<string,string>={
 'ข้อมูลตรวจอนุมัติเปลี่ยนแล้ว กรุณาเปิดตรวจสอบใหม่ก่อนอนุมัติ':'Review facts changed. Open the review again before approval.',
 'ออกใบวางบิลแล้ว':'Billing statement issued',
 'ออกใบวางบิลแล้วก่อนหน้านี้':'Already issued',
 'ไม่สามารถออกเอกสารได้':'Unable to issue this document',
 'กรุณากำหนดตำแหน่งผู้อนุมัติในหน้าพนักงานและสิทธิ์':'Ask an administrator to assign the approver’s company position in Staff and permissions.',
 'กรุณาเตรียมใบวางบิลให้พร้อมตรวจอนุมัติก่อนออกเอกสาร':'Prepare the billing statement for approval before issuance.',
 'กรุณาคำนวณใบวางบิลใหม่ตามการตั้งค่าปัจจุบันก่อนอนุมัติ':'Recalculate the billing statement with the current settings before approval.',
 'กรุณาให้เจ้าของยืนยันความพร้อมด้านบัญชีก่อนอนุมัติออกเอกสาร':'Ask the owner to confirm accounting readiness before issuance.',
 'กรุณาตรวจสอบการตั้งค่าการออกเอกสารและความพร้อมด้านบัญชี':'Check document issuance settings and accounting readiness.',
};

export function BillingApprovalResults({results,locale}:{results:readonly IssuanceApprovalResult[];locale:'th'|'en'}){
 const th=locale==='th',issued=results.filter(row=>row.status!=='failed').length,failed=results.length-issued;
 return <section aria-label={th?'ผลการอนุมัติออกเอกสาร':'Issuance approval results'} className="space-y-3 rounded-xl border bg-card p-4">
  <div role="status"><h3 className="font-medium">{th?`ออกเอกสารสำเร็จ ${issued} รายการ`:`${issued} ${issued===1?'document':'documents'} issued`}</h3><p>{th?`ยังรออนุมัติ ${failed} รายการ`:`${failed} still awaiting approval`}</p></div>
  <ul className="space-y-3">{results.map((row,index)=><li key={index} className="space-y-1 border-t pt-3 text-sm">
   <p className="font-medium">{row.label.period} · {row.label.customer==='รายการที่ไม่สามารถเข้าถึงได้'&&!th?'Unavailable record':row.label.customer} · {row.label.site}</p>
   <p>{row.status==='failed'?(th?'ยังรออนุมัติ':'Still awaiting approval'):row.status==='already_issued'?(th?'ออกเอกสารแล้วก่อนหน้านี้':'Already issued'):(th?'ออกเอกสารแล้ว':'Issued')}{row.documentNumber?` · ${row.documentNumber}`:''}</p>
   <p>{th?row.message:(englishMessages[row.message]??'Unable to issue this document')}</p>
  </li>)}</ul>
 </section>;
}

export function BillingApprovalConfirmation({
  rows,
  approver,
  locale,
  busy,
  onApprove,
  onCancel,
  disabled = false,
  password,
  onPasswordChange,
  passwordError,
}: {
  rows: readonly OperationRow[];
  approver: IssuanceApprover;
  locale: 'th' | 'en';
  busy: boolean;
  onApprove: (selectedRows: readonly OperationRow[]) => void;
  onCancel?: () => void;
  disabled?: boolean;
  password?: string;
  onPasswordChange?: (value: string) => void;
  passwordError?: string;
}) {
  const th = locale === 'th';
  const [showPassword, setShowPassword] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(
    () => (rows.length === 1 ? new Set(rows.map((r) => r.id)) : new Set())
  );

  React.useEffect(() => {
    setSelectedIds(new Set(rows.map((r) => r.id)));
    if (rows.length === 1) {
      setExpandedIds(new Set(rows.map((r) => r.id)));
    }
  }, [rows]);

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const someSelected = selectedRows.length > 0 && selectedRows.length < rows.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Compact Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table className="w-full text-xs">
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40 h-9">
              <TableHead className="w-10 px-3 text-center">
                <Checkbox
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleSelectAll}
                  aria-label={th ? 'เลือกทั้งหมด' : 'Select all'}
                  disabled={disabled || busy}
                />
              </TableHead>
              <TableHead>{th ? 'ไซต์งาน' : 'Site'}</TableHead>
              <TableHead className="text-right">{th ? 'จำนวนเงิน' : 'Amount'}</TableHead>
              <TableHead className="w-10 px-2 text-center">
                <span className="sr-only">{th ? 'รายละเอียด' : 'Details'}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const isChecked = selectedIds.has(row.id);
              const isExpanded = expandedIds.has(row.id);
              const bill = issuanceBillFromRow(row);
              const siteName = String(bill.siteName ?? row.siteName ?? row.site ?? '—');
              const siteCode = String(row.siteCode ?? '');
              return (
                <React.Fragment key={row.id}>
                  <TableRow className={cn('transition-colors h-11', !isChecked && 'opacity-50 bg-muted/20')}>
                    <TableCell className="w-10 px-3 py-2 text-center">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleSelect(row.id)}
                        aria-label={`${th ? 'เลือก ' : 'Select '}${siteName}`}
                        disabled={disabled || busy}
                      />
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="font-semibold text-xs text-foreground">
                        {siteName}{' '}
                        {siteCode && siteCode !== '—' && !siteName.includes(siteCode) ? (
                          <span className="text-muted-foreground font-normal">({siteCode})</span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate max-w-xs">
                        {String(row.customerName ?? row.customer ?? '')}
                        {row.period || row.billingPeriod ? ` · ${row.period ?? row.billingPeriod}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-2 font-bold text-xs whitespace-nowrap">
                      ฿{formatMoney(bill.amount ?? row.amount, locale)}
                    </TableCell>
                    <TableCell className="w-10 px-2 py-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground cursor-pointer"
                        onClick={() => toggleExpand(row.id)}
                        aria-label={`${
                          isExpanded ? (th ? 'ย่อรายละเอียด' : 'Collapse') : (th ? 'ดูรายละเอียด' : 'Expand')
                        } ${siteName}`}
                      >
                        <ChevronDown
                          className={cn('size-4 transition-transform duration-200', isExpanded && 'rotate-180')}
                        />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="bg-muted/30 border-t border-border/50 hover:bg-muted/30">
                      <TableCell colSpan={4} className="p-3">
                        <div className="rounded-lg bg-background/80 border p-2.5 text-xs space-y-2">
                          {bill.replacement && (
                            <p className="text-amber-600 dark:text-amber-400 font-medium text-[11px]">
                              {th
                                ? 'ฉบับแก้ไขรออนุมัติ ฉบับเดิมยังมีผลจนกว่าจะอนุมัติสำเร็จ'
                                : 'Replacement awaiting approval. The original remains valid until approval succeeds.'}
                            </p>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{th ? 'รอบบิล' : 'Period'}</span>
                              <span className="font-medium">{String(row.period ?? row.billingPeriod ?? '—')}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{th ? 'พลังงาน' : 'Energy'}</span>
                              <span className="font-medium">
                                {bill.consumedKwh ?? row.consumedKwh ?? row.energy
                                  ? `${bill.consumedKwh ?? row.consumedKwh ?? row.energy} kWh`
                                  : '—'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{th ? 'อัตราค่าไฟ' : 'Tariff rate'}</span>
                              <span className="font-medium">
                                {bill.rate !== undefined && bill.rate !== null && bill.rate !== '' && Number.isFinite(Number(bill.rate))
                                  ? `฿${Number(bill.rate).toFixed(4)}/kWh`
                                  : (row.rate && Number.isFinite(Number(row.rate)) ? `฿${Number(row.rate).toFixed(4)}/kWh` : '—')}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{th ? 'ครบกำหนด' : 'Due date'}</span>
                              <span className="font-medium">
                                {typeof bill.dueDate === 'string' && bill.dueDate
                                  ? formatAppDate(bill.dueDate, locale)
                                  : '—'}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t">
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{th ? 'ยอดก่อนภาษี' : 'Subtotal'}</span>
                              <span className="font-medium">฿{formatMoney(bill.subtotal, locale)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{th ? 'ภาษี' : 'Tax'}</span>
                              <span className="font-medium">฿{formatMoney(bill.tax, locale)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground block text-[11px]">{th ? 'ยอดรวม' : 'Total'}</span>
                              <span className="font-bold text-foreground">฿{formatMoney(bill.amount, locale)}</span>
                            </div>
                          </div>
                          {!!bill.recipients?.length && (
                            <div className="pt-1 border-t text-[11px] text-muted-foreground">
                              <span>{th ? 'ผู้รับเอกสาร: ' : 'Recipients: '}</span>
                              <span>{bill.recipients.map((r) => `${r.name} (${r.email})`).join(', ')}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Approver Fact Display Card */}
      <BillingIssuanceApprover approver={approver} locale={locale} />

      {/* Password Verification - clean without outer border/padding card */}
      <div className="space-y-1.5 pt-1">
        <label htmlFor="bulk-issuance-password" className="text-xs font-medium text-foreground block">
          {th ? 'รหัสผ่านเพื่อยืนยันการลงนามและออกเอกสาร' : 'Password to confirm signing and issuance'}
        </label>
        <div className="relative">
          <input
            id="bulk-issuance-password"
            type={showPassword ? 'text' : 'password'}
            value={password ?? ''}
            onChange={(e) => onPasswordChange?.(e.target.value)}
            placeholder={th ? 'กรอกรหัสผ่านของคุณ' : 'Enter your password'}
            disabled={busy || disabled}
            className="flex h-9 w-full rounded-md border border-input bg-transparent pl-3 pr-10 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            autoComplete="current-password"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 size-9 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? (th ? 'ซ่อนรหัสผ่าน' : 'Hide password') : (th ? 'แสดงรหัสผ่าน' : 'Show password')}
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {th
            ? 'การระบุรหัสผ่านถือเป็นการยืนยันความถูกต้องและยินยอมให้นำชื่อ ตำแหน่ง และลายเซ็นไปประทับลงในเอกสารฉบับจริงเพื่อจัดส่งให้ลูกค้า'
            : 'Entering your password confirms document accuracy and authorizes affixing your name, position, and signature to the official statement sent to the customer.'}
        </p>
        {passwordError && <p role="alert" className="text-xs font-medium text-destructive">{passwordError}</p>}
      </div>

      {/* Dialog Footer */}
      <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            {th ? 'ยกเลิก' : 'Cancel'}
          </Button>
        )}
        <Button
          disabled={
            disabled ||
            busy ||
            !approver.position?.trim() ||
            selectedRows.length === 0 ||
            selectedRows.length > 100 ||
            !(password ?? '').trim()
          }
          onClick={() => onApprove(selectedRows)}
        >
          {busy
            ? th
              ? 'กำลังออกเอกสาร…'
              : 'Issuing…'
            : th
            ? `อนุมัติเอกสาร (${selectedRows.length})`
            : `Approve (${selectedRows.length})`}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function BillingBulkApproval({rows,approver,locale,canApprove,onCompleted,mode='bulk',open:controlledOpen,onOpenChange,onClearSelection}:{rows:readonly OperationRow[];approver:IssuanceApprover;locale:'th'|'en';canApprove:boolean;onCompleted:()=>void;mode?:ApprovalMode;open?:boolean;onOpenChange?:(open:boolean)=>void;onClearSelection?:()=>void}){
 const th=locale==='th';
 const [localOpen,setLocalOpen]=React.useState(false),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
 const [password,setPassword]=React.useState(''),[passwordError,setPasswordError]=React.useState('');
 const [results,setResults]=React.useState<IssuanceApprovalResult[]>([]);
 const [previews,setPreviews]=React.useState<IssuancePreviewResponse[]>([]),[previewLoading,setPreviewLoading]=React.useState(false);
 const submitting=React.useRef(false);
 const open=controlledOpen??localOpen;
 const setOpen=(value:boolean)=>{if(submitting.current)return;setLocalOpen(value);onOpenChange?.(value);};
 const pendingRows=mode==='single'?(eligibleBillingRows(rows).length>0?rows:[]):eligibleBillingRows(rows);
 const eligible=pendingRows.length>0&&pendingRows.length<=100;
 const reviewIds=pendingRows.map(row=>row.id).join(',');
 React.useEffect(()=>{
  setPreviews([]);
  if(!open||!canApprove||!reviewIds)return;
  let active=true;setPreviewLoading(true);setError('');setPassword('');setPasswordError('');
  Promise.all(reviewIds.split(',').map(id=>apiClient.get<IssuancePreviewResponse>(`/v1/billing-cycles/${encodeURIComponent(id)}/issuance-preview`,{cache:'no-store'})))
   .then(values=>{if(active)setPreviews(values);})
   .catch(()=>{if(active)setError(th?'ไม่สามารถโหลดข้อมูลตรวจอนุมัติ กรุณาปิดและเปิดตรวจสอบใหม่':'Unable to load approval facts. Close and reopen the review.');})
   .finally(()=>{if(active)setPreviewLoading(false);});
  return()=>{active=false;};
 },[open,canApprove,reviewIds,approver.displayName,approver.position,approver.hasSignature,th]);
 const reviewed=previews.length===pendingRows.length&&previews.length>0;
 const reviewRows=reviewed?pendingRows.flatMap((row,index)=>{const preview=previews[index]!;return 'failure' in preview?[]:[{...row,...preview,pendingReplacement:null}];}):pendingRows;
 const previewFailures=previews.flatMap(preview=>'failure' in preview?[preview.failure]:[]);
 const readyPreview=previews.find(preview=>!('failure' in preview));
 const reviewApprover=readyPreview&&'approver' in readyPreview?readyPreview.approver:approver;
 const approve=async(targetRows?: readonly OperationRow[])=>{
  const toApprove = targetRows ?? reviewRows;
  if(submitting.current||!canApprove||!eligible||!reviewed||!toApprove.length||!reviewApprover.position?.trim()||!password.trim())return;
  submitting.current=true;setBusy(true);setError('');setPasswordError('');
  try{
   const next=await submitBillingApproval(toApprove,mode,password);
   const approvedMap = new Map(toApprove.map((r, i) => [r.id, next[i]!]));
   setResults(previews.map((preview, idx) => {
    if ('failure' in preview) return preview.failure;
    const row = pendingRows[idx];
    if (row && approvedMap.has(row.id)) {
     return approvedMap.get(row.id)!;
    }
    return {
     status: 'failed' as const,
     label: {
      period: String(row?.period ?? row?.billingPeriod ?? ''),
      customer: String(row?.customerName ?? row?.customer ?? ''),
      site: String(row?.siteName ?? row?.site ?? ''),
     },
     message: th ? 'ไม่ได้เลือกรายการเพื่ออนุมัติ' : 'Deselected from issuance approval batch',
    };
   }));
   if (mode === 'single') {
    if (next[0]?.status === 'failed') {
      const rawMsg = next[0].message || '';
      const errMsg = th ? rawMsg : (englishMessages[rawMsg] ?? (rawMsg || 'Unable to issue document'));
      setError(errMsg);
      notify.error(th ? 'ไม่สามารถอนุมัติเอกสารได้' : 'Issuance approval failed', errMsg);
      setPassword('');
      return;
    }
    const docNo = next[0]?.documentNumber;
    notify.success(
      th ? 'อนุมัติและออกใบวางบิลสำเร็จเรียบร้อย' : 'Billing statement approved and issued',
      docNo ? (th ? `เลขที่เอกสาร: ${docNo}` : `Document No: ${docNo}`) : undefined
    );
    setPassword('');
    setPasswordError('');
    setLocalOpen(false);
    onOpenChange?.(false);
    onClearSelection?.();
    onCompleted();
    return;
   }

   const succeeded = next.filter(r => r.status !== 'failed');
   const failed = next.filter(r => r.status === 'failed');

   if (failed.length === next.length) {
    const errMsg = th
      ? `ไม่สามารถออกเอกสารได้ (${failed.length} รายการไม่ผ่านการอนุมัติ)`
      : `Unable to issue documents (${failed.length} items failed)`;
    setError(errMsg);
    notify.error(th ? 'ไม่สามารถอนุมัติเอกสารได้' : 'Issuance approval failed', errMsg);
    setPassword('');
    return;
   }

   if (failed.length > 0) {
    notify.warning(
      th ? `อนุมัติสำเร็จ ${succeeded.length} รายการ, ไม่ผ่าน ${failed.length} รายการ` : `Approved ${succeeded.length} items, ${failed.length} failed`,
      th ? 'กรุณาตรวจสอบรายการที่ไม่ผ่านด้านล่าง' : 'Please check failed items below'
    );
   } else {
    notify.success(
      th ? `อนุมัติและออกใบวางบิลสำเร็จทั้งหมด ${succeeded.length} รายการ` : `Successfully approved and issued ${succeeded.length} statements`
    );
   }

   setPassword('');
   setPasswordError('');
   setLocalOpen(false);
   onOpenChange?.(false);
   onClearSelection?.();
   onCompleted();
  }catch(err:any){
   const msg=err?.response?.message||err?.message||'';
   if(msg.includes('รหัสผ่านไม่ถูกต้อง')||err?.status===401||err?.statusCode===401||err?.response?.statusCode===401){
    const errMsg = th ? 'รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง' : 'Incorrect password. Please try again.';
    setPasswordError(errMsg);
    setPassword('');
    notify.error(th ? 'รหัสผ่านไม่ถูกต้อง' : 'Incorrect password', errMsg);
   }else{
    const errMsg = msg || (th ? 'ไม่สามารถออกเอกสารได้ กรุณาลองใหม่ ผลของรายการก่อนหน้าจะแสดงด้านล่าง' : 'Unable to issue documents. Please try again. Previous results remain below.');
    setError(errMsg);
    notify.error(th ? 'เกิดข้อผิดพลาดในการออกเอกสาร' : 'Error issuing documents', errMsg);
   }
  }finally{submitting.current=false;setBusy(false);}
 };
 return <div className="space-y-3">
  {mode === 'single' && canApprove && rows.length > 0 && controlledOpen === undefined && (
   <div role="status" className="flex flex-wrap items-center gap-3">
    {pendingRows.length > 0 && (
     <Button disabled={busy || !eligible} onClick={() => { setError(''); setPassword(''); setPasswordError(''); setOpen(true); }}>
      {th ? 'อนุมัติและออกเอกสาร' : 'Approve and issue'}
     </Button>
    )}
   </div>
  )}
  {mode === 'bulk' && rows.length > 0 && controlledOpen === undefined && (
   <div
    role="status"
    aria-label={th ? 'แถบจัดการรายการที่เลือก' : 'Selection actions bar'}
    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/95 backdrop-blur-md px-5 py-3.5 shadow-2xl animate-in slide-in-from-bottom-4 max-w-4xl w-[92vw] sm:w-auto"
   >
    <div className="flex items-center gap-2">
     <span className="text-sm font-semibold text-foreground">
      {th ? `เลือกแล้ว ${rows.length} รายการ` : `${rows.length} selected`}
     </span>
     <span className="text-xs text-muted-foreground">
      {pendingRows.length > 0
       ? (th ? `(รออนุมัติ ${pendingRows.length} รายการ)` : `(${pendingRows.length} pending approval)`)
       : (th ? '(ไม่มีรายการรออนุมัติ)' : '(no pending approval)')}
     </span>
    </div>
    <div className="flex items-center gap-2">
     {canApprove && pendingRows.length > 0 && (
      <Button
       size="sm"
       disabled={busy || !eligible}
       onClick={() => {
        setError('');
        setPassword('');
        setPasswordError('');
        setOpen(true);
       }}
       className="gap-1.5 font-semibold"
      >
       <FileCheck className="size-4 shrink-0" />
       <span>{th ? `อนุมัติและออกเอกสาร (${pendingRows.length} รายการ)` : `Approve and issue (${pendingRows.length})`}</span>
      </Button>
     )}
     <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() => exportSelectedRowsAsCsv(rows, locale)}
      className="gap-1.5"
     >
      <Download className="size-4 shrink-0" />
      <span>{th ? `นำออกข้อมูลที่เลือก (${rows.length})` : `Export selected (${rows.length})`}</span>
     </Button>
     {onClearSelection && (
      <Button
       variant="ghost"
       size="sm"
       disabled={busy}
       onClick={onClearSelection}
       className="text-muted-foreground hover:text-foreground"
      >
       {th ? 'ล้างการเลือก' : 'Clear selection'}
      </Button>
     )}
    </div>
   </div>
  )}
  {canApprove&&<Dialog open={open} onOpenChange={setOpen}><DialogContent showCloseButton={!busy} className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{th?'ยืนยันอนุมัติและออกเอกสาร':'Confirm approval and issuance'}</DialogTitle><DialogDescription>{th?'ตรวจสอบใบวางบิลและผู้อนุมัติก่อนออกเอกสาร แต่ละรายการดำเนินการแยกกัน':'Review the billing statements and approver before issuance. Each bill is processed independently.'}</DialogDescription></DialogHeader>
   {error&&<p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
   {previewLoading&&<p role="status">{th?'กำลังโหลดข้อมูลตรวจอนุมัติ…':'Loading approval facts…'}</p>}
   {previewFailures.length>0&&<div role="alert" className="space-y-2"><p>{th?'รายการต่อไปนี้ยังรออนุมัติและจะไม่ถูกส่งอนุมัติในครั้งนี้':'These bills remain pending and will not be submitted in this approval.'}</p>{previewFailures.map((failure,index)=><div key={index}><p>{failure.label.period} · {failure.label.customer==='รายการที่ไม่สามารถเข้าถึงได้'&&!th?'Unavailable record':failure.label.customer} · {failure.label.site}</p><p>{th?failure.message:(englishMessages[failure.message]??'Unable to issue this document')}</p></div>)}</div>}
   {mode==='single'&&reviewRows[0]?(
    <BillingIssuanceReview bill={issuanceBillFromRow(reviewRows[0])} approver={reviewApprover} locale={locale} busy={busy} disabled={!eligible||!reviewed} password={password} onPasswordChange={val=>{setPassword(val);setPasswordError('');}} passwordError={passwordError} onApprove={()=>void approve([reviewRows[0]!])} onCancel={()=>setOpen(false)}/>
   ):(
    <BillingApprovalConfirmation rows={reviewRows} approver={reviewApprover} locale={locale} busy={busy} disabled={!eligible||!reviewed} password={password} onPasswordChange={val=>{setPassword(val);setPasswordError('');}} passwordError={passwordError} onApprove={(selected)=>void approve(selected)} onCancel={()=>setOpen(false)}/>
   )}
  </DialogContent></Dialog>}
  {results.length>0&&<BillingApprovalResults results={results} locale={locale}/>}
 </div>;
}
