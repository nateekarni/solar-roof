import { formatDocumentMoney, renderDocumentPdf, type DocumentParty, type DocumentSnapshot } from './document-layout.js';

export const FINANCIAL_TEMPLATE_VERSION = 'sarabun-a4-v7';
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
    dueDate?: string;
    logo: string;
    logoDataUri?: string;
    banks: { bank_name: string; account_name: string; account_number: string }[];
    payments: { note?:string|null; payer_name?: string | null; payment_method?: 'bank_transfer' | 'promptpay' | null; origin_bank?: string | null; origin_account?: string | null; status: string; paid_at: string | Date; amount: string; evidence_key?: string; slip_url?: string }[];
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
/** Render only frozen financial data; never update original snapshots or artifacts. */
export function financialDocumentSnapshot(document: SavedFinancialDocument): DocumentSnapshot {
  if (document.document_type !== 'invoice' && document.document_type !== 'receipt') throw new Error('Financial document type required');
  const s = document.snapshot;
  return {
    ...(s.brandPrimary?{brandPrimary:s.brandPrimary}:{}),...(s.invoiceNumber?{invoiceNumber:s.invoiceNumber}:{}),
    remarks:[...(s.cycle.billing_note?[s.cycle.billing_note]:[]),...(s.customer.payment_terms?[s.customer.payment_terms]:[]),...s.payments.filter(p=>p.status==='paid'||p.status==='approved').flatMap(p=>p.note?[p.note]:[])],
    type: document.document_type, documentNumber: document.document_number, issueDate: s.issueDate,
    issuer: partySnapshot(s.company, false), customer: partySnapshot(s.customer, true),
    ...(s.customer.site_name ? { siteName: s.customer.site_name } : {}),
    ...(s.customer.external_site_id ? { siteExternalId: s.customer.external_site_id } : {}),
    ...(s.customer.payment_terms ? { paymentTerms: s.customer.payment_terms } : {}),
    period: `${s.cycle.period_start.slice(0, 10)} - ${s.cycle.period_end.slice(0, 10)}`,
    signatories: {issuer: {...(s.company.signatory_name ? {name:s.company.signatory_name} : {}), ...(s.company.signatory_title ? {title:s.company.signatory_title} : {}), ...(s.company.signature_data_uri ? {signatureDataUri:s.company.signature_data_uri} : {})}}, rates: [],
    items: s.cycle.manual_lines ? s.cycle.manual_lines.map(line=>({description:line.description,quantity:line.quantity,rate:line.unitPrice,amount:line.amount})) : s.cycle.meter_snapshot.map(line => ({
      description: 'ค่าไฟฟ้าพลังงานแสงอาทิตย์',
      period: `${line.from} - ${new Date(Date.parse(line.to) - 86400000).toISOString().slice(0, 10)}`,
      quantity: line.consumedKwh, rate: line.rate, amount: line.subtotal,
    })),
    totals: { subtotal: s.cycle.subtotal, tax: s.cycle.simulated_tax, taxLabel: s.policy?.taxRate !== undefined ? `ภาษี ${s.policy.taxRate}%` : s.policy?.taxPercent !== undefined ? `ภาษี ${s.policy.taxPercent}%` : 'ภาษี', total: s.cycle.amount },
    approvedTransfers: s.payments.filter(p => p.status === 'paid' || p.status === 'approved').map(p => ({
      status: p.status as 'paid' | 'approved', paidAt: typeof p.paid_at === 'string' ? p.paid_at : p.paid_at.toISOString(), amount: p.amount,
      ...(p.evidence_key && !p.evidence_key.startsWith('data:') && p.evidence_key.length<=160 ? {evidence:p.evidence_key}:{}),
      ...(p.payer_name ? { payerName: p.payer_name } : {}),
      ...(p.payment_method ? { paymentMethod: p.payment_method } : {}),
      ...(p.origin_bank ? { originBank: p.origin_bank } : {}),
      ...(p.origin_account ? { originAccount: p.origin_account } : {}),
    })),
    paymentAccounts: s.banks.map(bank => ({ bankName: bank.bank_name, accountName: bank.account_name, accountNumber: bank.account_number })),
    ...(s.dueDate ? { dueDate: s.dueDate } : {}), logoDataUri: s.logoDataUri ?? s.logo, templateVersion: s.templateVersion ?? 'sarabun-a4-v6', syntheticTest: s.policy?.scope==='TEST',
  };
}
export async function renderFinancialDocumentPdf(document: SavedFinancialDocument): Promise<Buffer> {
  return renderDocumentPdf(financialDocumentSnapshot(document));
}
export function formatFinancialMoney(value: unknown): string {
  return formatDocumentMoney(String(value));
}
