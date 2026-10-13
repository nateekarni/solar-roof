import {createHmac,createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function encodeBase32(bytes:Buffer):string {
 let bits=0,value=0,out='';
 for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}
 if(bits)out+=alphabet[(value<<(5-bits))&31];
 return out;
}
function decodeBase32(secret:string):Buffer {
 let bits=0,value=0;const out:number[]=[];
 for(const char of secret){const index=alphabet.indexOf(char);if(index<0)throw Error('Invalid authenticator secret');value=(value<<5)|index;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}
 return Buffer.from(out);
}
export function totpCode(secret:string,counter:number,digits=6):string {
 const message=Buffer.alloc(8);message.writeBigUInt64BE(BigInt(counter));
 const mac=createHmac('sha1',decodeBase32(secret)).update(message).digest();
 const offset=mac[mac.length-1]!&15;
 return ((mac.readUInt32BE(offset)&0x7fffffff)%10**digits).toString().padStart(digits,'0');
}
export function matchTotpCounter(secret:string,code:string,now:number,lastCounter:number):number|null {
 if(!/^\d{6}$/.test(code))return null;
 const current=Math.floor(now/30000);
 for(const counter of [current,current-1,current+1])if(counter>=0&&counter>lastCounter&&timingSafeEqual(Buffer.from(totpCode(secret,counter)),Buffer.from(code)))return counter;
 return null;
}
function encryptionKey(value:string|undefined):Buffer {
 if(!value||! /^[a-fA-F0-9]{64}$/.test(value))throw Error('TOTP_ENCRYPTION_KEY must contain 64 hexadecimal characters');
 return Buffer.from(value,'hex');
}
export function encryptSecret(secret:string,userId:string,key:string|undefined):string {
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(key),nonce);cipher.setAAD(Buffer.from(userId));
 const ciphertext=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);
 return ['v1',nonce.toString('base64url'),cipher.getAuthTag().toString('base64url'),ciphertext.toString('base64url')].join('.');
}
export function decryptSecret(encrypted:string,userId:string,key:string|undefined):string {
 const [version,nonce,tag,ciphertext]=encrypted.split('.');if(version!=='v1'||!nonce||!tag||!ciphertext)throw Error('Invalid encrypted authenticator secret');
 const decipher=createDecipheriv('aes-256-gcm',encryptionKey(key),Buffer.from(nonce,'base64url'));decipher.setAAD(Buffer.from(userId));decipher.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString('utf8');
}
