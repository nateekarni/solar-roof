'use client';
import type {BillingStatusView} from '@solar/api-contracts';
import {Tabs,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {Badge} from '../../components/ui/badge';
import {STATUS_MAP} from '../../lib/status-badge';

import {cn} from '../../lib/utils';

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
  <TabsList aria-label={locale==='th'?'สถานะใบวางบิล':'Billing statement status'} className="h-auto w-full justify-start overflow-x-auto !bg-transparent bg-transparent p-0 gap-2 border-0 shadow-none">
   {views.map((view,index)=>{
     const isActive = views[index] === value;
     return (
       <TabsTrigger
         key={view}
         value={String(index)}
         {...(panelId?{id:billingStatusTabId(panelId,view),'aria-controls':panelId}:{})}
         className="shrink-0 flex-none px-3.5 py-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-semibold data-active:border-primary data-active:bg-primary data-active:text-primary-foreground data-active:font-semibold transition-colors shadow-none"
       >
        {view==='all'?(locale==='th'?'ทั้งหมด':'All'):STATUS_MAP[view]![locale]}
        <Badge
          variant="secondary"
          className={cn(
            "ml-1.5 text-[10px] h-5 px-1.5 rounded-full font-medium transition-colors border-0",
            isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {counts?.[view]??0}
        </Badge>
       </TabsTrigger>
     );
   })}
  </TabsList>
 </Tabs>;
}
