'use client';

import * as React from 'react';
import type {ConfirmGatewayResponse,DiscoveredGatewayRow} from '@solar/api-contracts';
import {GatewayTelemetryRequiredNotice} from './gateway-telemetry-required';
import {useQueryClient} from '@tanstack/react-query';
import {AlertTriangle,Radio} from 'lucide-react';
import {Alert,AlertAction,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {Accordion,AccordionContent,AccordionItem,AccordionTrigger} from '../../components/ui/accordion';
import {Badge} from '../../components/ui/badge';
import {Button} from '../../components/ui/button';
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '../../components/ui/card';
import {Dialog,DialogBody,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '../../components/ui/dialog';
import {Skeleton} from '../../components/ui/skeleton';
import {Spinner} from '../../components/ui/spinner';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '../../components/ui/tabs';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '../../components/ui/table';
import {apiClient} from '../../lib/api-client';
import {focusErrorElement} from '../../lib/form-feedback';
import {useLocale} from '../../providers/locale-provider';
import {GatewayDeviceConfiguration} from './gateway-device-configuration';
import {GatewayDiscoveryReview,type GatewayPairingSiteOption} from './gateway-discovery-review';
import {
  applySuggestedGatewayPresets,gatewayConfirmationRequest,gatewayOnboardingDraftFromDetail,gatewayOnboardingIssue,isStaleDiscoveryConflict,
  validateGatewayOnboardingDraft,type GatewayDiscoveryDetail,type GatewayOnboardingDraft,
} from './gateway-onboarding-draft';
import {confirmGatewayWithoutCaching,correctInitialGatewayConfig,isGatewayTelemetryRequired,useDiscoveredGateway,useGatewaySyncState} from './gateway-onboarding-api';
import {GatewaySyncStatus,type OneTimeGatewayCredential} from './gateway-sync-status';
import type {PayloadRevision} from './payload-contracts';
import type {LegacyPreset} from './preset-picker';

export const GATEWAY_PAIRING_STEPS=[
  {id:'review',th:'ตรวจสอบและเลือกไซต์',en:'Review & select site'},
  {id:'devices',th:'ตั้งค่าอุปกรณ์',en:'Configure devices'},
  {id:'confirm',th:'ยืนยันและซิงก์',en:'Confirm & sync'},
] as const;
export type GatewayPairingStep=(typeof GATEWAY_PAIRING_STEPS)[number]['id'];

export function gatewayPairingStepIssue(step:GatewayPairingStep,draft:GatewayOnboardingDraft,locale:string):string|null {
  const th=locale==='th';
  if(!draft.selectedSiteId)return th?'กรุณาเลือกไซต์งาน':'Select a site.';
  if(step==='review')return null;
  return validateGatewayOnboardingDraft(draft,locale);
}

export function reloadGatewayPairingDraft(detail:GatewayDiscoveryDetail,sites:readonly GatewayPairingSiteOption[],presets:readonly PayloadRevision[]=[],legacyPresets:readonly LegacyPreset[]=[]){
  return applySuggestedGatewayPresets(gatewayOnboardingDraftFromDetail(detail,sites),presets,legacyPresets);
}

export function reconcileGatewayPairingDraft(current:GatewayOnboardingDraft|null,detail:GatewayDiscoveryDetail,sites:readonly GatewayPairingSiteOption[],catalogReady:boolean,presets:readonly PayloadRevision[]=[],legacyPresets:readonly LegacyPreset[]=[]):{draft:GatewayOnboardingDraft|null;stale:boolean}{
  if(!catalogReady)return {draft:current,stale:false};
  if(!current||current.discoveryId!==detail.id)return {draft:reloadGatewayPairingDraft(detail,sites,presets,legacyPresets),stale:false};
  return {draft:applySuggestedGatewayPresets(current,presets,legacyPresets),stale:current.discoveryRevision!==detail.discoveryRevision};
}

export function gatewayPairingSurface(confirmed:boolean,loading:boolean,detailError:boolean):'sync'|'loading'|'error'|'draft' {
  if(confirmed)return 'sync';
  if(loading)return 'loading';
  if(detailError)return 'error';
  return 'draft';
}

export function GatewayPairingSummary({draft,sites,locale}:{draft:GatewayOnboardingDraft;sites:readonly GatewayPairingSiteOption[];locale:string}){
  const th=locale==='th';
  const site=sites.find(option=>option.id===draft.selectedSiteId);
  const defaultDeviceKey=draft.devices.find(device=>device.enabled)?.key??draft.devices[0]?.key;
  const mapping=(source:GatewayOnboardingDraft['devices'][number]['mappingSource'])=>source==='preset'?(th?'Preset':'Preset'):source==='gateway'?(th?'Mapping จากเกตเวย์':'Gateway mapping'):(th?'กำหนดเอง':'Manual configuration');
  return <div data-slot="gateway-confirmation-summary" className="flex flex-col gap-4">
    <div className="flex flex-wrap gap-2"><Badge variant="outline">{draft.reported.gateway.gatewayId}</Badge><Badge variant="outline">{site?.name??(th?'ยังไม่เลือกไซต์':'No site selected')}</Badge><Badge variant="secondary">{th?`${draft.devices.filter(device=>device.enabled).length} อุปกรณ์ที่เปิดใช้`:`${draft.devices.filter(device=>device.enabled).length} enabled devices`}</Badge></div>
    <Accordion type="single" collapsible {...(defaultDeviceKey?{defaultValue:defaultDeviceKey}:{})} className="gap-3">
      {draft.devices.map(device=>{const connectionEntries=Object.entries(device.connection??{}).filter(([,value])=>value!==undefined&&value!==null&&value!=='');const hasDecoder=device.config.fields.some(field=>field.registerAddress!==undefined);return <Card key={device.key} data-slot="gateway-confirmation-device" size="sm">
        <AccordionItem value={device.key} className="border-0">
          <CardHeader className="!p-0">
            <AccordionTrigger className="items-center px-4 py-3 hover:no-underline">
              <div className="flex min-w-0 flex-1 flex-col gap-1 pr-3">
                <CardTitle className="flex flex-wrap items-center gap-2"><span>{device.externalDeviceId}</span><Badge variant={device.enabled?'secondary':'outline'}>{device.enabled?(th?'เปิดใช้งาน':'Enabled'):(th?'ปิดไว้':'Disabled')}</Badge></CardTitle>
                <CardDescription>{mapping(device.mappingSource)} · {th?`${device.config.fields.length} ฟิลด์`:`${device.config.fields.length} ${device.config.fields.length===1?'field':'fields'}`}</CardDescription>
              </div>
            </AccordionTrigger>
          </CardHeader>
          <AccordionContent className="border-t !pb-0">
            <CardContent className="flex flex-col gap-3 !p-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">{th?'ผู้ผลิต':'Manufacturer'}</dt><dd>{device.manufacturer||'—'}</dd></div>
          <div><dt className="text-muted-foreground">{th?'รุ่น':'Model'}</dt><dd>{device.model||'—'}</dd></div>
          <div><dt className="text-muted-foreground">{th?'เฟิร์มแวร์':'Firmware'}</dt><dd>{device.firmwareVersion||'—'}</dd></div>
          <div><dt className="text-muted-foreground">{th?'หมายเลขซีเรียล':'Serial number'}</dt><dd>{device.serialNumber||'—'}</dd></div>
          <div><dt className="text-muted-foreground">{th?'ประเภทอุปกรณ์':'Device type'}</dt><dd>{device.config.deviceType||'—'}</dd></div>
          <div><dt className="text-muted-foreground">{th?'โปรโตคอล':'Protocol'}</dt><dd>{device.protocol||'—'}</dd></div>
          <div><dt className="text-muted-foreground">{th?'กลุ่มการอ่าน':'Poll groups'}</dt><dd>{device.config.pollGroups.join(', ')||'—'}</dd></div>
          <div><dt className="text-muted-foreground">{th?'แหล่งที่มา':'Preset provenance'}</dt><dd>{mapping(device.mappingSource)}{device.presetId?` · ${device.presetId}`:''}{device.presetVersion?` · ${device.presetVersion}`:''}</dd></div>
          <div><dt className="text-muted-foreground">{th?'โปรไฟล์':'Profile'}</dt><dd>{device.profileId??device.config.sourceProfile?.id??'—'}{(device.profileVersion??device.config.sourceProfile?.version)?` · ${device.profileVersion??device.config.sourceProfile?.version}`:''}</dd></div>
          {device.suggestedPreset&&<div><dt className="text-muted-foreground">{th?'คำแนะนำ (ยังไม่เลือก)':'Suggestion (not selected)'}</dt><dd>{device.suggestedPreset.kind} · {device.suggestedPreset.id}</dd></div>}
        </dl>
        {connectionEntries.length>0&&<div data-slot="gateway-confirmation-connection-summary"><p className="mb-2 text-sm text-muted-foreground">{th?'การเชื่อมต่อ':'Connection'}</p><dl className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">{connectionEntries.map(([key,value])=><div key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="break-all">{typeof value==='object'?JSON.stringify(value):String(value)}</dd></div>)}</dl></div>}
        <div className="flex flex-col gap-2"><p className="text-sm text-muted-foreground">{th?'Mapping ที่อนุมัติ':'Approved mappings'}</p><div className="overflow-x-auto rounded-lg border"><Table data-slot="gateway-confirmation-mapping-table"><TableHeader><TableRow><TableHead>{th?'ฟิลด์':'Field'}</TableHead><TableHead>{th?'กลุ่ม':'Group'}</TableHead><TableHead>{th?'หน่วยและการแปลง':'Units & conversion'}</TableHead><TableHead>{th?'บทบาท':'Role'}</TableHead>{hasDecoder&&<TableHead>{th?'รีจิสเตอร์':'Register'}</TableHead>}</TableRow></TableHeader><TableBody>{device.config.fields.map((field,index)=>{const decoder=field as typeof field&{registerCount?:number;dataType?:string;byteOrder?:string;wordOrder?:string;scale?:number;offset?:number};return <TableRow key={`${field.tag}-${index}`}><TableCell><span className="font-medium">{field.displayName}</span><span className="block text-xs text-muted-foreground">{field.sourceTag??field.tag}</span></TableCell><TableCell>{field.pollGroup}</TableCell><TableCell>{field.sourceUnit||'—'} → {field.targetUnit||'—'}<span className="block text-xs text-muted-foreground">{field.conversion}</span></TableCell><TableCell>{field.role&&field.role!=='none'?field.role:'—'}</TableCell>{hasDecoder&&<TableCell>{field.registerAddress?<><span>{field.registerAddress} · {decoder.dataType??'—'} × {decoder.registerCount??'—'}</span><span className="block text-xs text-muted-foreground">{decoder.byteOrder??'—'} · {decoder.wordOrder??'—'} · Scale {decoder.scale??'—'} · Offset {decoder.offset??'—'}</span></>:'—'}</TableCell>}</TableRow>})}</TableBody></Table></div></div>
            </CardContent>
          </AccordionContent>
        </AccordionItem>
      </Card>})}
    </Accordion>
  </div>;
}

interface ConfirmedPairing {gatewayId:string;authenticationMode:ConfirmGatewayResponse['authenticationMode'];syncState:ConfirmGatewayResponse['syncState']}
interface ScopedGatewayCredential {gatewayId:string;value:OneTimeGatewayCredential}
export function visibleGatewayPairingCredential(credential:ScopedGatewayCredential|null,gatewayId:string):OneTimeGatewayCredential|null {
  return credential?.gatewayId===gatewayId?credential.value:null;
}

export interface GatewayPairingOperation {epoch:number;signal:AbortSignal}

/** Invalidate late plaintext responses whenever the dialog lifecycle changes. */
export function createGatewayPairingOperationGuard(initiallyOpen=false){
  let epoch=0,open=initiallyOpen,controller:AbortController|null=null;
  const invalidate=(nextOpen:boolean)=>{open=nextOpen;epoch+=1;controller?.abort();controller=null;};
  return {
    open:()=>invalidate(true),
    close:()=>invalidate(false),
    begin:()=>{controller?.abort();controller=new AbortController();return {epoch,signal:controller.signal} satisfies GatewayPairingOperation;},
    isCurrent:(operation:GatewayPairingOperation)=>open&&operation.epoch===epoch&&!operation.signal.aborted,
  };
}

export interface GatewayDetailReloadOperation {epoch:number;generation:number;discoveryId:string;signal:AbortSignal}
export function createGatewayDetailReloadGuard(){
  let epoch=0,generation=0,open=false,currentId='',controller:AbortController|null=null;
  const abort=()=>{controller?.abort();controller=null;};
  const isCurrent=(operation:GatewayDetailReloadOperation)=>open&&!operation.signal.aborted&&operation.epoch===epoch&&operation.generation===generation&&operation.discoveryId===currentId;
  return {
    open:(discoveryId:string)=>{abort();epoch+=1;generation=0;open=true;currentId=discoveryId;},
    close:()=>{abort();epoch+=1;generation=0;open=false;currentId='';},
    begin:(discoveryId:string)=>{abort();generation+=1;controller=new AbortController();return {epoch,generation,discoveryId,signal:controller.signal};},
    isCurrent,
    canApply:(operation:GatewayDetailReloadOperation,result:{isSuccess:boolean;isError:boolean;data:{id:string}|undefined})=>isCurrent(operation)&&result.isSuccess&&!result.isError&&result.data?.id===currentId,
  };
}

export const canDismissGatewayPairing=(confirming:boolean,rotating:boolean)=>!confirming&&!rotating;

function PairingBody({discovered,open,onOpenChange,onSuccess,inline=false}:{discovered:DiscoveredGatewayRow;open:boolean;onOpenChange:(open:boolean)=>void;onSuccess:()=>void;inline?:boolean}){
  const locale=useLocale(),th=locale==='th';
  const [sites,setSites]=React.useState<GatewayPairingSiteOption[]>([]);
  const [presets,setPresets]=React.useState<PayloadRevision[]>([]);
  const [legacyPresets,setLegacyPresets]=React.useState<LegacyPreset[]>([]);
  const [catalogLoading,setCatalogLoading]=React.useState(false);
  const [catalogReady,setCatalogReady]=React.useState(false);
  const [draft,setDraft]=React.useState<GatewayOnboardingDraft|null>(null);
  const [step,setStep]=React.useState<GatewayPairingStep>('review');
  const [maxStep,setMaxStep]=React.useState(0);
  const [error,setError]=React.useState('');
  const [showDeviceErrors,setShowDeviceErrors]=React.useState(false);
  const [validationAttempt,setValidationAttempt]=React.useState(0);
  const [stale,setStale]=React.useState(false);
  const [confirmed,setConfirmed]=React.useState<ConfirmedPairing|null>(null);
  const [credential,setCredential]=React.useState<ScopedGatewayCredential|null>(null);
  const [rotating,setRotating]=React.useState(false);
  const [confirming,setConfirming]=React.useState(false);
  const [reloading,setReloading]=React.useState(false);
  const queryClient=useQueryClient();
  const [operationGuard]=React.useState(()=>createGatewayPairingOperationGuard(open));
  const [reloadGuard]=React.useState(()=>createGatewayDetailReloadGuard());
  const detailQuery=useDiscoveredGateway(discovered.id,open&&!confirmed);
  const syncQuery=useGatewaySyncState(confirmed?.gatewayId,open&&Boolean(confirmed));

  React.useEffect(()=>{if(open){operationGuard.open();reloadGuard.open(discovered.id);}else{operationGuard.close();reloadGuard.close();}},[open,discovered.id,operationGuard,reloadGuard]);
  React.useEffect(()=>()=>{operationGuard.close();reloadGuard.close();},[operationGuard,reloadGuard]);

  React.useEffect(()=>{
    if(!open)return;
    let active=true;
    setCatalogLoading(true);setCatalogReady(false);setError('');
    void Promise.all([
      apiClient.get<GatewayPairingSiteOption[]>('/v1/gateways/site-options?includeAssigned=true'),
      apiClient.get<PayloadRevision[]>('/v1/settings/payload-presets'),
      apiClient.get<LegacyPreset[]>('/v1/meter-presets'),
    ]).then(([nextSites,nextPresets,nextLegacyPresets])=>{if(active){setSites(nextSites);setPresets(nextPresets);setLegacyPresets(nextLegacyPresets);}})
      .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:(th?'โหลดข้อมูลประกอบไม่สำเร็จ':'Could not load pairing options.'));})
      .finally(()=>{if(active){setCatalogLoading(false);setCatalogReady(true);}});
    return()=>{active=false;};
  },[open,discovered.id,th]);

  React.useEffect(()=>{
    if(!open){setDraft(null);setCredential(null);setConfirmed(null);setStale(false);setConfirming(false);setRotating(false);setReloading(false);setShowDeviceErrors(false);setValidationAttempt(0);return;}
    setStep('review');setMaxStep(0);setCredential(null);setConfirmed(null);setStale(false);setReloading(false);setShowDeviceErrors(false);setValidationAttempt(0);
  },[open,discovered.id]);

  React.useEffect(()=>{
    const detail=detailQuery.data;
    if(!open||!detail||detail.id!==discovered.id)return;
    setDraft(current=>{
      const reconciled=reconcileGatewayPairingDraft(current,detail,sites,catalogReady,presets,legacyPresets);
      if(reconciled.stale)setStale(true);
      return reconciled.draft;
    });
  },[open,discovered.id,detailQuery.data,catalogReady,sites,presets,legacyPresets]);

  const currentIndex=GATEWAY_PAIRING_STEPS.findIndex(item=>item.id===step);
  const stepIssue=draft?gatewayPairingStepIssue(step,draft,locale):null;
  const identityConflictIssue=discovered.identityConflict
    ?(th?'Gateway ID ที่อ้างถูกใช้งานโดย Gateway Serial อื่น ให้แก้ Gateway ID ที่เครื่องแล้วส่ง telemetry ใหม่':'The claimed Gateway ID is already used by another Gateway Serial. Change the Gateway ID on the device and publish telemetry again.')
    :null;
  const confirmationIssue=identityConflictIssue??(draft?gatewayPairingStepIssue('confirm',draft,locale):(th?'กำลังโหลดข้อมูล':'Loading pairing draft.'));
  const syncState=syncQuery.data??confirmed?.syncState??null;

  const busy=confirming||rotating;
  function changeOpen(nextOpen:boolean){if(!nextOpen&&!canDismissGatewayPairing(confirming,rotating))return;if(!nextOpen){operationGuard.close();reloadGuard.close();setCredential(null);setConfirmed(null);setConfirming(false);setRotating(false);}onOpenChange(nextOpen);}
  function next(){
    if(!draft)return;
    if(stepIssue){
      setError('');
      if(step==='devices'){
        setShowDeviceErrors(true);
        setValidationAttempt(attempt=>attempt+1);
        const issue=gatewayOnboardingIssue(draft,locale);
        const targetId=issue?.fieldId??(issue?.deviceKey?`gateway-device-card-${issue.deviceKey}`:undefined);
        if(targetId)requestAnimationFrame(()=>requestAnimationFrame(()=>{const target=document.getElementById(targetId);if(target)focusErrorElement(target);}));
      }else if(step==='review'){
        requestAnimationFrame(()=>{const target=document.querySelector<HTMLElement>('[aria-invalid="true"]');if(target)focusErrorElement(target);});
      }
      return;
    }
    const nextIndex=Math.min(currentIndex+1,GATEWAY_PAIRING_STEPS.length-1);
    setMaxStep(value=>Math.max(value,nextIndex));setStep(GATEWAY_PAIRING_STEPS[nextIndex]!.id);setError('');setShowDeviceErrors(false);
  }
  async function reload(){
    setError('');
    const operation=reloadGuard.begin(discovered.id);
    setReloading(true);
    try{
      const result=await detailQuery.refetch({cancelRefetch:true});
      if(reloadGuard.canApply(operation,result)&&result.data){setDraft(reloadGatewayPairingDraft(result.data,sites,presets,legacyPresets));setStale(false);setStep('review');setMaxStep(0);setShowDeviceErrors(false);}
    }finally{if(reloadGuard.isCurrent(operation))setReloading(false);}
  }
  async function confirm(){
    if(!draft||confirmationIssue||stale||confirming)return;
    const operation=operationGuard.begin();
    setConfirming(true);
    setError('');
    try{
      const request=gatewayConfirmationRequest(draft,detailQuery.data?.discoveryRevision??draft.discoveryRevision);
      const result=await confirmGatewayWithoutCaching(queryClient,draft.discoveryId,request,operation.signal);
      if(!operationGuard.isCurrent(operation))return;
      setCredential(result.credential?{gatewayId:discovered.id,value:result.credential}:null);
      setConfirmed({gatewayId:result.gatewayId,authenticationMode:result.authenticationMode,syncState:result.syncState});onSuccess();
    }catch(cause){
      if(!operationGuard.isCurrent(operation))return;
      if(isStaleDiscoveryConflict(cause)){setStale(true);setError('');}
      else setError(cause instanceof Error?cause.message:(th?'ยืนยันการเชื่อมต่อไม่สำเร็จ':'Pairing confirmation failed.'));
    }finally{if(operationGuard.isCurrent(operation))setConfirming(false);}
  }
  async function rotate(){
    if(!confirmed||rotating)return;
    const operation=operationGuard.begin();
    setRotating(true);setError('');
    try{const next=await apiClient.post<OneTimeGatewayCredential>(`/v1/gateways/${encodeURIComponent(confirmed.gatewayId)}/credentials/rotate`,{},{signal:operation.signal});if(operationGuard.isCurrent(operation))setCredential({gatewayId:discovered.id,value:next});}
    catch(cause){if(operationGuard.isCurrent(operation))setError(cause instanceof Error?cause.message:(th?'หมุนรหัสเชื่อมต่อไม่สำเร็จ':'Credential rotation failed.'));}
    finally{if(operationGuard.isCurrent(operation))setRotating(false);}
  }

  const loading=(detailQuery.isPending&&!detailQuery.data)||catalogLoading||!catalogReady;
  const surface=gatewayPairingSurface(Boolean(confirmed),loading,detailQuery.isError);
  const content=<>
    <DialogHeader><DialogTitle><Radio/>{th?'เชื่อมต่อเกตเวย์กับไซต์งาน':'Pair gateway to site'}</DialogTitle><DialogDescription>{confirmed?(confirmed.authenticationMode==='demo-anonymous'?(th?'เชื่อมต่อเรียบร้อยและเริ่มรับข้อมูลได้โดยไม่ต้องตั้งค่าบัญชีบน Gateway':'Connected and ready to receive data without configuring a gateway account.'):(th?'ตั้งค่าข้อมูลเชื่อมต่อบนเครื่องและติดตามการซิงก์':'Configure the credential on the gateway and monitor synchronization.')):(th?'ตรวจสอบข้อมูล เลือกไซต์ และอนุมัติการตั้งค่าก่อนเริ่มรับข้อมูล':'Review reported facts, select a site, and approve configuration before data collection.')}</DialogDescription></DialogHeader>
    <DialogBody>
      {surface==='sync'&&syncState?<GatewaySyncStatus locale={locale} credential={visibleGatewayPairingCredential(credential,discovered.id)} authenticationMode={confirmed!.authenticationMode} syncState={syncState} syncError={syncQuery.isError?syncQuery.error:null} onRetry={()=>syncQuery.refetch()} retrying={syncQuery.isFetching} onRotate={rotate} rotating={rotating} onCorrect={request=>correctInitialGatewayConfig(queryClient,confirmed!.gatewayId,request)}/>
      :surface==='loading'?<div className="flex flex-col gap-3" aria-label={th?'กำลังโหลดขั้นตอนเชื่อมต่อ':'Loading pairing workflow'}><Skeleton className="h-10 w-full"/><Skeleton className="h-48 w-full"/></div>
      :surface==='error'&&isGatewayTelemetryRequired(detailQuery.error)?<div className="space-y-3"><GatewayTelemetryRequiredNotice gateway={discovered} locale={locale}/><Button type="button" size="sm" variant="outline" onClick={()=>void detailQuery.refetch()}>{th?'ตรวจสอบอีกครั้ง':'Check again'}</Button></div>
      :surface==='error'?<Alert variant="destructive"><AlertTitle>{th?'โหลดข้อมูลเกตเวย์ไม่สำเร็จ':'Could not load gateway details'}</AlertTitle><AlertDescription>{detailQuery.error instanceof Error?detailQuery.error.message:(th?'โปรดลองอีกครั้ง':'Try again.')}</AlertDescription><AlertAction><Button type="button" size="sm" variant="outline" onClick={()=>void detailQuery.refetch()}>{th?'ลองอีกครั้ง':'Retry'}</Button></AlertAction></Alert>
      :draft?<div className="flex flex-col gap-4">
        {identityConflictIssue&&<Alert variant="destructive"><AlertTriangle/><AlertTitle>{th?'รหัส Gateway ซ้ำกับเครื่องที่เชื่อมต่อแล้ว':'Gateway ID conflicts with a connected device'}</AlertTitle><AlertDescription>{identityConflictIssue}</AlertDescription></Alert>}
        <Tabs value={step} onValueChange={value=>{const index=GATEWAY_PAIRING_STEPS.findIndex(item=>item.id===value);if(index>=0&&index<=maxStep)setStep(value as GatewayPairingStep);}}>
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1">{GATEWAY_PAIRING_STEPS.map((item,index)=><TabsTrigger key={item.id} value={item.id} disabled={index>maxStep} aria-label={th?item.th:item.en}><span className="whitespace-normal text-center">{th?item.th:item.en}</span></TabsTrigger>)}</TabsList>
          <TabsContent value="review" className="pt-4"><GatewayDiscoveryReview draft={draft} sites={sites} onSiteChange={siteId=>setDraft({...draft,selectedSiteId:siteId})} locale={locale}/></TabsContent>
          <TabsContent value="devices" className="pt-4"><GatewayDeviceConfiguration draft={draft} presets={presets} legacyPresets={legacyPresets} onChange={setDraft} locale={locale} showErrors={showDeviceErrors} validationAttempt={validationAttempt}/></TabsContent>
          <TabsContent value="confirm" className="pt-4"><div className="flex flex-col gap-3"><GatewayPairingSummary draft={draft} sites={sites} locale={locale}/>{confirmationIssue&&<Alert variant="destructive"><AlertTriangle/><AlertTitle>{th?'ยังยืนยันไม่ได้':'Cannot confirm yet'}</AlertTitle><AlertDescription>{confirmationIssue}</AlertDescription></Alert>}</div></TabsContent>
        </Tabs>
        {stale&&<Alert variant="destructive"><AlertTriangle/><AlertTitle>{th?'ข้อมูลจากเกตเวย์เปลี่ยนแล้ว':'Gateway snapshot changed'}</AlertTitle><AlertDescription>{th?'ปิดการยืนยันไว้เพื่อไม่ให้เขียนทับข้อมูลใหม่ โหลด Snapshot ล่าสุดทั้งหมดก่อนดำเนินการต่อ':'Confirmation is disabled to protect the newer report. Reload the complete latest snapshot before continuing.'}</AlertDescription><AlertAction><Button type="button" size="sm" variant="outline" disabled={reloading} onClick={()=>void reload()}>{reloading&&<Spinner data-icon="inline-start"/>}{th?'โหลดข้อมูลล่าสุด':'Reload latest snapshot'}</Button></AlertAction></Alert>}
      </div>:<Alert><AlertTitle>{th?'ยังไม่มี Snapshot':'Snapshot unavailable'}</AlertTitle><AlertDescription>{th?'รอ telemetry ล่าสุดจากเกตเวย์':'Waiting for the latest gateway telemetry.'}</AlertDescription></Alert>}
      {error&&<Alert variant="destructive" className="mt-4"><AlertTitle>{th?'ดำเนินการไม่สำเร็จ':'Action failed'}</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {busy&&<Alert className="mt-4"><Spinner/><AlertTitle>{th?'กำลังเชื่อมต่อเกตเวย์':'Connecting gateway'}</AlertTitle><AlertDescription>{th?'โปรดรอจนเสร็จ หน้าต่างนี้จะปิดไม่ได้ระหว่างดำเนินการ':'Please wait. This dialog cannot be dismissed while the request is in flight.'}</AlertDescription></Alert>}
    </DialogBody>
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={()=>changeOpen(false)}>{confirmed?(th?'ปิด':'Close'):(th?'ยกเลิก':'Cancel')}</Button>{!confirmed&&draft&&<div className="flex gap-2">{currentIndex>0&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setStep(GATEWAY_PAIRING_STEPS[currentIndex-1]!.id)}>{th?'ย้อนกลับ':'Back'}</Button>}{step!=='confirm'?<Button type="button" disabled={busy} aria-disabled={Boolean(stepIssue)||undefined} className={stepIssue?'opacity-50':undefined} onClick={next}>{th?'ถัดไป':'Next'}</Button>:<Button type="button" disabled={Boolean(confirmationIssue)||stale||confirming} onClick={()=>void confirm()}>{confirming&&<Spinner data-icon="inline-start"/>}{th?'ยืนยันและเริ่มซิงก์':'Confirm and start sync'}</Button>}</div>}</DialogFooter>
  </>;

  if(inline)return <div>{content}</div>;
  return <Dialog open={open} onOpenChange={changeOpen}><DialogContent className="sm:max-w-4xl max-h-[92svh]" showCloseButton={!busy} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}>{content}</DialogContent></Dialog>;
}

export function PairDiscoveredGatewayDialog({canOnboard,open,onOpenChange,discovered,onSuccess,inline=false}:{canOnboard:boolean;open:boolean;onOpenChange:(open:boolean)=>void;discovered:DiscoveredGatewayRow|null;onSuccess:()=>void;inline?:boolean}){
  if(!canOnboard||!discovered)return null;
  return <PairingBody discovered={discovered} open={open} onOpenChange={onOpenChange} onSuccess={onSuccess} inline={inline}/>;
}
