import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { BillingStatusView, OperationQuery } from '@solar/api-contracts';
import {operationFilters} from '@solar/api-contracts';
import type { ScopePrincipal } from '../../common/auth/resource-scope.js';

// Identifiers only come from this server-owned vocabulary, never request text.
export const operationQueries: Record<string, { sorts: string[]; search: string[]; date?: string; direction: 'asc' | 'desc' }> = {
  customers: { sorts: ["name", "code", "region", "capacityMwp", "sitesCount", "gatewaysCount", "status"], search: ['name', 'code', 'region'], date: 'createdAt', direction: 'asc' },
  sites: { sorts: ["name", "customerName", "capacityMwp", "region", "serviceStartDate", "status"], search: ['name', 'customerName', 'externalSiteId'], date: 'createdAt', direction: 'asc' },
  billing: { sorts: ["period", "customerName", "siteName", "consumedKwh", "rate", "amount", "status"], search: ['period', 'customerName', 'siteName', 'status'], date: 'period', direction: 'desc' },
  contracts: { sorts: ["startDate", "contractNumber", "customerName", "version", "rate", "signers", "status"], search: ['contractNumber', 'customerName', 'siteName', 'signers', 'status'], date: 'startDate', direction: 'desc' },
  documents: { sorts: ["issueDate", "documentNumber", "type", "customerName", "amount", "status"], search: ['documentNumber', 'type', 'customerName', 'siteName', 'status'], date: 'issueDate', direction: 'desc' },
  receipts: { sorts: ["issueDate", "documentNumber", "taxInvoiceNumber", "customerName", "amount", "status"], search: ['documentNumber', 'type', 'customerName', 'siteName', 'status'], date: 'issueDate', direction: 'desc' },
  alerts: { sorts: ["occurredAt", "alertId", "title", "detail", "severity", "status"], search: ['title', 'detail', 'severity', 'status'], date: 'occurredAt', direction: 'desc' },
  notifications: { sorts: ["sentAt", "title", "channel", "recipient", "status"], search: ['title', 'channel', 'recipient', 'status'], date: 'sentAt', direction: 'desc' },
  reports: { sorts: ["generatedAt", "title", "category", "scope", "format", "status"], search: ['title', 'category', 'status'], date: 'generatedAt', direction: 'desc' },
  users: { sorts: ["displayName", "email", "role", "customerName", "lastActive", "status"], search: ['displayName', 'email', 'role', 'status'], date: 'createdAt', direction: 'asc' },
  audit: { sorts: ["time", "action", "entityType", "entityId", "actor", "reason"], search: ['action', 'entityType', 'entityId', 'actor', 'reason', 'correlationId'], date: 'time', direction: 'desc' },
};

// Legacy issuance states span multiple derived tabs, so reopen those links on all.
// Collection aliases normalize to one tab; an explicit billingStatusView wins.
const legacyBillingStatusViews:Readonly<Record<string,BillingStatusView>>={
  '':'all',draft:'unsuccessful',pending_review:'all',approved:'all',issued:'all',
  unpaid:'awaiting_payment',pending_payment:'awaiting_payment',pending_verification:'pending_verification',overdue:'overdue',paid:'paid',cancelled:'unsuccessful',
};

export function parseOperationQuery(resource: string, raw: Record<string, unknown> = {}): OperationQuery {
  const config = operationQueries[resource];
  if (!config) throw new NotFoundException('Unknown resource');
  for (const [key, value] of Object.entries(raw)) {
    if (!['limit', 'cursor', 'search', 'sort', 'direction', 'from', 'to',...(resource==='billing'?['billingStatusView','status']:[]),...(['billing','receipts'].includes(resource)?['siteId','collectionStatus']:[]),...(operationFilters[resource]??[]).map(filter=>filter.key)].includes(key) || typeof value !== 'string') throw new BadRequestException('Invalid operation query');
  }
  const limit = raw.limit === undefined ? 25 : Number(raw.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (raw.limit !== undefined && !/^\d+$/.test(String(raw.limit)))) throw new BadRequestException('Limit must be 1–100');
  const sort = String(raw.sort ?? config.sorts[0]);
  const direction = String(raw.direction ?? config.direction);
  if (!config.sorts.includes(sort) || !['asc', 'desc'].includes(direction)) throw new BadRequestException('Invalid operation sort');
  const search = String(raw.search ?? '').trim();
  if (search.length > 200) throw new BadRequestException('Search too long');
  const from = raw.from as string | undefined, to = raw.to as string | undefined;
  for (const date of [from, to]) {
    if (date !== undefined && (!config.date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new BadRequestException('Invalid date filter');
  }
  if (from && to && from > to) throw new BadRequestException('Invalid date range');
  const cursor = raw.cursor as string | undefined;
  if (cursor !== undefined && (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor))) throw new BadRequestException('Invalid cursor');
  const filters:Partial<OperationQuery>={};
  if(resource==='billing'&&raw.status!==undefined){const legacy=String(raw.status);if(!Object.hasOwn(legacyBillingStatusViews,legacy))throw new BadRequestException('Invalid legacy billing status');filters.billingStatusView=legacyBillingStatusViews[legacy]!;}
  if(raw.siteId!==undefined){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(raw.siteId)))throw new BadRequestException('Invalid site filter');filters.siteId=String(raw.siteId);}
  if(raw.collectionStatus!==undefined){if(!['paid','pending_review','overdue','awaiting_payment'].includes(String(raw.collectionStatus)))throw new BadRequestException('Invalid collection filter');filters.collectionStatus=raw.collectionStatus as NonNullable<OperationQuery['collectionStatus']>;}
  if(raw.billingStatusView!==undefined){if(!['all','pending_issue_approval','awaiting_payment','pending_verification','overdue','paid','unsuccessful'].includes(String(raw.billingStatusView)))throw new BadRequestException('Invalid billing status view');filters.billingStatusView=raw.billingStatusView as NonNullable<OperationQuery['billingStatusView']>;}
  for(const filter of operationFilters[resource]??[]){
    const value=raw[filter.key];
    if(value===undefined||value==='')continue;
    if(!filter.options.some(option=>option.value===value))throw new BadRequestException('Invalid operation filter');
    filters[filter.key]=String(value);
  }
  return { limit, sort, direction: direction as 'asc' | 'desc', ...(search ? { search } : {}), ...(cursor ? { cursor } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}),...filters };
}

function fingerprint(resource: string, query: OperationQuery, user: ScopePrincipal | undefined, scope: string[] | null) {
  return createHash('sha256').update(JSON.stringify([resource, query.sort, query.direction, query.search ?? '', query.from ?? '', query.to ?? '',query.siteId,query.collectionStatus,...(resource==='billing'?[query.billingStatusView??'all']:[]),(operationFilters[resource]??[]).map(filter=>query[filter.key]??''), user?.id, user?.role, scope])).digest('hex');
}

export function operationPredicate(resource: string, query: OperationQuery, params: unknown[]) {
  const config = operationQueries[resource]!;
  const clauses: string[] = [];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if(query.siteId)clauses.push(`q."siteId" = ${bind(query.siteId)}::uuid`);
  if(query.collectionStatus)clauses.push(`q."collectionStatus" = ${bind(query.collectionStatus)}`);
  if(query.billingStatusView&&query.billingStatusView!=='all')clauses.push(`q."billingStatusView" = ${bind(query.billingStatusView)}`);
  for(const filter of operationFilters[resource]??[]){
    const value=query[filter.key];
    if(value)clauses.push(`q."${filter.key}"::text = ${bind(value)}`);
  }
  if (query.search) {
    // Literal substring search: wildcard characters supplied by users remain literal.
    const term = query.search.replace(/[\\%_]/g, '\\$&');
    clauses.push(`concat_ws(' ',${config.search.map(key => `q."${key}"::text`).join(',')}) ILIKE ${bind('%' + term + '%')} ESCAPE '\\'`);
  }
  const dateExpression = resource==='billing'||resource==='receipts'&&query.collectionStatus?`q."periodStart"::text`:["occurredAt", "sentAt", "generatedAt", "time"].includes(config.date ?? "") ? `(q."${config.date}" AT TIME ZONE 'Asia/Bangkok')::date::text` : `q."${config.date}"::text`;
  if (query.from) clauses.push(`${dateExpression} >= ${bind(query.from)}`);
  if (query.to) clauses.push(`${dateExpression} < ${bind(new Date(Date.parse(query.to) + 86400000).toISOString().slice(0, 10))}`);
  return clauses;
}

export function operationPageSql(resource: string, source: string, params: unknown[], query: OperationQuery, user: ScopePrincipal | undefined, scope: string[] | null) {
  const fp = fingerprint(resource, query, user, scope);
  const clauses = operationPredicate(resource, query, params);
  if (query.cursor) {
    let cursor: { v?: unknown; fingerprint?: unknown; value?: unknown; id?: unknown };
    try { cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')); } catch { throw new BadRequestException('Invalid cursor'); }
    if (!cursor || cursor.v !== 1 || cursor.fingerprint !== fp || !(cursor.value === null || typeof cursor.value === 'string' && cursor.value.length <= 500) || typeof cursor.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id)) throw new BadRequestException('Cursor does not match query or scope');
    const compare=query.direction === 'asc' ? '>' : '<';
    if(cursor.value===null){
      params.push(cursor.id);
      clauses.push(`(q."${query.sort}" IS NULL AND q.id ${compare} $${params.length}::uuid)`);
    }else{
      const value=cursor.value as string;
      if (query.sort === 'period' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new BadRequestException('Invalid period cursor');
      if (['amount','capacityMwp','sitesCount','gatewaysCount','productionKwh','consumedKwh','rate','version'].includes(query.sort) && (!/^-?\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value)))) throw new BadRequestException('Invalid numeric cursor');
      if (['startDate','issueDate'].includes(query.sort) && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)) throw new BadRequestException('Invalid date cursor');
      if (['occurredAt','sentAt','generatedAt','time','lastUpdated','lastActive'].includes(query.sort) && (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::\d{2})?)$/.test(value)||!Number.isFinite(Date.parse(value)))) throw new BadRequestException('Invalid timestamp cursor');
      params.push(value, cursor.id);
      clauses.push(`((q."${query.sort}",q.id) ${compare} ($${params.length - 1},$${params.length}::uuid) OR q."${query.sort}" IS NULL)`);
    }
  }
  params.push(query.limit + 1);
  return { sql: `SELECT q.*,q."${query.sort}"::text AS "__operationCursorValue" FROM (${source}) q WHERE ${clauses.join(' AND ') || 'TRUE'} ORDER BY q."${query.sort}" ${query.direction} NULLS LAST,q.id ${query.direction} LIMIT $${params.length}`, cursor: (row: Record<string, unknown>) => Buffer.from(JSON.stringify({ v: 1, fingerprint: fp, value: row.__operationCursorValue===null?null:String(row.__operationCursorValue), id: row.id })).toString('base64url') };
}
