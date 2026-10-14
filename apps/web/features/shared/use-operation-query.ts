'use client';
import * as React from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import type {OperationQuery} from '@solar/api-contracts';
import {patchOperationQuery} from './operation-request-query';
export function useOperationQuery(defaultDirection: "asc" | "desc" = "desc") {
 const searchParams=useSearchParams(),pathname=usePathname();
 const query=React.useMemo<OperationQuery>(()=>({limit:Number(searchParams.get('limit')??25),sort:searchParams.get('sort')??'',direction:searchParams.has('direction')?(searchParams.get('direction')==='asc'?'asc':'desc'):defaultDirection,...Object.fromEntries(['cursor','search','from','to','siteId','collectionStatus','billingStatusView','status','severity','type','role','entityType','channel','category','format'].flatMap(key=>searchParams.get(key)?[[key,searchParams.get(key)!]]:[]))}),[searchParams,defaultDirection]);
 const setQuery=React.useCallback((patch:Partial<OperationQuery>)=>{
  const params=patchOperationQuery(new URLSearchParams(window.location.search),patch);
  window.history.pushState(null,'',pathname+(params.size?'?'+params.toString():''));
 },[pathname]);
 return {query,setQuery};
}
