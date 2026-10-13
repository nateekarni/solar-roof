export function frozenFinancialLogo(saved:string|undefined,current:string|undefined,fallback:string):string{
 if(saved)return saved;
 return current?.startsWith('data:image/')?current:fallback;
}
