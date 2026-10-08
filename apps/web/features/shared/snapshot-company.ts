interface SavedCompany {companyName?:string;company_name?:string;taxId?:string;tax_id?:string;branch?:string;address?:string;phone?:string;email?:string;logoUrl?:string;logo_url?:string;}
export function snapshotCompany(company:SavedCompany|undefined) {
 return {companyName:company?.companyName ?? company?.company_name ?? '',taxId:company?.taxId ?? company?.tax_id ?? '',branch:company?.branch ?? '',address:company?.address ?? '',phone:company?.phone ?? '',email:company?.email ?? '',logoUrl:company?.logoUrl ?? company?.logo_url};
}
