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
  'status',
  'severity',
  'type',
  'role',
  'entityType',
  'channel',
  'category',
  'format',
] as const;

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
