import { formatDocumentMoney, renderDocumentPdf, type DocumentParty, type DocumentSnapshot } from './document-layout.js';

export const FINANCIAL_TEMPLATE_VERSION = 'sarabun-a4-v4';
interface SavedFinancialParty {
  company_name: string;
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
    company: SavedFinancialParty;
    customer: SavedFinancialParty;
    cycle: {
      period_start: string;
      period_end: string;
      subtotal: string;
      simulated_tax: string;
      amount: string;
      meter_snapshot: { from: string; to: string; consumedKwh: string; rate: string; subtotal: string }[];
    };
    issueDate: string;
    templateVersion?: string;
    dueDate?: string;
    logo: string;
    banks: { bank_name: string; account_name: string; account_number: string }[];
    payments: { status: string; paid_at: string | Date; amount: string; evidence_key?: string; slip_url?: string }[];
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
/** Convert existing frozen TEST snapshots; never update their original data or artifacts. */
export function localTestDocumentSnapshot(document: SavedFinancialDocument): DocumentSnapshot {
  if (document.document_type !== 'invoice' && document.document_type !== 'receipt') throw new Error('Financial document type required');
  const s = document.snapshot;
  return {
    type: document.document_type, documentNumber: document.document_number, issueDate: s.issueDate,
    issuer: partySnapshot(s.company, false), customer: partySnapshot(s.customer, true),
    ...(s.customer.site_name ? { siteName: s.customer.site_name } : {}), ...(s.customer.contract_number ? { contractNumber: s.customer.contract_number } : {}),
    ...(s.customer.external_site_id ? { siteExternalId: s.customer.external_site_id } : {}),
    ...(s.customer.payment_terms ? { paymentTerms: s.customer.payment_terms } : {}),
    period: `${s.cycle.period_start.slice(0, 10)} - ${s.cycle.period_end.slice(0, 10)}`,
    signatories: {}, rates: [],
    items: s.cycle.meter_snapshot.map(line => ({
      description: 'ค่าไฟฟ้าพลังงานแสงอาทิตย์ / Solar electricity charges',
      period: `${line.from} - ${new Date(Date.parse(line.to) - 86400000).toISOString().slice(0, 10)}`,
      quantity: line.consumedKwh, rate: line.rate, amount: line.subtotal,
    })),
    totals: { subtotal: s.cycle.subtotal, tax: s.cycle.simulated_tax, taxLabel: 'ภาษีทดสอบ 7% / Simulated tax 7%', total: s.cycle.amount },
    approvedTransfers: s.payments.filter(p => p.status === 'paid' || p.status === 'approved').map(p => ({
      status: p.status as 'paid' | 'approved', paidAt: typeof p.paid_at === 'string' ? p.paid_at : p.paid_at.toISOString(), amount: p.amount,
      ...(p.evidence_key || p.slip_url ? { evidence: p.evidence_key || p.slip_url } : {}),
    })),
    paymentAccounts: s.banks.map(bank => ({ bankName: bank.bank_name, accountName: bank.account_name, accountNumber: bank.account_number })),
    ...(s.dueDate ? { dueDate: s.dueDate } : {}), logoDataUri: s.logo, templateVersion: s.templateVersion ?? FINANCIAL_TEMPLATE_VERSION, syntheticTest: true,
  };
}
export async function renderLocalTestPdf(document: SavedFinancialDocument): Promise<Buffer> {
  return renderDocumentPdf(localTestDocumentSnapshot(document));
}
export function formatTestMoney(value: unknown): string {
  return formatDocumentMoney(String(value));
}
