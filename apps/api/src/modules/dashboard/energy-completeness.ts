import type { DashboardEnergy } from '@solar/api-contracts';

interface EnergyRow {site_id:string;observedValue:string|null;quality:string}
/** Observed amounts are independent of completeness; unavailable is never zero. */
export function energyCompleteness(ids:string[],rows:EnergyRow[]):DashboardEnergy {
 let observedKwh:number|null=null,completeSites=0,partialSites=0,unavailableSites=0;
 for(const id of ids){
  const site=rows.filter(row=>row.site_id===id);
  const observed=site.filter(row=>row.observedValue!==null);
  if(!observed.length){unavailableSites++;continue;}
  observedKwh=(observedKwh??0)+observed.reduce((sum,row)=>sum+Number(row.observedValue),0);
  if(site.every(row=>row.quality==='complete'))completeSites++;else partialSites++;
 }
 return {observedKwh,quality:observedKwh===null?'unavailable':completeSites===ids.length?'complete':'partial',completeSites,partialSites,unavailableSites};
}
