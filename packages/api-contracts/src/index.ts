export interface ApiEnvelope<T> {
  data: T;
  traceId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

