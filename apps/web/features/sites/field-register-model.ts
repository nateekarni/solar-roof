export type FieldRegister={id?:string;registerAddress:string;registerCount:number;wordOrder:string;byteOrder:string;dataType:string;scale:number;unit:string;pollingIntervalSeconds?:number};
export function fieldRegisterPayload(tag:string,value:FieldRegister){return {semanticField:tag,...value};}
