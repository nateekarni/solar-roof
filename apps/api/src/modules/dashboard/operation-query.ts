import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { OperationQuery } from '@solar/api-contracts';
import type { ScopePrincipal } from '../../common/auth/resource-scope.js';

// Identifiers only come from this server-owned vocabulary, never request text.
export const operationQueries: Record<string, { sorts: string[]; search: string[]; date?: string; direction: 'asc' | 'desc' }> = {
  schools: { sorts: ["name", "code", "region", "capacityMwp", "sitesCount", "gatewaysCount", "status"], search: ['name', 'code', 'region'], date: 'createdAt', direction: 'asc' },
  sites: { sorts: ["name", "schoolName", "capacityMwp", "gateway", "protocol", "productionKwh", "lastUpdated", "status"], search: ['name', 'schoolName', 'externalSiteId'], date: 'createdAt', direction: 'asc' },
  billing: { sorts: ["period", "schoolName", "siteName", "consumedKwh", "rate", "amount", "status"], search: ['period', 'schoolName', 'siteName', 'status'], date: 'period', direction: 'desc' },
  contracts: { sorts: ["startDate", "contractNumber", "schoolName", "version", "rate", "signers", "status"], search: ['contractNumber', 'schoolName', 'siteName', 'signers', 'status'], date: 'startDate', direction: 'desc' },
  documents: { sorts: ["issueDate", "documentNumber", "type", "schoolName", "amount", "status"], search: ['documentNumber', 'type', 'schoolName', 'siteName', 'status'], date: 'issueDate', direction: 'desc' },
  receipts: { sorts: ["issueDate", "documentNumber", "taxInvoiceNumber", "schoolName", "amount", "status"], search: ['documentNumber', 'type', 'schoolName', 'siteName', 'status'], date: 'issueDate', direction: 'desc' },
  alerts: { sorts: ["occurredAt", "alertId", "title", "detail", "severity", "status"], search: ['title', 'detail', 'severity', 'status'], date: 'occurredAt', direction: 'desc' },
  notifications: { sorts: ["sentAt", "title", "channel", "recipient", "status"], search: ['title', 'channel', 'recipient', 'status'], date: 'sentAt', direction: 'desc' },
  reports: { sorts: ["generatedAt", "title", "category", "scope", "format", "status"], search: ['title', 'category', 'status'], date: 'generatedAt', direction: 'desc' },
  users: { sorts: ["displayName", "email", "role", "schoolName", "lastActive", "status"], search: ['displayName', 'email', 'role', 'status'], date: 'createdAt', direction: 'asc' },
  audit: { sorts: ["time", "action", "entityType", "entityId", "actor", "reason"], search: ['action', 'entityType', 'entityId', 'actor', 'reason', 'correlationId'], date: 'time', direction: 'desc' },
};

export function parseOperationQuery(resource: string, raw: Record<string, unknown> = {}): OperationQuery {
  const config = operationQueries[resource];
  if (!config) throw new NotFoundException('Unknown resource');
  for (const [key, value] of Object.entries(raw)) {
    if (!['limit', 'cursor', 'search', 'sort', 'direction', 'from', 'to'].includes(key) || typeof value !== 'string') throw new BadRequestException('Invalid operation query');
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
  return { limit, sort, direction: direction as 'asc' | 'desc', ...(search ? { search } : {}), ...(cursor ? { cursor } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

function fingerprint(resource: string, query: OperationQuery, user: ScopePrincipal | undefined, scope: string[] | null) {
  return createHash('sha256').update(JSON.stringify([resource, query.sort, query.direction, query.search ?? '', query.from ?? '', query.to ?? '', user?.id, user?.role, scope])).digest('hex');
}

export function operationPredicate(resource: string, query: OperationQuery, params: unknown[]) {
  const config = operationQueries[resource]!;
  const clauses: string[] = [];
  const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
  if (query.search) {
    // Literal substring search: wildcard characters supplied by users remain literal.
    const term = query.search.replace(/[\\%_]/g, '\\$&');
    clauses.push(`concat_ws(' ',${config.search.map(key => `q."${key}"::text`).join(',')}) ILIKE ${bind('%' + term + '%')} ESCAPE '\\'`);
  }
  const dateExpression = ["occurredAt", "sentAt", "generatedAt", "time"].includes(config.date ?? "") ? `(q."${config.date}" AT TIME ZONE 'Asia/Bangkok')::date::text` : `q."${config.date}"::text`;
  if (query.from) clauses.push(`${dateExpression} >= ${bind(resource === 'billing' ? query.from.slice(0, 7) : query.from)}`);
  if (query.to) clauses.push(`${dateExpression} < ${bind(resource === 'billing' ? new Date(Date.UTC(Number(query.to.slice(0, 4)), Number(query.to.slice(5, 7)), 1)).toISOString().slice(0, 7) : new Date(Date.parse(query.to) + 86400000).toISOString().slice(0, 10))}`);
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
