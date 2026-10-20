export type NormalizedPromptPayId={kind:'mobile'|'national_id';value:string};

const PROMPTPAY_AID='A000000677010111';

function tlv(tag:string,value:string):string {
 if(!/^\d{2}$/.test(tag)||value.length>99)throw new Error('Invalid PromptPay TLV');
 return `${tag}${String(value.length).padStart(2,'0')}${value}`;
}

function crc16Ccitt(value:string):string {
 let crc=0xffff;
 for(const character of value){
  crc^=character.charCodeAt(0)<<8;
  for(let bit=0;bit<8;bit++)crc=crc&0x8000?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;
 }
 return crc.toString(16).toUpperCase().padStart(4,'0');
}

export function normalizePromptPayId(id:string):NormalizedPromptPayId {
 const digits=id.replace(/[\s-]/g,'');
 if(/^0\d{9}$/.test(digits))return {kind:'mobile',value:`0066${digits.slice(1)}`};
 if(/^\d{13}$/.test(digits))return {kind:'national_id',value:digits};
 throw new Error('PromptPay identifier must be a Thai mobile number or 13-digit identifier');
}

function normalizeAmount(amount:string):string {
 if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount))throw new Error('Invalid PromptPay amount');
 const [integer,fraction='']=amount.split('.');
 const satang=(fraction+'00').slice(0,2);
 if(BigInt(integer!)*100n+BigInt(satang)<=0n)throw new Error('PromptPay amount must be positive');
 return `${integer}.${satang}`;
}

/** Builds a BOT PromptPay EMVCo payload locally. No identifier leaves the process. */
export function buildPromptPayPayload(id:string,amount?:string):string {
 const normalized=normalizePromptPayId(id);
 const merchant=tlv('00',PROMPTPAY_AID)+tlv(normalized.kind==='mobile'?'01':'02',normalized.value);
 const normalizedAmount=amount===undefined?null:normalizeAmount(amount);
 const content=tlv('00','01')+tlv('01',normalizedAmount?'12':'11')+tlv('29',merchant)+tlv('53','764')+(normalizedAmount?tlv('54',normalizedAmount):'')+tlv('58','TH')+'6304';
 return content+crc16Ccitt(content);
}
