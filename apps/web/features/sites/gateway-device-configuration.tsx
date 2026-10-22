'use client';

import * as React from 'react';
import {Accordion,AccordionContent,AccordionItem,AccordionTrigger} from '../../components/ui/accordion';
import {Badge} from '../../components/ui/badge';
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '../../components/ui/card';
import {Field,FieldDescription,FieldError,FieldGroup,FieldLabel} from '../../components/ui/field';
import {Input} from '../../components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '../../components/ui/select';
import {Switch} from '../../components/ui/switch';
import {DeviceProfileEditor} from './device-profile-editor';
import type {PayloadRevision} from './payload-contracts';
import {PresetPicker,type LegacyPreset} from './preset-picker';
import type {DeviceDraft} from './site-form-values';
import {
  gatewayOnboardingIssue,selectGatewayDevicePreset,selectGatewayRegisterPreset,validateGatewayOnboardingDraft,
  type GatewayOnboardingIssue,
  type GatewayOnboardingDeviceDraft,
  type GatewayOnboardingDraft,
} from './gateway-onboarding-draft';

export type GatewayDeviceMatchState='disabled'|'matched_preset'|'matched_by_model'|'manual'|'gateway'|'no_mapping'|'invalid_configuration';

export function gatewayDeviceMatchState(draft:GatewayOnboardingDraft,device:GatewayOnboardingDeviceDraft,locale:string):GatewayDeviceMatchState {
  if(!device.enabled)return 'disabled';
  if(device.config.fields.length===0)return 'no_mapping';
  const issue=validateGatewayOnboardingDraft({...draft,selectedSiteId:draft.selectedSiteId||'validation-site',devices:[device]},locale);
  if(issue)return 'invalid_configuration';
  if(device.mappingSource==='preset')return 'matched_preset';
  if(device.suggestedPreset)return 'matched_by_model';
  return device.mappingSource;
}

export function applyGatewayDeviceEditorChange(device:GatewayOnboardingDeviceDraft,next:DeviceDraft):GatewayOnboardingDeviceDraft {
  if(JSON.stringify(device.config)===JSON.stringify(next.config))return {...device,...next};
  const {presetId:ignoredPresetId,presetVersion:ignoredPresetVersion,...withoutPreset}=device;
  const {presetId:ignoredNextPresetId,presetVersion:ignoredNextPresetVersion,...nextWithoutPreset}=next as DeviceDraft&Pick<GatewayOnboardingDeviceDraft,'presetId'|'presetVersion'>;
  void ignoredPresetId;void ignoredPresetVersion;
  void ignoredNextPresetId;void ignoredNextPresetVersion;
  return {...withoutPreset,...nextWithoutPreset,mappingSource:'manual',payloadProfileRevisionId:'',sourcePresetRevisionId:''};
}

export function clearGatewayPresetError(errors:Readonly<Record<string,string>>,deviceKey:string):Record<string,string>{
  const next={...errors};delete next[deviceKey];return next;
}

export function parseGatewayConnectionDraft(value:string,locale:string):{connection:GatewayOnboardingDeviceDraft['connection'];error:string}{
  const th=locale==='th';
  try{
    const parsed=JSON.parse(value) as unknown;
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(th?'Connection ต้องเป็น JSON object':'Connection must be a JSON object.');
    return {connection:parsed as GatewayOnboardingDeviceDraft['connection'],error:''};
  }catch(cause){return {connection:{},error:cause instanceof Error?cause.message:(th?'Connection JSON ไม่ถูกต้อง':'Invalid connection JSON.')};}
}

function matchLabel(state:GatewayDeviceMatchState,th:boolean){
  const labels:Record<GatewayDeviceMatchState,[string,string]>={
    disabled:['ปิดใช้งาน','Disabled'],matched_preset:['ตรงกับ Preset','Matched preset'],matched_by_model:['ตรงจากรุ่น','Matched by model'],
    manual:['กำหนดเอง','Manual configuration'],gateway:['Mapping จากเกตเวย์','Gateway mapping'],no_mapping:['ไม่มี Mapping','No mapping'],invalid_configuration:['การตั้งค่าไม่ถูกต้อง','Invalid configuration'],
  };
  return labels[state][th?0:1];
}

const DEVICE_TYPES=['solar-logger','energy-meter','environmental-sensor'] as const;

export function gatewayDeviceTypeLabel(value:string,locale:string):string {
  const th=locale==='th';
  const labels:Record<string,[string,string]>={
    'solar-logger':['เครื่องบันทึกข้อมูลโซลาร์','Solar logger'],
    'energy-meter':['มิเตอร์พลังงาน','Energy meter'],
    'environmental-sensor':['เซนเซอร์สภาพแวดล้อม','Environmental sensor'],
    'environmental_sensor':['เซนเซอร์สภาพแวดล้อม','Environmental sensor'],
  };
  const label=labels[value]?.[th?0:1];
  return label?`${label} (${value})`:value;
}

function DeviceMetadataEditor({device,onChange,locale,issue,showErrors}:{device:GatewayOnboardingDeviceDraft;onChange:(device:GatewayOnboardingDeviceDraft)=>void;locale:string;issue:GatewayOnboardingIssue|null;showErrors:boolean}){
  const th=locale==='th';
  const fields=[
    {key:'manufacturer',label:th?'ผู้ผลิต':'Manufacturer',value:device.manufacturer??''},
    {key:'model',label:th?'รุ่น':'Model',value:device.model},
    {key:'firmwareVersion',label:th?'เวอร์ชันเฟิร์มแวร์':'Firmware version',value:device.firmwareVersion??''},
    {key:'serialNumber',label:th?'หมายเลขซีเรียล':'Serial number',value:device.serialNumber},
  ] as const;
  return <FieldGroup className="grid gap-3 sm:grid-cols-2">
    {fields.map(field=>{const id=`gateway-device-${field.key}-${device.key}`,invalid=showErrors&&issue?.fieldId===id;return <Field key={field.key} data-invalid={invalid||undefined}><FieldLabel htmlFor={id}>{field.label}</FieldLabel><Input id={id} aria-invalid={invalid||undefined} value={field.value} onChange={event=>onChange({...device,[field.key]:event.target.value,dirty:true})}/>{invalid&&<FieldError>{issue.message}</FieldError>}</Field>})}
    {(()=>{const id=`gateway-device-type-${device.key}`,invalid=showErrors&&issue?.fieldId===id,current=device.config.deviceType;return <Field className="sm:col-span-2" data-invalid={invalid||undefined}>
      <FieldLabel htmlFor={id}>{th?'ประเภทอุปกรณ์':'Device type'}</FieldLabel>
      <Select value={current} onValueChange={deviceType=>onChange(applyGatewayDeviceEditorChange(device,{...device,config:{...device.config,deviceType},dirty:true,profileDirty:true}))}>
        <SelectTrigger id={id} aria-invalid={invalid||undefined}><SelectValue placeholder={th?'เลือกประเภทอุปกรณ์':'Select device type'}/></SelectTrigger>
        <SelectContent>
          {DEVICE_TYPES.map(value=><SelectItem key={value} value={value}>{gatewayDeviceTypeLabel(value,locale)}</SelectItem>)}
          {current&&!DEVICE_TYPES.includes(current as typeof DEVICE_TYPES[number])&&<SelectItem value={current}>{gatewayDeviceTypeLabel(current,locale)}</SelectItem>}
        </SelectContent>
      </Select>
      <FieldDescription>{th?'ระบบใช้ประเภทนี้เพื่อตีความข้อมูล เลือกแดชบอร์ด และคำนวณรายการที่เกี่ยวข้อง':'Used to interpret telemetry, choose dashboard behavior, and calculate related records.'}</FieldDescription>
      {invalid&&<FieldError>{issue.message}</FieldError>}
    </Field>})()}
  </FieldGroup>;
}

export function GatewayDeviceConfiguration({draft,presets,legacyPresets=[],onChange,locale,showErrors=false,validationAttempt=0}:{
  draft:GatewayOnboardingDraft;
  presets:PayloadRevision[];
  legacyPresets?:LegacyPreset[];
  onChange:(draft:GatewayOnboardingDraft)=>void;
  locale:string;
  showErrors?:boolean;
  validationAttempt?:number;
}){
  const th=locale==='th';
  const [presetErrors,setPresetErrors]=React.useState<Record<string,string>>({});
  const issue=gatewayOnboardingIssue(draft,locale);
  const [openDevice,setOpenDevice]=React.useState(()=>showErrors&&issue?.deviceKey?issue.deviceKey:(draft.devices[0]?.key??''));
  const validationDeviceKey=issue?.deviceKey;
  React.useEffect(()=>{
    if(validationAttempt>0&&validationDeviceKey)setOpenDevice(validationDeviceKey);
  },[validationAttempt]);
  const clearPresetError=(deviceKey:string)=>setPresetErrors(current=>clearGatewayPresetError(current,deviceKey));
  function update(index:number,device:GatewayOnboardingDeviceDraft){
    onChange({...draft,devices:draft.devices.map((current,currentIndex)=>currentIndex===index?device:current)});
  }
  function withoutPresetSelectionIssue(device:GatewayOnboardingDeviceDraft){
    const issues={...(device.decoderDraftIssues??{})};delete issues['preset-selection'];
    const {decoderDraftIssues:ignored,...clean}=device;void ignored;
    return Object.keys(issues).length?{...clean,decoderDraftIssues:issues}:clean;
  }
  return <Accordion type="single" collapsible value={openDevice} onValueChange={setOpenDevice} className="flex flex-col gap-3">
    {draft.devices.map((device,index)=>{const state=gatewayDeviceMatchState(draft,device,locale);const deviceIssue=showErrors&&issue?.deviceKey===device.key?issue:null;return <Card key={device.key} id={`gateway-device-card-${device.key}`} size="sm" data-invalid={Boolean(deviceIssue)||undefined}>
      <AccordionItem value={device.key} className="border-0">
        <CardHeader className="!p-0">
          <div data-slot="gateway-device-header" className="relative flex min-h-16 items-center [&>h3]:min-w-0 [&>h3]:flex-1">
            <AccordionTrigger className="min-w-0 flex-1 items-center gap-3 rounded-none px-5 py-4 pr-5 text-left hover:no-underline [&_[data-slot=accordion-trigger-icon]]:absolute [&_[data-slot=accordion-trigger-icon]]:right-5">
              <span className="min-w-0 flex-1">
                <CardTitle className="truncate">{device.reported.deviceId} · {device.reported.model??(th?'ไม่ระบุรุ่น':'Model not reported')}</CardTitle>
                <CardDescription className="mt-0.5 truncate">{device.reported.manufacturer??'—'} · {device.reported.firmwareVersion??(th?'ไม่ระบุเฟิร์มแวร์':'Firmware not reported')}</CardDescription>
              </span>
              <Badge data-slot="gateway-device-status" className="ml-auto mr-20" variant={state==='invalid_configuration'?'destructive':device.enabled?'secondary':'outline'}>{matchLabel(state,th)}</Badge>
            </AccordionTrigger>
            <div data-slot="gateway-device-switch" className="absolute right-12 z-10 flex shrink-0 items-center" onClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}>
              <Switch
                id={`gateway-device-enabled-${device.key}`}
                aria-label={th?`เปิดใช้งานอุปกรณ์ ${device.reported.deviceId}`:`Enable device ${device.reported.deviceId}`}
                checked={device.enabled}
                onCheckedChange={enabled=>{
                  update(index,{...device,enabled});
                  if(!enabled&&openDevice===device.key)setOpenDevice('');
                  if(enabled)setOpenDevice(device.key);
                }}
              />
            </div>
          </div>
        </CardHeader>
        <AccordionContent className="border-t !pb-0">
          <CardContent className="flex flex-col gap-5 !p-5">
          {!device.enabled?<FieldDescription>{th?'ยังไม่รวมอุปกรณ์นี้ในการตั้งค่า สามารถกลับมาเปิดและกรอกข้อมูลให้ครบภายหลังได้':'This device is excluded. A disabled device can be completed later.'}</FieldDescription>:<>
          <div id={`gateway-device-preset-${device.key}`} tabIndex={-1}>
          <PresetPicker
            revisions={presets}
            value={device.presetId??''}
            legacyPresets={legacyPresets}
            legacyValue={legacyPresets.some(preset=>preset.id===device.presetId)?(device.presetId??''):''}
            manual
            label={th?'Preset หรือกำหนดเอง':'Preset or manual configuration'}
            onChange={(_id,preset)=>{
              if(preset){clearPresetError(device.key);update(index,withoutPresetSelectionIssue(selectGatewayDevicePreset(device,preset,true)));}
              else {
                clearPresetError(device.key);
                const {sourceProfile:ignoredSourceProfile,...manualConfig}=device.config;
                void ignoredSourceProfile;
                const {presetId:ignoredPresetId,presetVersion:ignoredPresetVersion,...manualDevice}=device;
                void ignoredPresetId;void ignoredPresetVersion;
                update(index,withoutPresetSelectionIssue({...manualDevice,mappingSource:'manual',payloadProfileRevisionId:'',sourcePresetRevisionId:'',config:manualConfig,dirty:true,profileDirty:true}));
              }
            }}
            onLegacyChange={id=>{
              const preset=legacyPresets.find(candidate=>candidate.id===id);
              if(preset){const selected=selectGatewayRegisterPreset(device,preset);if(selected.ok){clearPresetError(device.key);update(index,withoutPresetSelectionIssue(selected.device));}else{setPresetErrors(current=>({...current,[device.key]:selected.issue}));update(index,{...device,decoderDraftIssues:{...(device.decoderDraftIssues??{}),'preset-selection':selected.issue}});}}
              else {
                clearPresetError(device.key);
                const {presetId:ignoredPresetId,presetVersion:ignoredPresetVersion,...manualDevice}=device;
                void ignoredPresetId;void ignoredPresetVersion;
                update(index,withoutPresetSelectionIssue({...manualDevice,mappingSource:'manual',dirty:true,profileDirty:true}));
              }
            }}
          />
          {presetErrors[device.key]&&<FieldError className="mt-2">{presetErrors[device.key]}</FieldError>}
          </div>
          <DeviceMetadataEditor device={device} onChange={next=>update(index,next)} locale={locale} issue={deviceIssue} showErrors={showErrors}/>
          <div id={`gateway-device-mapping-${device.key}`} tabIndex={-1} aria-invalid={showErrors&&deviceIssue?.section==='mapping'||undefined}>
          <DeviceProfileEditor
            value={device}
            onChange={next=>update(index,applyGatewayDeviceEditorChange(device,next))}
            revisions={presets}
            locale={locale}
            identityLocked
            showMetadata={false}
            showPreset={false}
            showErrors={showErrors&&deviceIssue?.section==='mapping'}
            showAdvanced={false}
          />
          {showErrors&&deviceIssue?.section==='mapping'&&deviceIssue.mappingIndex===undefined&&<FieldError className="mt-2">{deviceIssue.message}</FieldError>}
          </div>
        </>}
          </CardContent>
        </AccordionContent>
      </AccordionItem>
    </Card>})}
  </Accordion>;
}
