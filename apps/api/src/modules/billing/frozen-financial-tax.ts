export function frozenFinancialTax(saved:{taxPercent?:string|number;taxMode?:'inclusive'|'exclusive'}|undefined,currentRate:string|number,inclusive:boolean):{taxPercent:string|number;taxMode:'inclusive'|'exclusive'}{
 return {taxPercent:saved?.taxPercent??currentRate,taxMode:saved?.taxMode??(inclusive?'inclusive':'exclusive')};
}
