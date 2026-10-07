'use client';
import {createContext,useContext,useOptimistic,useTransition,type ReactNode} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {dashboardSiteHref,dashboardScopeMatches} from './site-selection';
const SelectionContext=createContext({selectedSiteId:'',chooseSite:(_id:string)=>{},pending:false});
/** Optimistic selection is shared by every dashboard control and the header; URL remains authoritative. */
export function SiteSelectionProvider({children}:{children:ReactNode}) {
 const params=useSearchParams();const pathname=usePathname();const router=useRouter();
 const [pending,startTransition]=useTransition();
 const [selectedSiteId,setSelectedSiteId]=useOptimistic(pathname==='/'?params.get('site_id')||'':'');
 const chooseSite=(id:string)=>startTransition(()=>{setSelectedSiteId(id);router.push(dashboardSiteHref(params.toString(),id),{scroll:false});});
 return <SelectionContext.Provider value={{selectedSiteId,chooseSite,pending}}>{children}</SelectionContext.Provider>;
}
export const useSiteSelection=()=>useContext(SelectionContext);
export function DashboardScope({siteId,children,className}:{siteId?:string|undefined;children:ReactNode;className?:string}) {
 const {selectedSiteId}=useSiteSelection();
 if(!dashboardScopeMatches(selectedSiteId,siteId)) return <div className={className} role="status" aria-busy="true"><div className="h-24 w-full animate-pulse rounded-xl bg-muted"/><span className="sr-only">Loading selected site</span></div>;
 return <div className={className} data-dashboard-scope={siteId||'all'}>{children}</div>;
}
