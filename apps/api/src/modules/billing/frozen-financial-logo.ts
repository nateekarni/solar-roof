import { decodeCompanyImage } from '../settings/company-image.js';

export function frozenFinancialLogo(saved:string|undefined,current:string|undefined,fallback:string):string{
 if(saved)return saved;
 return current?.startsWith('data:') ? decodeCompanyImage(current,'Logo')!.dataUri : fallback;
}
