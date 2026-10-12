import type {DashboardComparison} from '@solar/api-contracts';
import {comparisonRangeValid} from './refinement';
export function comparisonSeries(sites:DashboardComparison['sites'],key:'production'|'financialDaily',range:DashboardComparison['range']):Record<string,string|number|null>[] {
 if(!comparisonRangeValid(range.start,range.end))return [];
 const start=Date.parse(range.start),end=Date.parse(range.end);
 const values=new Map(sites.map(site=>[site.siteId,new Map(site[key].map(row=>[row.date,row.value]))]));
 return Array.from({length:(end-start)/86400000+1},(_,index)=>{const date=new Date(start+index*86400000).toISOString().slice(0,10);return Object.fromEntries([['date',date],...sites.map(site=>[site.siteId,values.get(site.siteId)?.get(date)??(key==='financialDaily'?0:null)])]);});
}
