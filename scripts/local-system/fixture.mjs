import {createHash} from 'node:crypto';
export const marker='solar-local-system-20261012';
export const password='SolarLocal2026!';
export const id=key=>{const h=createHash('sha256').update(marker+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
export function validateReplacement({databaseUrl,backupBytes,oldUsers}){
 const u=new URL(databaseUrl);
 if(u.hostname!=='127.0.0.1'||u.port!=='15449'||u.pathname!=='/solar_financial_flow_review'||u.search||u.hash||!['postgres:','postgresql:'].includes(u.protocol))throw Error('Exact local financial database required');
 if(backupBytes<10000)throw Error('Full backup required');
 if(oldUsers.some(u=>!/@(?:example\.test|solar-platform\.invalid)$/.test(u.email)))throw Error('Unrecognized account; refusing replacement');
}
export function cutoffInstant(month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('YYYY-MM required');
 const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m,1)-7*3600000).toISOString();
}
