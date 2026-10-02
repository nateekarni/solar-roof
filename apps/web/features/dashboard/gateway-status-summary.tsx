import Link from 'next/link';
import type {DashboardSummarySite} from '@solar/api-contracts';
import {telemetryAge} from '../../lib/telemetry-age';

export function GatewayStatusSummary({sites,locale}:{sites:DashboardSummarySite[];locale:'th'|'en'}) {
  const th=locale==='th',now=Date.now();
  const rows=sites.map(site=>({...site,age:telemetryAge(site.lastUpdated,locale,now)}));
  const online=rows.filter(site=>site.gatewayId&&site.age.fresh).length;
  const missing=rows.filter(site=>!site.gatewayId).length;
  const problems=rows.filter(site=>!site.gatewayId||!site.age.fresh);
  return <section aria-label={th?'สรุปสถานะ Gateway':'Gateway status summary'} className="panel mb-4 p-4">
    <h2 className="font-semibold">{th?'สรุปสถานะ Gateway':'Gateway status summary'}</h2>
    <p className="my-2 text-sm">{th?'ออนไลน์':'Online'}: {online} · {th?'ข้อมูลไม่สด':'Stale'}: {sites.length-online-missing} · {th?'ยังไม่มี Gateway':'No gateway'}: {missing}</p>
    {problems.length===0?<p className="text-sm">{sites.length===0?(th?'ยังไม่มีไซต์':'No sites available'):(th?'ทุกไซต์มีข้อมูลสด':'All sites have fresh data')}</p>:<ul className="space-y-2 text-sm">{problems.slice(0,5).map(site=><li key={site.id}>
      <Link className="font-medium underline" href={`/sites?search=${encodeURIComponent(site.name)}`}>{site.name}</Link>
      <span> — {site.gatewayId?site.age.text:(th?'ยังไม่ได้ตั้งค่า Gateway':'No gateway configured')}</span>
    </li>)}</ul>}
    <Link href="/sites" className="mt-3 inline-block text-sm underline">{th?'ดูไซต์ทั้งหมด':'View all sites'} ({sites.length})</Link>
  </section>;
}
