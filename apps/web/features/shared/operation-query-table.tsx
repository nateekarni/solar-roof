'use client';
import { ChoiceSelect } from '../../components/ui/choice-select';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import type { OperationPage,OperationRow,OperationQuery } from '@solar/api-contracts';
import {useOperationQuery} from "./use-operation-query";
import { apiClient } from '../../lib/api-client';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { DatePicker } from "../../components/ui/date-picker";
import { SearchInput } from '../../components/ui/search-input';
import { OperationTable, type OperationTableProps } from './operation-table';
import { useLocale } from '../../providers/locale-provider';

const queryKeys=['search','sort','direction','from','to','limit','cursor'];

export function OperationQueryTable({ initial, ...props }: Omit<OperationTableProps,'rows'|'columns'> & {initial:OperationPage<OperationRow>}) {
  const th=useLocale()==='th';
  const searchParams=useSearchParams();
  const {setQuery}=useOperationQuery();
  const query=React.useMemo(()=>{const q=new URLSearchParams();for(const key of queryKeys){const value=searchParams.get(key);if(value!==null)q.set(key,value);}return q.toString();},[searchParams]);
  const [data,setData]=React.useState(initial),[summary,setSummary]=React.useState(props.summary);
  const [search,setSearch]=React.useState(searchParams.get('search')??'');
  const [loading,setLoading]=React.useState(false),[error,setError]=React.useState('');
  const history=React.useRef<string[]>([]);
  const revision=React.useRef(0);
  const filterKey = React.useMemo(() => { const params = new URLSearchParams(query); params.delete("cursor"); return params.toString(); }, [query]);
  React.useEffect(() => { history.current = []; }, [filterKey]);
  const update=React.useCallback((changes:Partial<OperationQuery>,reset=true)=>{
    if(reset)history.current=[];
    setQuery(changes);
  },[setQuery]);
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
      apiClient.get<OperationPage<OperationRow>>(`/v1/operations/${props.resource}${suffix}`,{signal:controller.signal,cache:'no-store'}),
      apiClient.get<OperationTableProps['summary']>(`/v1/operations/${props.resource}/summary?${summaryQuery}`,{signal:controller.signal,cache:'no-store'}),
    ]).then(([next,totals])=>{if(current===revision.current&&!controller.signal.aborted){setData(next);setSummary(totals);}})
      .catch((e:Error)=>{if(current===revision.current&&!controller.signal.aborted)setError(e.message);})
      .finally(()=>{if(current===revision.current&&!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[props.resource,query,initial]);
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
  const toolbar = <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="w-full max-w-xs space-y-2"><Label htmlFor={`${props.resource}-search`}>{th?'ค้นหา':'Search'}</Label><SearchInput id={`${props.resource}-search`} placeholder={th?'ค้นหา…':'Search…'} value={search} onChange={e=>setSearch(e.target.value)} /></div>
    {!['schools','sites','users'].includes(props.resource)&&<div className="ml-auto flex flex-wrap items-end gap-2"><div className="space-y-2"><Label htmlFor={`${props.resource}-from`}>{th?'วันที่เริ่มต้น':'From date'}</Label><DatePicker id={`${props.resource}-from`} value={searchParams.get('from')??''} onValueChange={value=>update({from:value})} max={searchParams.get('to')||undefined}/></div><div className="space-y-2"><Label htmlFor={`${props.resource}-to`}>{th?'วันที่สิ้นสุด':'To date'}</Label><DatePicker id={`${props.resource}-to`} value={searchParams.get('to')??''} onValueChange={value=>update({to:value})} min={searchParams.get('from')||undefined}/></div></div>}
  </div>;
return <div className="space-y-3" aria-busy={loading}>
    {error&&<p role="alert">{error}</p>}
    <OperationTable {...props} columns={data.columns} rows={error?[]:data.rows} summary={summary} toolbar={toolbar} serverManaged />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <p role="status" className="text-sm text-muted-foreground">{loading?(th?'กำลังโหลด…':'Loading…'):(th?`${data.rows.length} รายการในหน้านี้`:`${data.rows.length} rows on this page`)}</p>
      <div className="flex flex-wrap items-center gap-3"><span className="text-xs text-muted-foreground">{th?'ต่อหน้า':'Rows per page'}</span><ChoiceSelect aria-label={th?'จำนวนต่อหน้า':'Rows per page'} className="h-10 w-16" value={searchParams.get('limit')??'25'} onChange={e=>update({limit:Number(e.target.value)})}>{[10,25,50,100].map(size=><option key={size} value={size}>{size}</option>)}</ChoiceSelect><span className="text-xs text-muted-foreground">{th?'หน้า':'Page'} {searchParams.has('cursor')?history.current.length+1:1}</span><div className="flex gap-1">
        <Button aria-label="First operation page" variant="outline" size="icon" className="size-10" disabled={loading||!searchParams.has('cursor')} onClick={()=>update({cursor:''})}><ChevronsLeft className="size-3.5"/></Button>
        <Button aria-label="Previous operation page" variant="outline" size="icon" className="size-10" disabled={loading||history.current.length===0} onClick={()=>update({cursor:history.current.pop()??''},false)}><ChevronLeft className="size-3.5"/></Button>
        <Button aria-label="Next operation page" variant="outline" size="icon" className="size-10" disabled={loading||!data.page.hasMore} onClick={()=>{history.current.push(searchParams.get('cursor')??'');update({cursor:data.page.nextCursor??''},false);}}><ChevronRight className="size-3.5"/></Button>
        <Button aria-label="Last operation page" variant="outline" size="icon" className="size-10" disabled={loading||!data.page.hasMore} onClick={()=>void goToLastPage()}><ChevronsRight className="size-3.5"/></Button>
      </div></div>
    </div>

  </div>;
}
