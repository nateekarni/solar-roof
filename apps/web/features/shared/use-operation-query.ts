'use client';
import * as React from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import type {OperationQuery} from '@solar/api-contracts';
export function useOperationQuery() {
 const searchParams=useSearchParams(),pathname=usePathname();
 const query=React.useMemo<OperationQuery>(()=>({limit:Number(searchParams.get('limit')??25),sort:searchParams.get('sort')??'',direction:searchParams.get('direction')==='asc'?'asc':'desc',...Object.fromEntries(['cursor','search','from','to'].flatMap(key=>searchParams.get(key)?[[key,searchParams.get(key)!]]:[]))}),[searchParams]);
 const setQuery=React.useCallback((patch:Partial<OperationQuery>)=>{
  const params=new URLSearchParams(window.location.search);
  if(Object.keys(patch).some(key=>key!=='cursor'))params.delete('cursor');
  for(const [key,value] of Object.entries(patch)){if(value===undefined||value==='')params.delete(key);else params.set(key,String(value));}
  window.history.pushState(null,'',pathname+(params.size?'?'+params.toString():''));
 },[pathname]);
 return {query,setQuery};
}
