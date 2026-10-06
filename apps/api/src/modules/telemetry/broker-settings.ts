import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const brokerSettings = z.object({
 name: z.string().trim().min(1).max(100),
 host: z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/),
 port: z.coerce.number().int().min(1).max(65535),
 protocol: z.enum(['mqtt','mqtts','ws','wss']),
 path: z.string().max(256).default('/mqtt'),
 username: z.string().max(256).default(''),
 password: z.string().max(1024).default(''),
}).superRefine((v,c)=>{
 if(v.port===18083)c.addIssue({code:'custom',message:'18083 is the EMQX dashboard port, not MQTT',path:['port']});
 if(!/^\/[A-Za-z0-9/_-]*$/.test(v.path))c.addIssue({code:'custom',message:'Invalid WebSocket path',path:['path']});
});
export function brokerUrl(v:z.infer<typeof brokerSettings>) {
 const host=v.host.includes(':')&&!v.host.startsWith('[')?`[${v.host}]`:v.host;
 return `${v.protocol}://${host}:${v.port}${v.protocol.startsWith('ws')?v.path:''}`;
}
function key(){const secret=process.env.MQTT_CREDENTIAL_SECRET||process.env.JWT_REFRESH_SECRET;if(!secret)throw Error('MQTT credential encryption key is missing');return createHash('sha256').update(secret).digest();}
export function encryptBrokerPassword(value:string){if(!value)return '';const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),data].map(b=>b.toString('base64')).join('.');}
export function decryptBrokerPassword(value:string){if(!value)return '';const [iv,tag,data]=value.split('.').map(v=>Buffer.from(v,'base64'));const cipher=createDecipheriv('aes-256-gcm',key(),iv!);cipher.setAuthTag(tag!);return Buffer.concat([cipher.update(data!),cipher.final()]).toString('utf8');}
