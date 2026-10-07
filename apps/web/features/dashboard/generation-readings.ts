export type GenerationSite={siteId:string;siteName:string;generationKw:number|null;generationTimestamp:string|null};
export function isFreshGeneration(site:GenerationSite,now:number){const at=Date.parse(site.generationTimestamp??'');return site.generationKw!==null&&Number.isFinite(site.generationKw)&&site.generationKw>=0&&Number.isFinite(at)&&now-at>=0&&now-at<=120000;}
export function generationTotal(sites:GenerationSite[]|null,now:number):number|null{return sites?.length&&sites.every(site=>isFreshGeneration(site,now))?sites.reduce((sum,site)=>sum+site.generationKw!,0):null;}
