export type ComparisonResult={siteId:string;site:string;value:number|null};
export type ComparisonRow={siteId:string;site:string;values:Record<string,number|null>};
export function mergeComparisonResults(results:{metric:string;rows:ComparisonResult[]}[]):ComparisonRow[]{
 const merged=new Map<string,ComparisonRow>();
 for(const {metric,rows} of results)for(const row of rows){const target=merged.get(row.siteId)??{siteId:row.siteId,site:row.site,values:{}};target.values[metric]=row.value;merged.set(row.siteId,target);}
 return [...merged.values()].map(row=>({...row,values:Object.fromEntries(results.map(({metric})=>[metric,row.values[metric]??null]))}));
}
export async function loadComparisonResults(metrics:string[],fetchMetric:(metric:string)=>Promise<ComparisonResult[]>){
 return mergeComparisonResults(await Promise.all(metrics.map(async metric=>({metric,rows:await fetchMetric(metric)}))));
}
