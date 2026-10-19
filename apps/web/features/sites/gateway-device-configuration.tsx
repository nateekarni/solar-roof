'use client';

import * as React from 'react';
import type {GatewayRegisterMapping} from '@solar/api-contracts';
import {Alert,AlertDescription,AlertTitle} from '../../components/ui/alert';
import {Badge} from '../../components/ui/badge';
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from '../../components/ui/card';
import {Field,FieldDescription,FieldError,FieldGroup,FieldLabel} from '../../components/ui/field';
import {Input} from '../../components/ui/input';
import {Switch} from '../../components/ui/switch';
import {Textarea} from '../../components/ui/textarea';
import {DeviceProfileEditor} from './device-profile-editor';
import type {PayloadRevision} from './payload-contracts';
import {PresetPicker,type LegacyPreset} from './preset-picker';
import type {DeviceDraft} from './site-form-values';
import {
  selectGatewayDevicePreset,selectGatewayRegisterPreset,validateGatewayOnboardingDraft,
  type GatewayOnboardingDeviceDraft,
  type GatewayOnboardingDraft,
} from './gateway-onboarding-draft';
import {RegisterDecoderFields,applyRegisterDecoderCommit,commitRegisterDecoderDraft,createRegisterDecoderDraft,type RegisterDecoderDraft} from './register-decoder-editor';

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

type EditableGatewayMapping=GatewayRegisterMapping&GatewayOnboardingDeviceDraft['config']['fields'][number];

export function parseGatewayConnectionDraft(value:string,locale:string):{connection:GatewayOnboardingDeviceDraft['connection'];error:string}{
  const th=locale==='th';
  try{
    const parsed=JSON.parse(value) as unknown;
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error(th?'Connection ต้องเป็น JSON object':'Connection must be a JSON object.');
    return {connection:parsed as GatewayOnboardingDeviceDraft['connection'],error:''};
  }catch(cause){return {connection:{},error:cause instanceof Error?cause.message:(th?'Connection JSON ไม่ถูกต้อง':'Invalid connection JSON.')};}
}

function mappingLabel(source:GatewayOnboardingDeviceDraft['mappingSource'],th:boolean){
  if(source==='preset')return th?'ตรงกับ Preset':'Matched preset';
  if(source==='gateway')return th?'Mapping จากเกตเวย์':'Gateway mapping';
  return th?'กำหนดเอง':'Manual configuration';
}

function matchLabel(state:GatewayDeviceMatchState,th:boolean){
  const labels:Record<GatewayDeviceMatchState,[string,string]>={
    disabled:['ปิดใช้งาน','Disabled'],matched_preset:['ตรงกับ Preset','Matched preset'],matched_by_model:['ตรงจากรุ่น','Matched by model'],
    manual:['กำหนดเอง','Manual configuration'],gateway:['Mapping จากเกตเวย์','Gateway mapping'],no_mapping:['ไม่มี Mapping','No mapping'],invalid_configuration:['การตั้งค่าไม่ถูกต้อง','Invalid configuration'],
  };
  return labels[state][th?0:1];
}

function ConnectionEditor({device,onChange,locale}:{device:GatewayOnboardingDeviceDraft;onChange:(device:GatewayOnboardingDeviceDraft)=>void;locale:string}){
  const th=locale==='th';
  const [raw,setRaw]=React.useState(()=>JSON.stringify(device.connection,null,2));
  const [error,setError]=React.useState('');
  const locallyPublished=React.useRef(device.connection);
  React.useEffect(()=>{
    if(device.connection!==locallyPublished.current){locallyPublished.current=device.connection;setRaw(JSON.stringify(device.connection,null,2));setError('');}
  },[device.key,device.connection]);
  function updateConnection(value:string){
    setRaw(value);
    const parsed=parseGatewayConnectionDraft(value,locale);
    setError(parsed.error);
    locallyPublished.current=parsed.connection;
    onChange({...device,connection:parsed.connection,dirty:true});
  }
  return <FieldGroup className="grid gap-3 sm:grid-cols-2">
    <Field>
      <FieldLabel htmlFor={`gateway-device-protocol-${device.key}`}>{th?'โปรโตคอล':'Protocol'}</FieldLabel>
      <Input id={`gateway-device-protocol-${device.key}`} value={device.protocol} onChange={event=>onChange({...device,protocol:event.target.value,dirty:true})}/>
    </Field>
    <Field data-invalid={Boolean(error)||undefined}>
      <FieldLabel htmlFor={`gateway-device-connection-${device.key}`}>{th?'การเชื่อมต่อ (JSON)':'Connection (JSON)'}</FieldLabel>
      <Textarea id={`gateway-device-connection-${device.key}`} className="min-h-24 font-mono text-xs" value={raw} aria-invalid={Boolean(error)||undefined} onChange={event=>updateConnection(event.target.value)}/>
      <FieldDescription>{th?'ใส่ค่าจริงจากอุปกรณ์ ระบบจะไม่สร้างค่าให้เอง':'Use the device values; the system does not fabricate connection settings.'}</FieldDescription>
      {error&&<FieldError>{error}</FieldError>}
    </Field>
  </FieldGroup>;
}

function DeviceMetadataEditor({device,onChange,locale}:{device:GatewayOnboardingDeviceDraft;onChange:(device:GatewayOnboardingDeviceDraft)=>void;locale:string}){
  const th=locale==='th';
  const fields=[
    {key:'manufacturer',label:th?'ผู้ผลิต':'Manufacturer',value:device.manufacturer??''},
    {key:'model',label:th?'รุ่น':'Model',value:device.model},
    {key:'firmwareVersion',label:th?'เวอร์ชันเฟิร์มแวร์':'Firmware version',value:device.firmwareVersion??''},
    {key:'serialNumber',label:th?'หมายเลขซีเรียล':'Serial number',value:device.serialNumber},
  ] as const;
  return <FieldGroup className="grid gap-3 sm:grid-cols-2">
    {fields.map(field=><Field key={field.key}><FieldLabel htmlFor={`gateway-device-${field.key}-${device.key}`}>{field.label}</FieldLabel><Input id={`gateway-device-${field.key}-${device.key}`} value={field.value} onChange={event=>onChange({...device,[field.key]:event.target.value,dirty:true})}/></Field>)}
    <Field><FieldLabel htmlFor={`gateway-device-type-${device.key}`}>{th?'ประเภทอุปกรณ์':'Device type'}</FieldLabel><Input id={`gateway-device-type-${device.key}`} value={device.config.deviceType} onChange={event=>onChange(applyGatewayDeviceEditorChange(device,{...device,config:{...device.config,deviceType:event.target.value},dirty:true,profileDirty:true}))}/></Field>
  </FieldGroup>;
}

function MappingDecoderEditor({device,index,mapping,onChange,locale}:{device:GatewayOnboardingDeviceDraft;index:number;mapping:EditableGatewayMapping;onChange:(device:GatewayOnboardingDeviceDraft)=>void;locale:string}){
  const [draft,setDraft]=React.useState<RegisterDecoderDraft>(()=>createRegisterDecoderDraft(mapping));
  const [error,setError]=React.useState('');
  React.useEffect(()=>{setDraft(createRegisterDecoderDraft(mapping));setError('');},[device.key,mapping]);
  const issueKey=`${mapping.tag}:${index}`;
  function withIssues(source:GatewayOnboardingDeviceDraft,issues:Record<string,string>):GatewayOnboardingDeviceDraft{
    const {decoderDraftIssues:ignored,...clean}=source;void ignored;
    return Object.keys(issues).length?{...clean,decoderDraftIssues:issues}:clean;
  }
  function publishIssue(issue:string){
    const issues={...(device.decoderDraftIssues??{})};
    if(issue)issues[issueKey]=issue;else delete issues[issueKey];
    onChange(withIssues(device,issues));
  }
  function change(next:RegisterDecoderDraft){
    setDraft(next);
    const result=commitRegisterDecoderDraft(next);
    const issue=result.ok?'':result.issue;
    setError(issue);publishIssue(issue);
  }
  function commit(next:RegisterDecoderDraft){
    const result=commitRegisterDecoderDraft(next);
    if(!result.ok){setError(result.issue);publishIssue(result.issue);return;}
    setError('');
    const {unit:ignoredUnit,pollingIntervalSeconds:ignoredPolling,...decoder}=result.value;
    void ignoredUnit;void ignoredPolling;
    const fields=device.config.fields.map((current,currentIndex)=>currentIndex===index?applyRegisterDecoderCommit(current,decoder):current);
    const nextDevice=applyGatewayDeviceEditorChange(device,{...device,config:{...device.config,fields}});
    const issues={...(nextDevice.decoderDraftIssues??{})};delete issues[issueKey];
    onChange(withIssues(nextDevice,issues));
  }
  return <RegisterDecoderFields idPrefix={`gateway-register-${device.key}-${index}`} draft={draft} onChange={change} onCommit={commit} locale={locale} error={error}/>;
}

function ModbusRegisterEditor({device,onChange,locale}:{device:GatewayOnboardingDeviceDraft;onChange:(device:GatewayOnboardingDeviceDraft)=>void;locale:string}){
  const th=locale==='th';
  if(!/^modbus/i.test(device.protocol))return null;
  return <Card size="sm"><CardHeader className="border-b py-4"><CardTitle>{th?'ตัวถอดรหัส Modbus':'Modbus register decoder'}</CardTitle><CardDescription>{th?'ระบุค่าจริงของรีจิสเตอร์ ระบบจะไม่ใส่ค่าเริ่มต้นแทน':'Enter the actual decoder values; no physical defaults are invented.'}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 py-4">
    {device.config.fields.map((source,index)=>{const mapping=source as EditableGatewayMapping;return <Card key={`${mapping.tag}-${index}`} size="sm"><CardHeader className="py-3"><CardTitle>{mapping.displayName}</CardTitle><CardDescription>{mapping.tag}</CardDescription></CardHeader><CardContent className="py-3">
      <MappingDecoderEditor device={device} index={index} mapping={mapping} onChange={onChange} locale={locale}/>
    </CardContent></Card>})}
  </CardContent></Card>;
}

export function GatewayDeviceConfiguration({draft,presets,legacyPresets=[],onChange,locale}:{
  draft:GatewayOnboardingDraft;
  presets:PayloadRevision[];
  legacyPresets?:LegacyPreset[];
  onChange:(draft:GatewayOnboardingDraft)=>void;
  locale:string;
}){
  const th=locale==='th';
  const [presetErrors,setPresetErrors]=React.useState<Record<string,string>>({});
  const validationIssue=validateGatewayOnboardingDraft(draft,locale);
  const clearPresetError=(deviceKey:string)=>setPresetErrors(current=>clearGatewayPresetError(current,deviceKey));
  function update(index:number,device:GatewayOnboardingDeviceDraft){
    onChange({...draft,devices:draft.devices.map((current,currentIndex)=>currentIndex===index?device:current)});
  }
  function withoutPresetSelectionIssue(device:GatewayOnboardingDeviceDraft){
    const issues={...(device.decoderDraftIssues??{})};delete issues['preset-selection'];
    const {decoderDraftIssues:ignored,...clean}=device;void ignored;
    return Object.keys(issues).length?{...clean,decoderDraftIssues:issues}:clean;
  }
  return <div className="flex flex-col gap-4">
    {validationIssue&&<Alert variant="destructive"><AlertTitle>{th?'ต้องตรวจสอบการตั้งค่าอุปกรณ์':'Device configuration needs attention'}</AlertTitle><AlertDescription>{validationIssue}</AlertDescription></Alert>}
    {draft.devices.map((device,index)=>{const state=gatewayDeviceMatchState(draft,device,locale);return <Card key={device.key} size="sm">
      <CardHeader className="border-b py-4">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>{device.reported.deviceId} · {device.reported.model??(th?'ไม่ระบุรุ่น':'Model not reported')}</span>
          <span className="flex flex-wrap gap-1"><Badge variant={state==='invalid_configuration'?'destructive':device.enabled?'secondary':'outline'}>{matchLabel(state,th)}</Badge>{state==='disabled'&&<Badge variant="outline">{mappingLabel(device.mappingSource,th)}</Badge>}</span>
        </CardTitle>
        <CardDescription>{device.reported.manufacturer??'—'} · {device.reported.firmwareVersion??(th?'ไม่ระบุเฟิร์มแวร์':'Firmware not reported')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 py-4">
        <Field orientation="horizontal" data-disabled={!device.enabled||undefined}>
          <FieldLabel htmlFor={`gateway-device-enabled-${device.key}`}>
            <Field>
              <div className="flex items-center justify-between gap-3">
                <span>{th?'เปิดใช้งานอุปกรณ์':'Enable device'}</span>
                <Switch id={`gateway-device-enabled-${device.key}`} checked={device.enabled} onCheckedChange={enabled=>update(index,{...device,enabled})}/>
              </div>
              <FieldDescription>{th?'อุปกรณ์ที่เปิดใช้งานต้องมีข้อมูลและ Mapping ครบ':'Enabled devices require complete details and mappings.'}</FieldDescription>
            </Field>
          </FieldLabel>
        </Field>

        {!device.enabled?<Alert>
          <AlertTitle>{th?'ยังไม่รวมอุปกรณ์นี้ในการตั้งค่า':'Device excluded from this configuration'}</AlertTitle>
          <AlertDescription>{th?'อุปกรณ์ที่ปิดไว้สามารถกลับมากรอกข้อมูลให้ครบภายหลังได้':'A disabled device can be completed later.'}</AlertDescription>
        </Alert>:<>
          {device.suggestedPreset&&<Alert>
            <AlertTitle>{th?'พบ Preset ที่อาจตรงกัน':'Preset suggestion available'}</AlertTitle>
            <AlertDescription>{th?`ชนิด ${device.suggestedPreset.kind} ต้องเลือกยืนยันเองก่อน ระบบจะไม่คัดลอก Mapping อัตโนมัติ`:`Suggested ${device.suggestedPreset.kind} preset. Select it explicitly; mappings are never copied automatically.`}</AlertDescription>
          </Alert>}
          {presetErrors[device.key]&&<Alert variant="destructive"><AlertTitle>{th?'ใช้ Preset นี้ไม่ได้':'Preset cannot be applied'}</AlertTitle><AlertDescription>{presetErrors[device.key]}</AlertDescription></Alert>}
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
          <ConnectionEditor device={device} onChange={next=>update(index,next)} locale={locale}/>
          <DeviceMetadataEditor device={device} onChange={next=>update(index,next)} locale={locale}/>
          <DeviceProfileEditor
            value={device}
            onChange={next=>update(index,applyGatewayDeviceEditorChange(device,next))}
            revisions={presets}
            locale={locale}
            identityLocked
            showMetadata={false}
            showPreset={false}
            showErrors
            showAdvanced={false}
          />
          <ModbusRegisterEditor device={device} onChange={next=>update(index,next)} locale={locale}/>
        </>}
      </CardContent>
    </Card>})}
  </div>;
}
