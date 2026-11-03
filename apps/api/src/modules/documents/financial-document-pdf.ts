import {
  formatDocumentMoney,
  renderDocumentPdf,
  SOLAR_LEASING_PACKET_TEMPLATE_VERSION,
  type DocumentParty,
  type DocumentSnapshot,
} from './document-layout.js';

export const FINANCIAL_TEMPLATE_VERSION = SOLAR_LEASING_PACKET_TEMPLATE_VERSION;
const LEGACY_FINANCIAL_TEMPLATE_VERSION = 'sarabun-a4-v11';
interface SavedFinancialParty {
  company_name: string;
  signatory_name?: string;
  signatory_title?: string;
  signature_data_uri?: string;
  tax_id: string;
  address?: string;
  tax_address?: string;
  branch?: string;
  phone?: string;
  email?: string;
  tax_phone?: string;
  tax_email?: string;
  id?: string;
  contract_number?: string;
  contract_signed_date?: string;
  service_start_date?: string;
  starts?: string;
  total_installments?: number;
  recipient_title?: string;
  province?: string;
  letter_prefix?: string;
  site_name?: string;
  external_site_id?: string | null;
  payment_terms?: string;
}
interface SavedFinancialDocument {
  document_type: string;
  document_number: string;
  snapshot: {
    policy?: {scope?:string;taxPercent?: string | number;taxMode?: string;taxRate?:string;pricesIncludeTax?:boolean};
    company: SavedFinancialParty;
    approver?: {userId:string;displayName:string;position:string;signatureDataUri?:string;approvedAt:string};
    customer: SavedFinancialParty;
    cycle: {
      manual_lines?: {description:string;quantity:string;unitPrice:string;amount:string}[];
      billing_note?: string;
      period_start: string;
      period_end: string;
      subtotal: string;
      simulated_tax: string;
      amount: string;
      meter_snapshot: { from: string; to: string; consumedKwh: string; rate: string; subtotal: string }[];
    };
    issueDate: string;
    templateVersion?: string;
    brandPrimary?: string;
    invoiceNumber?: string;
    letterNumber?: string;
    installmentIndex?: number;
    totalInstallments?: number;
    dailyEnergy?: {
      day: number;
      date?: string;
      totalKwh?: string;
      onPeakKwh?: string;
      offPeakKwh?: string;
    }[];
    energySummary?: {
      totalKwh: string;
      onPeakKwh: string;
      offPeakKwh: string;
    };
    dueDate?: string;
    logo: string;
    logoDataUri?: string;
    banks: {
      bank_name: string;
      account_name: string;
      account_number: string;
      branch_name?: string;
      account_type?: string;
      promptpay_id?: string;
      qr_image_url?: string;
    }[];
    payments: { note?:string|null; payer_name?: string | null; payment_method?: 'bank_transfer' | 'cash' | 'promptpay' | null; transfer_channel?:'bank_account'|'promptpay'|null; origin_bank?: string | null; origin_account?: string | null; status: string; paid_at: string | Date; amount: string; evidence_key?: string; slip_url?: string }[];
    outstandingBills?: {
      bills: {
        period: string;
        billedAmount: string;
        paidAmount: string;
        remainingAmount: string;
      }[];
      totalOutstanding: string;
    };
  };
}
function partySnapshot(party: SavedFinancialParty, customer: boolean): DocumentParty {
  return {
    name: party.company_name, address: (customer ? party.tax_address : party.address) ?? '', taxId: party.tax_id,
    ...(party.branch ? { branch: party.branch } : {}),
    ...((customer ? party.tax_phone : party.phone) ? { phone: customer ? party.tax_phone : party.phone } : {}),
    ...((customer ? party.tax_email : party.email) ? { email: customer ? party.tax_email : party.email } : {}),
  };
}
function formatSnapshotDateIso(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
  return undefined;
}
/** Render only frozen financial data; never update original snapshots or artifacts. */
export function financialDocumentSnapshot(document: SavedFinancialDocument): DocumentSnapshot {
  if (document.document_type !== 'invoice' && document.document_type !== 'receipt') throw new Error('Financial document type required');
  const s = document.snapshot;
  const templateVersion=s.templateVersion??LEGACY_FINANCIAL_TEMPLATE_VERSION;
  const taxRate=s.policy?.taxRate!==undefined?String(s.policy.taxRate):s.policy?.taxPercent!==undefined?String(s.policy.taxPercent):undefined;
  const stripTrailingTaxZeros = templateVersion===FINANCIAL_TEMPLATE_VERSION || templateVersion==='sarabun-a4-v12';
  const taxLabel=taxRate===undefined?'ภาษี':`ภาษี ${stripTrailingTaxZeros?taxRate.replace(/(?:\.0+|(?:(\.\d*?[1-9]))0+)$/,'$1'):taxRate}%`;
  const serviceStartDate = formatSnapshotDateIso(s.customer.service_start_date ?? s.customer.starts);
  const contractSignedDate = formatSnapshotDateIso(s.customer.contract_signed_date ?? s.customer.service_start_date ?? s.customer.starts);
  const issueYearBuddhist = (/^(\d{4})/.exec(s.issueDate)?.[1] ? Number(/^(\d{4})/.exec(s.issueDate)![1]) + 543 : 2569);
  const seqDigits = /(\d{4})$/.exec(document.document_number)?.[1] ?? document.document_number.replace(/\D/g, '').slice(-4).padStart(4, '0') ?? '0001';
  const letterPrefix = (s.company.letter_prefix || 'สฟ').trim();
  const computedLetterNumber = s.letterNumber || `${letterPrefix} ${seqDigits}/${issueYearBuddhist}`;
  return {
    ...(s.brandPrimary?{brandPrimary:s.brandPrimary}:{}),...(s.invoiceNumber?{invoiceNumber:s.invoiceNumber}:{}),
    ...(computedLetterNumber ? { letterNumber: computedLetterNumber } : {}),
    ...(s.customer.contract_number ? { contractNumber: s.customer.contract_number } : {}),
    ...(contractSignedDate ? { contractSignedDate } : {}),
    ...(serviceStartDate ? { serviceStartDate } : {}),
    ...(s.installmentIndex ? { installmentIndex: s.installmentIndex } : {}),
    ...(s.totalInstallments ?? s.customer.total_installments ? { totalInstallments: s.totalInstallments ?? s.customer.total_installments } : {}),
    ...(s.customer.recipient_title ? { recipientTitle: s.customer.recipient_title } : {}),
    ...(s.customer.province ? { customerProvince: s.customer.province } : {}),
    ...(s.dailyEnergy ? { dailyEnergy: s.dailyEnergy } : {}),
    ...(s.energySummary ? { energySummary: s.energySummary } : {}),
    remarks:[...(s.cycle.billing_note?[s.cycle.billing_note]:[]),...(s.customer.payment_terms?[s.customer.payment_terms]:[]),...s.payments.filter(p=>p.status==='paid'||p.status==='approved').flatMap(p=>p.note?[p.note]:[])],
    type: document.document_type, documentNumber: document.document_number, issueDate: s.issueDate,
    issuer: partySnapshot(s.company, false), customer: partySnapshot(s.customer, true),
    ...(s.customer.site_name ? { siteName: s.customer.site_name } : {}),
    ...(s.customer.external_site_id ? { siteExternalId: s.customer.external_site_id } : {}),
    ...(s.customer.payment_terms ? { paymentTerms: s.customer.payment_terms } : {}),
    period: `${s.cycle.period_start.slice(0, 10)} - ${s.cycle.period_end.slice(0, 10)}`,
    signatories: {issuer: {...(s.approver?{name:s.approver.displayName,title:s.approver.position}:{}),...(s.approver?.signatureDataUri?{signatureDataUri:s.approver.signatureDataUri}:{})}}, rates: [],
    items: s.cycle.manual_lines ? s.cycle.manual_lines.map(line=>({description:line.description,quantity:line.quantity,rate:line.unitPrice,amount:line.amount})) : s.cycle.meter_snapshot.map(line => ({
      description: 'ค่าไฟฟ้าพลังงานแสงอาทิตย์',
      period: `${line.from} - ${new Date(Date.parse(line.to) - 86400000).toISOString().slice(0, 10)}`,
      quantity: line.consumedKwh, rate: line.rate, amount: line.subtotal,
    })),
    totals: { subtotal: s.cycle.subtotal, tax: s.cycle.simulated_tax, taxLabel, total: s.cycle.amount },
    approvedTransfers: s.payments.filter(p => p.status === 'paid' || p.status === 'approved').map(p => {
      const ev = (p.evidence_key && !p.evidence_key.startsWith('data:') && p.evidence_key.length <= 160)
        ? p.evidence_key
        : p.slip_url
        ? (p.slip_url.split('/').pop() || undefined)
        : undefined;
      return {
        status: p.status as 'paid' | 'approved', paidAt: typeof p.paid_at === 'string' ? p.paid_at : p.paid_at.toISOString(), amount: p.amount,
        ...(ev ? { evidence: ev } : {}),
        ...(p.payer_name ? { payerName: p.payer_name } : {}),
        ...(p.payment_method ? { paymentMethod: p.payment_method } : {}),
        ...(p.transfer_channel ? { transferChannel: p.transfer_channel } : {}),
        ...(p.origin_bank ? { originBank: p.origin_bank } : {}),
        ...(p.origin_account ? { originAccount: p.origin_account } : {}),
      };
    }),
    ...(s.outstandingBills ? { outstandingBills: s.outstandingBills } : {}),
    paymentAccounts: s.banks.map(bank => ({
      bankName: bank.bank_name,
      accountName: bank.account_name,
      accountNumber: bank.account_number,
      ...(bank.branch_name ? { branchName: bank.branch_name } : {}),
      ...(bank.account_type ? { accountType: bank.account_type } : {}),
      ...(bank.promptpay_id ? { promptPayId: bank.promptpay_id } : {}),
      ...(bank.qr_image_url ? { qrImageDataUri: bank.qr_image_url } : {}),
    })),
    ...(s.dueDate ? { dueDate: s.dueDate } : {}), ...(s.approver ? { approver: s.approver } : {}), logoDataUri: s.logoDataUri ?? s.logo, templateVersion, syntheticTest: s.policy?.scope==='TEST',
  };
}
export async function renderFinancialDocumentPdf(document: SavedFinancialDocument): Promise<Buffer> {
  return renderDocumentPdf(financialDocumentSnapshot(document));
}
export function formatFinancialMoney(value: unknown): string {
  return formatDocumentMoney(String(value));
}
