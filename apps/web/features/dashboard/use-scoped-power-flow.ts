'use client';
import {useEffect,useState} from 'react';
import {apiClient} from '../../lib/api-client';
import {createScopedPoller} from './scoped-poller';
/** Snapshot is tagged with its scope so even the first render after a prop change cannot flash old values. */
export function useScopedPowerFlow<T extends {siteId:string}>(siteId?:string,enabled=true) {
 const scope=siteId||'';
 const [snapshot,setSnapshot]=useState<{scope:string;sites:T[]|null;error:boolean}>({scope,sites:null,error:false});
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  setSnapshot({scope,sites:null,error:false});
  if(!enabled)return;
  const poller=createScopedPoller(()=>apiClient.get<{sites:T[]}>(`/v1/dashboard/power-flow${scope?`?site_id=${encodeURIComponent(scope)}`:''}`),result=>{
   setSnapshot({scope,sites:scope?result.sites.filter(row=>row.siteId===scope):result.sites,error:false});setNow(Date.now());
  },()=>setSnapshot({scope,sites:null,error:true}));
  const load=()=>{if(document.visibilityState==='visible'&&navigator.onLine)void poller.load();};
  load();const timer=setInterval(()=>{setNow(Date.now());load();},10000);
  document.addEventListener('visibilitychange',load);window.addEventListener('online',load);
  return()=>{poller.dispose();clearInterval(timer);document.removeEventListener('visibilitychange',load);window.removeEventListener('online',load);};
 },[scope,enabled]);
 return {sites:snapshot.scope===scope&&enabled?snapshot.sites:null,error:snapshot.scope===scope&&enabled?snapshot.error:false,now};
}
