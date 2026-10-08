import { derivedConversion } from "@solar/api-contracts/unit-conversion";
import type { PayloadField } from "./payload-contracts";

export type MeasurementPurpose = "solar-delivered" | "grid-import" | "facility-consumption" | "other";
export interface BillingSourceInput {
 deviceId:string; profileRevisionId:string; sourceTag:string; canonicalTag:"energy.active.import.total";
 sourceUnit:string; targetUnit:"kWh"; conversion:"identity"|"wh-to-kwh"|"auto-v1";
 measurementPurpose:MeasurementPurpose; purposeDescription?:string; billingImpactConfirmed?:boolean;
}
export interface BillingSourceBinding extends Omit<BillingSourceInput,"purposeDescription"> {id:string;meterId?:string;siteId?:string;createdAt?:string;purposeDescription?:string|null}
export interface BillingSourceState {
 binding:BillingSourceBinding|null;
 device:{id:string;name:string;externalDeviceId:string;profileRevisionId:string}|null;
 eligibleFields:Array<PayloadField & {sourceTag:string;canonicalTag:string}>;
 latestVerifiedReading:{id:string;quality:string;unit:string;valueKwh:string|number;sourceTime:string;receivedTime:string;profileRevisionId:string;bindingId:string;fresh:boolean}|null;
 status:"unbound"|"profile-changed"|"verified"|"invalid-data"|"waiting-for-reading"|"ambiguous-meter"|"no-main-meter";
 formula:string;
}
export interface BillingSourceDraft {sourceTag:string;measurementPurpose:MeasurementPurpose|"";purposeDescription:string;confirmed:boolean}
export function billingSourceDraft(state:BillingSourceState):BillingSourceDraft {
 return {sourceTag:state.binding?.sourceTag??"",measurementPurpose:state.binding?.measurementPurpose??"",purposeDescription:state.binding?.purposeDescription??"",confirmed:false};
}
export function buildBillingSourceInput(state:BillingSourceState,draft:BillingSourceDraft,profilePending=false):BillingSourceInput {
 if(profilePending)throw Error("apply-profile-first");
 if(!state.device||["ambiguous-meter","no-main-meter"].includes(state.status))throw Error("main-meter-required");
 if(!draft.sourceTag)throw Error("source-required");
 if(state.eligibleFields.length!==1)throw Error("one-cumulative-field-required");
 const field=state.eligibleFields.find(f=>f.sourceTag===draft.sourceTag);
 if(!field||field.role!=="billing-import"||field.canonicalTag!=="energy.active.import.total"||field.targetUnit!=="kWh"||field.conversion==="varh-to-kvarh")throw Error("invalid-cumulative-field");
 try {
  const derived=derivedConversion(field.sourceUnit,field.targetUnit);
  if(field.conversion!==derived&&!(field.conversion==="auto-v1"&&derived!=="identity")||field.conversion==="auto-v1"&&derived==="identity")throw Error();
 }catch{throw Error("invalid-cumulative-field");}
 if(!["solar-delivered","grid-import","facility-consumption","other"].includes(draft.measurementPurpose))throw Error("purpose-required");
 if(draft.measurementPurpose==="other"&&(!draft.purposeDescription.trim()||draft.purposeDescription.trim().length>1000))throw Error("description-required");
 if(state.binding&&!draft.confirmed)throw Error("confirmation-required");
 return {deviceId:state.device.id,profileRevisionId:state.device.profileRevisionId,sourceTag:draft.sourceTag,canonicalTag:"energy.active.import.total",sourceUnit:field.sourceUnit,targetUnit:"kWh",conversion:field.conversion,measurementPurpose:draft.measurementPurpose as MeasurementPurpose,...(draft.measurementPurpose==="other"?{purposeDescription:draft.purposeDescription.trim()}:{}),...(state.binding?{billingImpactConfirmed:true}:{})};
}

export function billingSourcePath(config:import("./payload-contracts").PayloadReceiveConfig|undefined,sourceTag:string):string { const valuesPath=config?.fieldPaths["data.values"]??(config?.fieldPaths.data?config.fieldPaths.data+".values":"data.values"); return valuesPath+"["+JSON.stringify(sourceTag)+"]"; }

export function billingProfilePending(input:{profileDirty:boolean;selectedRevisionId:string;persistedRevisionId:string;busy:boolean;activatedRevisionId?:string}):boolean { return input.profileDirty||input.busy||input.selectedRevisionId!==input.persistedRevisionId||Boolean(input.activatedRevisionId&&input.activatedRevisionId!==input.persistedRevisionId); }
