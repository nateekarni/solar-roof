"use client";
import { useRouter,useSearchParams } from 'next/navigation';
import { useLocale } from '../../providers/locale-provider';
export function SiteFilter({sites}:{sites:{id:string;name:string}[]}) {
  const router=useRouter();const params=useSearchParams();const locale=useLocale();
  return <label className="flex items-center gap-2 text-sm">{locale==='th'?'ไซต์':'Site'}
    <select aria-label={locale==='th'?'เลือกไซต์':'Select site'} className="max-w-48 rounded-md border bg-background p-2" value={params.get('site_id')||''} onChange={event=>{const next=new URLSearchParams(params.toString());if(event.target.value)next.set('site_id',event.target.value);else next.delete('site_id');router.push(`/?${next}`);}}>
      <option value="">{locale==='th'?'ทุกไซต์':'All sites'}</option>{sites.map(site=><option value={site.id} key={site.id}>{site.name}</option>)}
    </select>
  </label>;
}
