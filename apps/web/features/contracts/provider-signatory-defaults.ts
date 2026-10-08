export type ProviderSignatoryField='signerName'|'signerTitle';
/** A late settings response must preserve both entered values and deliberately cleared fields. */
export function providerSignatoryPatch(defaults:{signatoryName?:string;signatoryTitle?:string},current:Partial<Record<ProviderSignatoryField,string|undefined>>,edited:ReadonlySet<ProviderSignatoryField>):Partial<Record<ProviderSignatoryField,string>> {
 const patch:Partial<Record<ProviderSignatoryField,string>>={};
 for(const [field,value] of [['signerName',defaults.signatoryName],['signerTitle',defaults.signatoryTitle]] as const){
  if(!edited.has(field)&&!current[field]?.trim()&&value?.trim())patch[field]=value.trim();
 }
 return patch;
}
