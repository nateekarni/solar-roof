import type {BillingStatusView,OperationQuery} from '@solar/api-contracts';

export type OperationSearchParams = Record<
  string,
  string | string[] | undefined
>;

export const operationQueryKeys = [
  'search',
  'sort',
  'direction',
  'from',
  'to',
  'limit',
  'cursor',
  'siteId',
  'collectionStatus',
  'billingStatusView',
  'status',
  'severity',
  'type',
  'role',
  'entityType',
  'channel',
  'category',
  'format',
] as const;

const billingViews:readonly string[]=['all','pending_issue_approval','awaiting_payment','pending_verification','overdue','paid','unsuccessful'];
const legacyBillingViews:Readonly<Record<string,BillingStatusView>>={
 '':'all',draft:'unsuccessful',pending_review:'all',approved:'all',issued:'all',
 unpaid:'awaiting_payment',pending_payment:'awaiting_payment',pending_verification:'pending_verification',overdue:'overdue',paid:'paid',cancelled:'unsuccessful',
};

export function billingStatusViewFromQuery(params:Pick<URLSearchParams,'get'>):BillingStatusView {
 const explicit=params.get('billingStatusView');
 if(explicit!==null)return billingViews.includes(explicit)?explicit as BillingStatusView:'all';
 const legacy=params.get('status')??'';
 return Object.hasOwn(legacyBillingViews,legacy)?legacyBillingViews[legacy]!:'all';
}

export function patchOperationQuery(current:URLSearchParams,patch:Partial<OperationQuery>):URLSearchParams {
 const params=new URLSearchParams(current);
 if(Object.keys(patch).some(key=>key!=='cursor'))params.delete('cursor');
 if(patch.billingStatusView!==undefined)params.delete('status');
 for(const [key,value] of Object.entries(patch)){if(value===undefined||value==='')params.delete(key);else params.set(key,String(value));}
 return params;
}

export function operationRequestQueries(searchParams: OperationSearchParams) {
  const rows = new URLSearchParams();

  for (const key of operationQueryKeys) {
    const rawValue = searchParams[key];
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value !== undefined) rows.set(key, value);
  }

  const summary = new URLSearchParams(rows);
  summary.delete('cursor');

  return { rows: rows.toString(), summary: summary.toString() };
}
