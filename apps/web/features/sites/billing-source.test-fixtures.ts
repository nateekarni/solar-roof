import type { BillingSourceState } from "./billing-source-model";
export const sourceState: BillingSourceState = {
 binding:null, device:{id:"device-main",name:"Main meter",externalDeviceId:"METER-001",profileRevisionId:"rev-2"},
 eligibleFields:[{tag:"energy.active.import.total",canonicalTag:"energy.active.import.total",sourceTag:"Import_Wh",displayName:"Cumulative energy",pollGroup:"energy",sourceUnit:"Wh",targetUnit:"kWh",conversion:"wh-to-kwh",role:"billing-import"}],
 latestVerifiedReading:null,status:"unbound",formula:"(closing kWh - opening kWh) × contract rate"
};
