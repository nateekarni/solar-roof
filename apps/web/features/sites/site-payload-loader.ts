import type {PayloadConfig} from "./payload-contracts";
interface SiteScope {open:boolean;siteId:string|null}

/** Publish only the latest request in the current open dialog session. */
export function createSitePayloadLoader(
 load:(siteId:string)=>Promise<PayloadConfig|null>,
 scope:()=>SiteScope,
 publish:(config:PayloadConfig|null)=>void,
){
 let activeSiteId:string|null=null,generation=0;
 const current=(siteId:string,request:number)=>{
  const visible=scope();
  return generation===request&&activeSiteId===siteId&&visible.open&&visible.siteId===siteId;
 };
 return {
  activate(siteId:string|null){activeSiteId=siteId;generation++;},
  invalidate(){activeSiteId=null;generation++;},
  async refresh(){
   const siteId=activeSiteId,visible=scope();
   if(!siteId||!visible.open||visible.siteId!==siteId)return;
   const request=++generation;
   try{
    const config=await load(siteId);
    if(current(siteId,request))publish(config?.siteId===siteId&&config.subscriptionTopic.startsWith("solar/v1/")?config:null);
   }catch{
    if(current(siteId,request))publish(null);
   }
  },
 };
}
