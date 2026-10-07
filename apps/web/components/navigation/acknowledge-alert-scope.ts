type AlertScope={scope:string;generation:number};
export async function acknowledgeAlertScope(api:{put:(endpoint:string)=>Promise<unknown>},captured:AlertScope,current:()=>AlertScope,apply:()=>void) {
 await api.put('/v1/alerts/acknowledge-all');
 const latest=current();
 if(latest.scope!==captured.scope||latest.generation!==captured.generation)return;
 apply();
}
