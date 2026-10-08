"use client";

import * as React from "react";
import {Alert,AlertDescription,AlertTitle} from "../../components/ui/alert";
import {Button} from "../../components/ui/button";
import {Skeleton} from "../../components/ui/skeleton";
import {apiClient} from "../../lib/api-client";
import {useAuth} from "../../stores/auth-store";
import {BillingSourcePanel} from "./billing-source-panel";
import {billingSourcePath,billingSourceDraft,type BillingSourceState,type BillingSourceDraft} from "./billing-source-model";
import {submitBillingSource} from "./billing-source-api";
import type {PayloadReceiveConfig} from "./payload-contracts";

interface SiteBillingSourceProps {
 siteId:string;locale:"en"|"th";expectedProfileRevisionId?:string;refreshKey?:unknown;
 profilePending?:boolean;receiveConfig?:PayloadReceiveConfig;focusOnLoad?:boolean;setupPending?:boolean;onBindingSaved?:()=>void;
}
export function SiteBillingSource(props:SiteBillingSourceProps){
 const {user}=useAuth();
 return user?.role==="admin"?<AdminBillingSource {...props}/>:null;
}
function AdminBillingSource({siteId,locale,expectedProfileRevisionId,refreshKey,profilePending=false,receiveConfig,focusOnLoad=false,setupPending=false,onBindingSaved}:SiteBillingSourceProps){
 const [state,setState]=React.useState<BillingSourceState|null>(null);
 const [draft,setDraft]=React.useState<BillingSourceDraft>({sourceTag:"",measurementPurpose:"",purposeDescription:"",confirmed:false});
 const [busy,setBusy]=React.useState(false),[fetching,setFetching]=React.useState(true);
 const [error,setError]=React.useState(""),[notice,setNotice]=React.useState("");
 const generation=React.useRef(0),loadedFor=React.useRef(""),focused=React.useRef(false);
 const panelRef=React.useRef<HTMLDivElement>(null);
 const text=(th:string,en:string)=>locale==="th"?th:en;
 const reload=React.useCallback(async()=>{
  const requestId=++generation.current;
  setFetching(true);setState(null);setError("");
  try{
   const next=await apiClient.get<BillingSourceState>(`/v1/sites/${encodeURIComponent(siteId)}/billing-source`);
   if(requestId!==generation.current)return;
   loadedFor.current=siteId;setState(next);setDraft(billingSourceDraft(next));
  }catch(error){
   if(requestId===generation.current)setError(locale==="th"?"โหลดแหล่งข้อมูลบิลไม่สำเร็จ กรุณาโหลดใหม่: "+(error instanceof Error?error.message:""):"Unable to load billing source. Reload to continue: "+(error instanceof Error?error.message:""));
  }finally{if(requestId===generation.current)setFetching(false);}
 },[siteId,locale]);
 React.useEffect(()=>{void reload();return()=>{generation.current++;};},[reload,expectedProfileRevisionId,refreshKey]);
 React.useEffect(()=>{
  if(state&&focusOnLoad&&!focused.current){
   focused.current=true;
   const target=panelRef.current?.querySelector<HTMLElement>("#site-billing-source");
   target?.focus();target?.scrollIntoView({block:"start"});
  }
 },[state,focusOnLoad]);
 const staleProfile=Boolean(expectedProfileRevisionId&&state?.device?.profileRevisionId!==expectedProfileRevisionId);
 const save=async()=>{
  if(!state||loadedFor.current!==siteId||busy||fetching||profilePending||staleProfile)return;
  const requestId=generation.current;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await submitBillingSource(siteId,state,draft,profilePending||staleProfile,{post:(path,body)=>apiClient.post(path,body),get:path=>apiClient.get<BillingSourceState>(path)});
   if(requestId!==generation.current)return;
   setNotice(text("บันทึกแหล่งข้อมูลแล้ว การคำนวณบิลยังต้องใช้ข้อมูลจริงที่ถูกต้องครบงวด","Billing source saved. Calculation still requires valid actual readings for the period."));
   setState(result.state);
   if(result.state)setDraft(billingSourceDraft(result.state));
   else setError(text("บันทึกแล้ว แต่โหลดสถานะไม่สำเร็จ กรุณาโหลดข้อมูลใหม่ ห้ามสร้างไซต์ซ้ำ","Saved, but status could not be reloaded. Reload actual data to continue.")+(result.reloadError?": "+result.reloadError:""));
   onBindingSaved?.();
  }catch(error){
   if(requestId===generation.current)setError(text("บันทึกแหล่งข้อมูลไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุด ตรวจสอบสิทธิ์และ Profile แล้วลองอีกครั้ง","Unable to save source. Reload current data, check permission and profile, then try again.")+": "+(error instanceof Error?error.message:""));
  }finally{setBusy(false);}
 };
 const pendingNotice=setupPending&&!state?.binding?text("สร้างไซต์และบันทึกอุปกรณ์แล้ว โปรดเลือกแหล่งข้อมูลและวัตถุประสงค์เพื่อเตรียมการคำนวณบิล หากปิดหน้าต่างสามารถกลับมาแก้ไขไซต์นี้ได้","Site created and devices saved. Choose the billing source and physical purpose to finish setup. You can close this dialog and continue by editing this site."):"";
 const pathField=state?.eligibleFields.find(field=>field.sourceTag===draft.sourceTag)??(state?.eligibleFields.length===1?state.eligibleFields[0]:undefined);
 const pathTag=pathField?.sourceTag;
 const sourcePath=pathTag?billingSourcePath(receiveConfig,pathTag):undefined;
 if(fetching)return <section aria-label={text("กำลังโหลดแหล่งข้อมูลบิล","Loading billing source")}><Skeleton className="h-28 w-full"/><p className="mt-2 text-sm text-muted-foreground">{text("กำลังโหลดแหล่งข้อมูลบิล…","Loading billing source…")}</p></section>;
 return <div ref={panelRef} className="min-w-0">{state&&loadedFor.current===siteId?<BillingSourcePanel state={state} draft={draft} onChange={setDraft} onSave={()=>void save()} onReload={()=>void reload()} locale={locale} profilePending={profilePending||staleProfile} busy={busy} {...(error?{error}:{})} {...(notice||pendingNotice?{notice:notice||pendingNotice}:{})} {...(sourcePath?{sourcePath}:{})}/>:<Alert><AlertTitle>{text("การตั้งค่าแหล่งข้อมูลบิลยังรอดำเนินการ","Billing source setup pending")}</AlertTitle><AlertDescription>{notice||pendingNotice}{error&&<p>{error}</p>}<Button type="button" variant="outline" disabled={busy} onClick={()=>void reload()}>{text("โหลดข้อมูลจริงใหม่","Reload actual data")}</Button></AlertDescription></Alert>}</div>;
}
