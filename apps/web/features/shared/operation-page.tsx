import type {OperationPage as OperationPageData,OperationRow} from "@solar/api-contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createTranslator, type Locale } from "@solar/i18n";
import { serverFetch, getApiBaseUrl } from "../../lib/server-fetch";
import { OperationPageHeader } from "./operation-page-header";
import { OperationQueryTable } from "./operation-query-table";
import { OperationAutoRefresh } from "./operation-auto-refresh";
import { ReportJobs } from "../reports/job-status";

type OperationResponse = OperationPageData<OperationRow>;

type SummaryItem = {
  label: string;
  value: string | number;
  unit: string;
  note: string;
};

type SummaryResponse = SummaryItem[];

async function getOperationData(
  resource: string,
): Promise<{ data: OperationResponse; summary: SummaryResponse }> {
  const baseUrl = getApiBaseUrl();

  const fetchOptions: RequestInit = { cache: "no-store" };

  const [rowsRes, summaryRes] = await Promise.all([
    serverFetch(`${baseUrl}/v1/operations/${resource}`, fetchOptions),
    serverFetch(`${baseUrl}/v1/operations/${resource}/summary`, fetchOptions),
  ]);

  if (rowsRes.status === 401 || summaryRes.status === 401) {
    redirect("/login");
  }

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
  const displayTitle =
    resource === "audit" && title === "Audit log"
      ? t("navigation.audit")
      : title || t(`operations.${resource}.title`);
  const displayDescription =
    description || t(`operations.${resource}.description`);
  const displayAction =
    action !== undefined ? action : t(`operations.${resource}.action`);

  const { data, summary } = await getOperationData(resource);
  const isRealtime = resource === "alerts" || resource === "notifications" || resource === "sites";

  return (
    <div className="content">
      {isRealtime && <OperationAutoRefresh intervalMs={10_000} />}
      <div className="ops-content space-y-4">
        <OperationPageHeader
          resource={resource}
          eyebrow={displayEyebrow}
          title={displayTitle}
          description={displayDescription}
          action={displayAction}
        />
        {resource === 'reports' && <ReportJobs />}
        <OperationQueryTable
          resource={resource}
          title={displayTitle}
          initial={{...data,idKey:data.idKey||'id'}}
          summary={summary}
          idKey={data.idKey}
        />
      </div>
    </div>
  );
}
