/** Each site effect owns a poller. Disposal makes delayed success/error callbacks harmless. */
export function createScopedPoller<T>(fetchRows:()=>Promise<T>,onData:(data:T)=>void,onError:()=>void) {
 let active=true,busy=false;
 return {
  async load(){
   if(!active||busy)return;
   busy=true;
   try{const data=await fetchRows();if(active)onData(data);}catch{if(active)onError();}finally{busy=false;}
  },
  dispose(){active=false;},
 };
}
