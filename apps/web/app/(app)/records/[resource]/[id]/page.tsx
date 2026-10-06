import { requirePageAccess } from "../../../../../lib/session-user";
import {SiteConfigurationDetails} from '../../../../../features/sites/site-configuration-details';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {cookies} from 'next/headers';
import {serverFetch,getApiBaseUrl} from '../../../../../lib/server-fetch';
import {operationKeys} from '../../../../../features/shared/operation-columns';
import {Card,CardContent,CardHeader,CardTitle} from '../../../../../components/ui/card';
import {RecordDetails} from '../../../../../features/shared/record-details';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{resource:string;id:string}>}) {
  const {resource,id}=await params;
  const back:Record<string,string>={sites:'/sites',schools:'/schools',billing:'/billing',contracts:'/contracts',documents:'/billing',receipts:'/receipts',alerts:'/alerts',notifications:'/notifications',reports:'/reports',users:'/settings/users',audit:'/settings/audit'};
  if(!back[resource])notFound();
  await requirePageAccess(back[resource]);
  const res=await serverFetch(`${getApiBaseUrl()}/v1/operations/${resource}/records/${encodeURIComponent(id)}`,{cache:'no-store'});
  if(res.status===404||res.status===403)notFound();
  if(!res.ok)throw new Error('Unable to load record');
  const {row,columns}=await res.json();
  const th=(await cookies()).get('locale')?.value!=='en';
  const fields=operationKeys(resource,row);
  return <main className="content"><div className="ops-content w-full space-y-4"><Link href={back[resource]} className="text-sm text-primary">{th?'กลับไปหน้ารายการ':'Back to list'}</Link><h1 className="text-2xl font-bold">{resource==='sites' ? (th?'รายละเอียดไซต์งาน':'Site details') : (th?'รายละเอียดรายการ':'Record details')}</h1><Card><CardHeader className="py-5"><CardTitle>{row.name||row.title||row.displayName||row.documentNumber||row.period||id}</CardTitle></CardHeader><CardContent className="pb-6"><RecordDetails resource={resource} row={row} fields={fields} columns={columns}/></CardContent></Card>{resource==='sites'&&<SiteConfigurationDetails siteId={id}/>}</div></main>;
}
