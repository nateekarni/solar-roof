import {formatAppDateRange} from "../../../lib/date-format";
import { cookies } from "next/headers";
import type { DashboardSummaryResponse } from "@solar/api-contracts";
import type { Locale } from "@solar/i18n";
import { requirePageAccess } from "../../../lib/session-user";
import { getApiBaseUrl, serverFetch } from "../../../lib/server-fetch";
import { BusinessProductionTrend } from "../../../features/dashboard/business-dashboard";
import { PeriodPicker } from "../../../features/dashboard/period-picker";
export const dynamic = "force-dynamic";
export default async function ProductionPage({searchParams}:{searchParams?:Promise<{start_date?:string;end_date?:string;month?:string;year?:string}>}) {
 const user = await requirePageAccess("/production");
 const locale = ((await cookies()).get("locale")?.value === "en" ? "en" : "th") as Locale;
 const values = searchParams ? await searchParams : {};
 const query = new URLSearchParams();
 for (const key of ["start_date","end_date","month","year"] as const) if(values[key]) query.set(key,values[key]);
 const response = await serverFetch(getApiBaseUrl()+"/v1/dashboard/summary?"+query, {cache:"no-store"});
 if(!response.ok) throw new Error("Unable to load production");
 const data: DashboardSummaryResponse = await response.json();
 return <main className="content"><div className="ops-content w-full space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0 space-y-1"><h1 className="text-xl font-semibold">{locale === "th" ? "การผลิตไฟฟ้า" : "Electricity production"}</h1>{user.role === "school_user" && <p className="break-words text-sm text-muted-foreground">{data.sites[0]?.schoolName || (locale === "th" ? "ยังไม่มีข้อมูลโรงเรียนที่ได้รับมอบหมาย" : "Assigned school unavailable")}</p>}<p className="text-sm text-muted-foreground">{formatAppDateRange(data.range.start,data.range.end,locale)}</p></div><PeriodPicker /></div><BusinessProductionTrend points={data.production} locale={locale} /></div></main>;
}
