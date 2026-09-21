import { cookies } from "next/headers";
import { createTranslator, type Locale } from "@solar/i18n";
import { serverFetch, getApiBaseUrl } from "../../lib/server-fetch";
import { OperationPageHeader } from "./operation-page-header";
import { OperationTable } from "./operation-table";
import { OperationAutoRefresh } from "./operation-auto-refresh";

type OperationResponse = {
  columns: string[];
  rows: any[];
  idKey?: string | undefined;
};

type SummaryItem = {
  label: string;
  value: string | number;
  unit: string;
  note: string;
};

type SummaryResponse = SummaryItem[];

function getCacheConfig(resource: string): RequestInit {
  const revalidateMap: Record<string, number> = {
    alerts: 0,
    notifications: 0,
    billing: 60,
    schools: 300,
    sites: 300,
    contracts: 600,
    users: 600,
    reports: 600,
    audit: 300,
  };
  const seconds = revalidateMap[resource];
  if (seconds === undefined || seconds === 0) {
    return { cache: "no-store" };
  }
  return { next: { revalidate: seconds } };
}

async function getOperationData(
  resource: string,
): Promise<{ data: OperationResponse; summary: SummaryResponse }> {
  const baseUrl = getApiBaseUrl();

  const fetchOptions = getCacheConfig(resource);

  const [rowsRes, summaryRes] = await Promise.all([
    serverFetch(`${baseUrl}/v1/operations/${resource}`, fetchOptions),
    serverFetch(`${baseUrl}/v1/operations/${resource}/summary`, fetchOptions),
  ]);

  if (!rowsRes.ok) {
    throw new Error(`ไม่สามารถโหลดข้อมูลจาก API ได้ (HTTP ${rowsRes.status})`);
  }

  const data = (await rowsRes.json()) as OperationResponse;
  const summary = summaryRes.ok
    ? ((await summaryRes.json()) as SummaryResponse)
    : [];

  return { data, summary };
}

export async function OperationPage({
  resource,
  eyebrow,
  title,
  description,
  action,
}: {
  resource: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  action?: string | undefined;
}) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value as Locale) || "th";
  const t = createTranslator(locale);

  const displayEyebrow = eyebrow || t(`operations.${resource}.eyebrow`);
  const displayTitle = (resource === "audit" && title === "Audit log") ? t("navigation.audit") : (title || t(`operations.${resource}.title`));
  const displayDescription = description || t(`operations.${resource}.description`);
  const displayAction = action || t(`operations.${resource}.action`);

  const { data, summary } = await getOperationData(resource);
  const isRealtime = resource === "alerts" || resource === "notifications";

  return (
    <main className="content">
      {isRealtime && <OperationAutoRefresh intervalMs={30_000} />}
      <div className="ops-content space-y-4">
        <OperationPageHeader
          resource={resource}
          eyebrow={displayEyebrow}
          title={displayTitle}
          description={displayDescription}
          action={displayAction}
        />
        <OperationTable
          resource={resource}
          title={displayTitle}
          columns={data.columns || []}
          rows={data.rows || []}
          summary={summary}
          idKey={data.idKey}
        />
      </div>
    </main>
  );
}
