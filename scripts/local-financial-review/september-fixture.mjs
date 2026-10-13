import {createHash} from 'node:crypto';
export const fixtureMarker='september-2026-billing-v2';
export const fixtureId=key=>createHash('sha256').update(fixtureMarker+':'+key).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
export const accounts=[
 {key:'admin',email:'admin.september@example.test',role:'admin'},
 {key:'owner',email:'owner.september@example.test',role:'owner'},
 {key:'operator',email:'operator.september@example.test',role:'operator'},
 {key:'accountant',email:'accountant.september@example.test',role:'accountant'},
 {key:'customer',email:'customer.september@example.test',role:'customer_user',customerKey:'customer'},
];
export function septemberReadings(){
 const start=Date.parse('2026-09-01T00:00:00+07:00'),weights=[1,2,3,4,5,6,6,5,4,3,2,1];
 let energyWh=10000000;const rows=[{time:new Date(start).toISOString(),meterWh:energyWh,loggerWh:20000000,powerW:0}];
 for(let day=0;day<30;day++){
  const dailyWh=(400+(day%7-3)*20)*1000;let allocated=0;
  for(let hour=0;hour<24;hour++){
   const slot=hour-6;const increment=slot>=0&&slot<12?(slot===11?dailyWh-allocated:Math.floor(dailyWh*weights[slot]/42)):0;
   allocated+=increment;energyWh+=increment;
   rows.push({time:new Date(start+(day*24+hour+1)*3600000).toISOString(),meterWh:energyWh,loggerWh:20000000+Math.round((energyWh-10000000)*1.03),powerW:increment});
  }
 }
 return rows;
}
