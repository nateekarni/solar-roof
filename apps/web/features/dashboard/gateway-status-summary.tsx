import Link from "next/link";
import { AddButton } from "../../components/ui/add-button";
import { Radio } from "lucide-react";
import type { DashboardSummarySite } from "@solar/api-contracts";
import { telemetryAge } from "../../lib/telemetry-age";

export function GatewayStatusSummary({ sites, locale }: { sites: DashboardSummarySite[]; locale: "th" | "en" }) {
  const th = locale === "th", now = Date.now();
  const rows = sites.map(site => ({ ...site, age: telemetryAge(site.lastUpdated, locale, now) }));
  const fresh = rows.filter(site => site.gatewayId && site.age.fresh).length;
  const unconfigured = rows.filter(site => !site.gatewayId).length;
  const problems = rows.filter(site => !site.gatewayId || !site.age.fresh);
  const counters = [
    { label: th ? "ข้อมูลสด" : "Fresh", count: fresh, color: "bg-success" },
    { label: th ? "ข้อมูลไม่สด" : "Stale", count: sites.length - fresh - unconfigured, color: "bg-warning" },
    { label: th ? "ยังไม่ตั้งค่า" : "Unconfigured", count: unconfigured, color: "bg-muted-foreground" },
  ];
  return (
    <section aria-label={th ? "สรุปสถานะ Gateway" : "Gateway status summary"} className="panel flex h-full flex-col p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        {th ? "สรุปสถานะ Gateway" : "Gateway status summary"}
      </h2>
      <div className="my-4 grid grid-cols-3 gap-2">
        {counters.map(counter => (
          <div key={counter.label} className="rounded-lg bg-muted/40 px-2.5 py-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-1.5 shrink-0 rounded-full ${counter.color}`} aria-hidden="true" />
              {counter.label}
            </span>
            <strong className="mt-1 block text-xl font-semibold tabular-nums">{counter.count}</strong>
          </div>
        ))}
      </div>
      {sites.length === 0 ? (
        <p className="text-sm text-muted-foreground">{th ? "ยังไม่มีไซต์ เพิ่มไซต์เพื่อเริ่มติดตาม Gateway" : "No sites yet. Add a site to start monitoring gateways."}</p>
      ) : problems.length === 0 ? (
        <p className="text-sm text-muted-foreground">{th ? "ทุกไซต์มีข้อมูลสด" : "All sites have fresh data"}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {problems.slice(0, 5).map(site => (
            <li key={site.id || site.name} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
              {site.id ? <Link className="font-medium hover:underline" href={`/records/sites/${encodeURIComponent(site.id)}`}>{site.name}</Link> : <span className="font-medium">{site.name}</span>}
              <span className="text-xs text-muted-foreground">{site.gatewayId ? site.age.text : th ? "ยังไม่ได้ตั้งค่า Gateway" : "No gateway configured"}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-auto pt-4">
        {sites.length === 0 ? <AddButton asChild variant="outline"><Link href="/sites">{th ? "ไปเพิ่มไซต์" : "Add a site"}</Link></AddButton> : <Link href="/sites" className="text-xs font-medium text-primary hover:underline">{`${th ? "ดูไซต์ทั้งหมด" : "View all sites"} (${sites.length})`}</Link>}
      </div>
    </section>
  );
}
