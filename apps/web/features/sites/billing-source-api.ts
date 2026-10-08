import {buildBillingSourceInput,type BillingSourceState,type BillingSourceDraft} from "./billing-source-model";
interface SourceTransport {
 post:(path:string,body:unknown)=>Promise<unknown>;
 get:(path:string)=>Promise<BillingSourceState>;
}
export async function submitBillingSource(siteId:string,state:BillingSourceState,draft:BillingSourceDraft,profilePending:boolean,client:SourceTransport):Promise<{state:BillingSourceState|null;reloadError?:string}>{
 const input=buildBillingSourceInput(state,draft,profilePending);
 const path=`/v1/sites/${encodeURIComponent(siteId)}/billing-source`;
 await client.post(path,input);
 try{return {state:await client.get(path)};}
 catch(error){return {state:null,reloadError:error instanceof Error?error.message:"Unable to reload"};}
}
