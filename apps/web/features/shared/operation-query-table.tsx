'use client';
import { ChoiceSelect } from '../../components/ui/choice-select';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type { OperationPage,OperationRow,OperationQuery } from '@solar/api-contracts';
import {operationFilters} from '@solar/api-contracts';
import {useOperationQuery} from "./use-operation-query";
import {readCursorHistory,saveCursorHistory} from './operation-cursor-history';
import { apiClient } from '../../lib/api-client';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '../../components/ui/button';
import {ListPeriodPicker} from './list-period-picker';
import { SearchInput } from '../../components/ui/search-input';
import { OperationTable, type OperationTableProps } from './operation-table';
import { useLocale } from '../../providers/locale-provider';
import { operationQueryKeys,billingStatusViewFromQuery,patchOperationQuery } from './operation-request-query';
import {BillingStatusTabs,billingStatusTabId,CUSTOMER_VIEWS,DEFAULT_STAFF_VIEWS,ReceiptStatusTabs} from '../billing/billing-status-tabs';
import {AlertWorkspaceTabs} from '../alerts/alert-workspace-tabs';

export function OperationQueryTable({ initial, userRole, ...props }: Omit<OperationTableProps,'rows'|'columns'> & {initial:OperationPage<OperationRow>; userRole?: string}) {
  const isCustomer = userRole === 'customer_user';
  const th=useLocale()==='th';
  const searchParams=useSearchParams();
  const resultsPanelId=React.useId();
  const billingStatusView=billingStatusViewFromQuery(searchParams);
  const {setQuery}=useOperationQuery();
  const query=React.useMemo(()=>{const q=new URLSearchParams();for(const key of operationQueryKeys){const value=searchParams.get(key);if(value!==null)q.set(key,value);}return q.toString();},[searchParams]);
  const [data,setData]=React.useState(initial),[summary,setSummary]=React.useState(props.summary);
  const [search,setSearch]=React.useState(searchParams.get('search')??'');
  const [loading,setLoading]=React.useState(false),[error,setError]=React.useState('');
  const [approvalRevision,refreshAfterApproval]=React.useReducer(value=>value+1,0);
  const history=React.useRef<string[]>([]);
  const [,refreshHistory]=React.useReducer(value=>value+1,0);
  const revision=React.useRef(0);
  const initialQuery=React.useRef(true);
  React.useEffect(() => {
    try{history.current=readCursorHistory(sessionStorage,props.resource,query);}catch{history.current=[];}
    refreshHistory();
  }, [props.resource,query]);
  const update=React.useCallback((changes:Partial<OperationQuery>,reset=true)=>{
    if(reset)history.current=[];
    const next=patchOperationQuery(new URLSearchParams(query),changes);
    try{saveCursorHistory(sessionStorage,props.resource,next.toString(),history.current);}catch{/* Storage may be unavailable. */}
    setQuery(changes);
  },[setQuery,props.resource,query]);
  React.useEffect(()=>{setSearch(searchParams.get('search')??'');},[searchParams]);
  React.useEffect(()=>{
    if(search===(searchParams.get('search')??''))return;
    // Invalidate immediately while the URL update is debounced: an older result
    // cannot overwrite the user's newer input during these 300 ms.
    revision.current++;
    const timer=setTimeout(()=>update({search}),300);
    return()=>clearTimeout(timer);
  },[search,searchParams,update]);
  React.useEffect(()=>{
    // The server already supplied the first page for this exact URL. Fetching it
    // again during hydration delays interactivity and can replace identical rows.
    if(initialQuery.current){initialQuery.current=false;return;}
    const controller=new AbortController(),current=++revision.current;
    setLoading(true);setError('');
    const suffix=query?'?'+query:'';
    const summaryQuery=new URLSearchParams(query);summaryQuery.delete('cursor');
    const fetchSummary = !isCustomer || !['billing', 'receipts'].includes(props.resource);
    Promise.all([
      apiClient.get<OperationPage<OperationRow>>(`/v1/operations/${props.resource}${suffix}`,{signal:controller.signal,cache:'no-store'}),
      fetchSummary ? apiClient.get<OperationTableProps['summary']>(`/v1/operations/${props.resource}/summary?${summaryQuery}`,{signal:controller.signal,cache:'no-store'}) : Promise.resolve([]),
    ]).then(([next,totals])=>{if(current===revision.current&&!controller.signal.aborted){setData(next);setSummary(fetchSummary ? totals : []);}})
      .catch((e:Error)=>{if(current===revision.current&&!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(current===revision.current&&!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[props.resource,query,initial,approvalRevision,isCustomer]);
  const goToLastPage = async () => {
    const current = revision.current;
    setLoading(true); setError('');
    const params = new URLSearchParams(query); params.delete('cursor');
    const cursors: string[] = []; let cursor = '';
    try {
      while (true) {
        if (cursor) params.set('cursor', cursor);
        const page = await apiClient.get<OperationPage<OperationRow>>(`/v1/operations/${props.resource}?${params}`, {cache:'no-store'});
        if (revision.current !== current) return;
        if (!page.page.hasMore || !page.page.nextCursor) break;
        if (cursors.includes(page.page.nextCursor) || page.page.nextCursor === cursor) throw new Error(th?'ไม่สามารถโหลดหน้าสุดท้ายได้':'Unable to load last page');
        cursors.push(cursor); cursor = page.page.nextCursor;
      }
      history.current = cursors;
      update({cursor}, false);
    } catch (e) { if (revision.current === current) setError(e instanceof Error ? e.message : 'Unable to load last page'); }
    finally { if (revision.current === current) setLoading(false); }
  };
  const collectionStatus = searchParams.get('collectionStatus') === 'paid' ? 'paid' : 'all';
  const toolbar = <div className="flex min-w-0 flex-col gap-3"><div className="flex flex-wrap items-end justify-between gap-3">
    <div className="w-full max-w-xs"><SearchInput id={`${props.resource}-search`} aria-label={th?'ค้นหา':'Search'} placeholder={th?'ค้นหา…':'Search…'} value={search} onChange={e=>setSearch(e.target.value)} /></div>
    <div className='ml-auto flex flex-wrap items-center justify-end gap-2'>
     {(operationFilters[props.resource]??[]).filter(filter=>!['billing','receipts'].includes(props.resource)||filter.key!=='status').map(filter=>{
       const options = isCustomer ? filter.options.filter(option=>option.value!=='cancelled'&&option.value!=='unsuccessful'&&option.value!=='draft') : filter.options;
       return <ChoiceSelect key={filter.key} aria-label={filter.label[th?0:1]} className='h-10 min-w-32 w-auto' value={searchParams.get(filter.key)??''} onChange={event=>update({[filter.key]:event.target.value})}><option value=''>{filter.label[th?0:1]}: {th?'ทั้งหมด':'All'}</option>{options.map(option=><option key={option.value} value={option.value}>{option.label[th?0:1]}</option>)}</ChoiceSelect>;
     })}
     {!['customers','sites','users'].includes(props.resource)&&<ListPeriodPicker from={searchParams.get('from')??''} to={searchParams.get('to')??''} onValueChange={period=>update(period)}/>}
    </div>
  </div>
  {props.resource==='billing'&&<BillingStatusTabs value={billingStatusView} panelId={resultsPanelId} counts={data.facets?.billingStatusCounts} locale={th?'th':'en'} views={isCustomer ? CUSTOMER_VIEWS : DEFAULT_STAFF_VIEWS} onValueChange={billingStatusView=>update({billingStatusView})}/>}
  {props.resource==='receipts'&&<ReceiptStatusTabs value={collectionStatus} panelId={resultsPanelId} locale={th?'th':'en'} counts={{all: data.rows.length, paid: data.rows.filter(r=>r.collectionStatus==='paid'||r.status==='paid'||r.status==='issued').length}} onValueChange={val=>update({collectionStatus: val==='paid'?'paid':undefined})}/>}
  {props.resource==='alerts'&&<AlertWorkspaceTabs value="incidents" />}
  </div>;
return <div className="space-y-3" aria-busy={loading}>
    {error&&<p role="alert">{error}</p>}
    <OperationTable {...props} {...(props.resource==='billing'?{onBillingApprovalCompleted:refreshAfterApproval,selectionScope:JSON.stringify([query,search]),resultsPanel:{id:resultsPanelId,labelledBy:billingStatusTabId(resultsPanelId,billingStatusView)}}:{})} columns={data.columns} rows={error?[]:data.rows} summary={isCustomer && ['billing', 'receipts'].includes(props.resource) ? [] : summary} toolbar={toolbar} serverManaged />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <p role="status" className="text-sm text-muted-foreground">{loading?(th?'กำลังโหลด…':'Loading…'):(th?`${data.rows.length} รายการในหน้านี้`:`${data.rows.length} rows on this page`)}</p>
      <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-muted-foreground">{th?'ต่อหน้า':'Rows per page'}</span><ChoiceSelect aria-label={th?'จำนวนต่อหน้า':'Rows per page'} className="h-10 w-16" value={searchParams.get('limit')??'50'} onChange={e=>update({limit:Number(e.target.value)})}>{[10,25,50,100].map(size=><option key={size} value={size}>{size}</option>)}</ChoiceSelect><span className="text-xs text-muted-foreground">{th?'หน้า':'Page'} {searchParams.has('cursor')?history.current.length+1:1}</span><div className="flex gap-1">
        <Button aria-label="First operation page" variant="outline" size="icon" className="size-10" disabled={loading||!searchParams.has('cursor')} onClick={()=>update({cursor:''})}><ChevronsLeft className="size-3.5"/></Button>
        <Button aria-label="Previous operation page" variant="outline" size="icon" className="size-10" disabled={loading||history.current.length===0} onClick={()=>update({cursor:history.current.pop()??''},false)}><ChevronLeft className="size-3.5"/></Button>
        <Button aria-label="Next operation page" variant="outline" size="icon" className="size-10" disabled={loading||!data.page.hasMore} onClick={()=>{history.current.push(searchParams.get('cursor')??'');update({cursor:data.page.nextCursor??''},false);}}><ChevronRight className="size-3.5"/></Button>
        <Button aria-label="Last operation page" variant="outline" size="icon" className="size-10" disabled={loading||!data.page.hasMore} onClick={()=>void goToLastPage()}><ChevronsRight className="size-3.5"/></Button>
      </div></div>
    </div>

  </div>;
}
