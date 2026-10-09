export interface OrganizationReference {id:string;name:string;code:string}
export interface OrganizationDocumentDefaults {
 legalName?:string;taxId?:string;taxBranch?:string;taxAddress?:string;contactName?:string;phone?:string;documentEmail?:string;
}
export interface OrganizationDraft extends OrganizationDocumentDefaults {name:string;code:string}
export interface OrganizationRecord extends OrganizationReference,OrganizationDocumentDefaults {updatedAt?:string}
export type OrganizationSelection={kind:'existing';organization:OrganizationRecord}|{kind:'new';organization:OrganizationDraft};
const normalized=(text:string)=>text.trim().toLocaleLowerCase();
export function filterOrganizations(organizations:OrganizationRecord[],text:string){
 const query=normalized(text);return organizations.filter(o=>normalized(o.name).includes(query)||normalized(o.code).includes(query));
}
export function selectOrganizationText(organizations:OrganizationRecord[],text:string,code:string=''):OrganizationSelection|null{
 const name=text.trim();if(!name)return null;
 const matches=organizations.filter(o=>normalized(o.name)===normalized(name));
 return matches.length===1?{kind:'existing',organization:matches[0]!}:{kind:'new',organization:{name,code}};
}
/** Existing selections send an ID only; drafts are committed by the site transaction. */
export function organizationSitePayload(selection:OrganizationSelection|null){
 if(!selection)return null;
 return selection.kind==='existing'?{schoolId:selection.organization.id}:{newOrganization:selection.organization};
}
export function organizationDocumentComplete(organization:OrganizationDocumentDefaults){
 return Boolean(organization.legalName?.trim()&&/^[0-9]{13}$/.test(organization.taxId?.trim()??'')&&organization.taxAddress?.trim());
}
export function contractOrganizationDefaults(organization:OrganizationDocumentDefaults){
 return {companyName:organization.legalName??'',taxId:organization.taxId??'',branch:organization.taxBranch??'',taxAddress:organization.taxAddress??'',billingPhone:organization.phone??'',billingEmail:organization.documentEmail??''};
}



export function organizationOptionIndex(current:number,count:number,direction:'up'|'down'){if(!count)return -1;if(current<0)return direction==='down'?0:count-1;return (current+(direction==='down'?1:-1)+count)%count;}
