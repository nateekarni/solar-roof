'use client';
import type {BillingStatusView} from '@solar/api-contracts';
import {Tabs,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {Badge} from '../../components/ui/badge';
import {STATUS_MAP} from '../../lib/status-badge';

const views:readonly BillingStatusView[]=['all','pending_issue_approval','awaiting_payment','pending_verification','overdue','paid','unsuccessful'];
export function billingStatusTabId(panelId:string,value:BillingStatusView){return `${panelId}-tab-${views.indexOf(value)}`;}

export function BillingStatusTabs({value,counts,locale='th',panelId,onValueChange}:{
 value:BillingStatusView;
 counts?:Partial<Record<BillingStatusView,number>>|undefined;
 locale?:'th'|'en';
 panelId?:string;
 onValueChange:(value:BillingStatusView)=>void;
}) {
 // Radix includes its values in DOM IDs; keep those IDs display-safe too.
 return <Tabs className="min-w-0" value={String(views.indexOf(value))} onValueChange={index=>{const next=views[Number(index)];if(next)onValueChange(next);}}>
  <TabsList aria-label={locale==='th'?'สถานะใบวางบิล':'Billing statement status'} className="h-auto w-full justify-start overflow-x-auto">
   {views.map((view,index)=><TabsTrigger key={view} value={String(index)} {...(panelId?{id:billingStatusTabId(panelId,view),'aria-controls':panelId}:{})} className="shrink-0 flex-none px-3">
    {view==='all'?(locale==='th'?'ทั้งหมด':'All'):STATUS_MAP[view]![locale]}
    <Badge variant="secondary">{counts?.[view]??0}</Badge>
   </TabsTrigger>)}
  </TabsList>
 </Tabs>;
}
