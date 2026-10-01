export interface OperationQuery {
  limit: number;
  cursor?: string;
  search?: string;
  sort: string;
  direction: 'asc' | 'desc';
  from?: string;
  to?: string;
}

export interface OperationPage<T> {
  columns: string[];
  rows: T[];
  idKey: string;
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
}
