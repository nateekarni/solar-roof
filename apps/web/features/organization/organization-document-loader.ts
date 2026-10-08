import type { OrganizationDocument } from "./organization-document-model";
export type OrganizationPage<T> = {
  rows: T[];
  page?: { hasMore: boolean; nextCursor: string | null };
};
export async function loadOrganizationRows<T extends OrganizationDocument>(
  resource: string,
  get: (endpoint: string) => Promise<OrganizationPage<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < 1000; page++) {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const result = await get(`/v1/operations/${resource}?${params}`);
    rows.push(...result.rows);
    if (!result.page?.hasMore) return rows;
    cursor = result.page.nextCursor;
    if (!cursor || seen.has(cursor))
      throw new Error("Invalid document pagination");
    seen.add(cursor);
  }
  throw new Error("Document pagination limit exceeded");
}
