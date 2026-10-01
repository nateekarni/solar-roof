'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { OperationPage } from '@solar/api-contracts';
import { apiClient } from '../../lib/api-client';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { OperationTable, type OperationTableProps } from './operation-table';

const sorts:Record<string,string[]>={schools:['name','code','status'],sites:['name','status','capacityMwp'],billing:['period','amount','status'],contracts:['startDate','status'],documents:['issueDate','documentNumber','amount','status'],receipts:['issueDate','documentNumber','amount','status'],alerts:['occurredAt','severity','status'],notifications:['sentAt','status'],reports:['generatedAt','title','status'],users:['displayName','email','role','status'],audit:['time','action']};
const queryKeys=['search','sort','direction','from','to','limit','cursor'];

export function OperationQueryTable({ initial, ...props }: Omit<OperationTableProps,'rows'|'columns'> & {initial:OperationPage<Record<string,any>>}) {
  const searchParams=useSearchParams(),pathname=usePathname();
  const query=React.useMemo(()=>{const q=new URLSearchParams();for(const key of queryKeys){const value=searchParams.get(key);if(value!==null)q.set(key,value);}return q.toString();},[searchParams]);
  const [data,setData]=React.useState(initial),[summary,setSummary]=React.useState(props.summary);
  const [search,setSearch]=React.useState(searchParams.get('search')??'');
  const [loading,setLoading]=React.useState(false),[error,setError]=React.useState('');
  const history=React.useRef<string[]>([]);
  const revision=React.useRef(0);
  const update=React.useCallback((changes:Record<string,string>,reset=true)=>{
    const q=new URLSearchParams(window.location.search);
    if(reset){q.delete('cursor');history.current=[];}
    for(const [key,value] of Object.entries(changes)){if(value)q.set(key,value);else q.delete(key);}
    window.history.pushState(null,'',pathname+(q.size?'?'+q.toString():''));
  },[pathname]);
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
    const controller=new AbortController(),current=++revision.current;
    setLoading(true);setError('');
    const suffix=query?'?'+query:'';
    const summaryQuery=new URLSearchParams(query);summaryQuery.delete('cursor');
    Promise.all([
      apiClient.get<OperationPage<Record<string,any>>>(`/v1/operations/${props.resource}${suffix}`,{signal:controller.signal,cache:'no-store'}),
      apiClient.get<OperationTableProps['summary']>(`/v1/operations/${props.resource}/summary?${summaryQuery}`,{signal:controller.signal,cache:'no-store'}),
    ]).then(([next,totals])=>{if(current===revision.current&&!controller.signal.aborted){setData(next);setSummary(totals);}})
      .catch((e:Error)=>{if(current===revision.current&&!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(current===revision.current&&!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[props.resource,query,initial]);
  return <div className="space-y-3" aria-busy={loading}>
    <div className="flex flex-wrap items-center gap-2">
      <Input type="search" aria-label="Operations search" placeholder="ค้นหา / Search" value={search} onChange={e=>setSearch(e.target.value)} className="max-w-xs" />
      <label>Sort <select aria-label="Operation sort" value={searchParams.get('sort')??sorts[props.resource]?.[0]} onChange={e=>update({sort:e.target.value})}>{sorts[props.resource]?.map(key=><option key={key} value={key}>{key}</option>)}</select></label>
      <label>Order <select aria-label="Operation direction" value={searchParams.get('direction')??(['schools','sites','users'].includes(props.resource)?'asc':'desc')} onChange={e=>update({direction:e.target.value})}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      <label>Rows <select aria-label="Operation page size" value={searchParams.get('limit')??'25'} onChange={e=>update({limit:e.target.value})}>{[25,50,100].map(size=><option key={size}>{size}</option>)}</select></label>
      {!['schools','sites','users'].includes(props.resource)&&<><Input type="date" aria-label="Operation from date" value={searchParams.get('from')??''} onChange={e=>update({from:e.target.value})} className="w-auto"/><Input type="date" aria-label="Operation to date" value={searchParams.get('to')??''} onChange={e=>update({to:e.target.value})} className="w-auto"/></>}
    </div>
    {error&&<p role="alert">{error}</p>}
    <div className="flex items-center justify-between gap-2">
      <p role="status">{loading?'Loading…':`${data.rows.length} rows on this page`}</p>
      <div className="flex gap-2">
        <Button aria-label="First operation page" variant="outline" disabled={loading||!searchParams.has('cursor')} onClick={()=>update({cursor:''})}>First</Button>
        <Button aria-label="Previous operation page" variant="outline" disabled={loading||history.current.length===0} onClick={()=>update({cursor:history.current.pop()??''},false)}>Previous</Button>
        <Button aria-label="Next operation page" variant="outline" disabled={loading||!data.page.hasMore} onClick={()=>{history.current.push(searchParams.get('cursor')??'');update({cursor:data.page.nextCursor??''},false);}}>Next</Button>
      </div>
    </div>
    <OperationTable {...props} columns={data.columns} rows={error?[]:data.rows} summary={summary} serverManaged />
  </div>;
}
