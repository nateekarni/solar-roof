import type {OrganizationDraft} from '../organization/organization-selection';
export function siteServicePayload(site:{name:string;capacity:number;externalSiteId:string;latitude:string;longitude:string},customer:OrganizationDraft){
 const latitude=site.latitude.trim(),longitude=site.longitude.trim();
 if(Boolean(latitude)!==Boolean(longitude))throw new Error('Provide both coordinates or neither / กรุณาระบุพิกัดทั้งสองค่า');
 const lat=latitude?Number(latitude):undefined,lng=longitude?Number(longitude):undefined;
 if(lat!==undefined&&(!Number.isFinite(lat)||Math.abs(lat)>90)||lng!==undefined&&(!Number.isFinite(lng)||Math.abs(lng)>180))throw new Error('Invalid coordinates / พิกัดไม่ถูกต้อง');
 if(!customer.name.trim())throw new Error('Enter customer name / กรุณาระบุชื่อลูกค้า');
 if(customer.taxId?.trim()&&!/^[0-9]{13}$/.test(customer.taxId.trim()))throw new Error('Tax ID must contain 13 digits / เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก');
 if(customer.code.trim()&&!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(customer.code.trim()))throw new Error('Invalid customer code / รหัสลูกค้าไม่ถูกต้อง');
 const name=site.name.trim();
 if(!name||!Number.isFinite(site.capacity)||site.capacity<=0)throw new Error('Enter a site name and positive capacity / ระบุชื่อไซต์และกำลังติดตั้งที่มากกว่าศูนย์');
 const newOrganization={...customer,name:customer.name.trim(),code:customer.code.trim()||undefined};
 return {name,capacityMwp:site.capacity,externalSiteId:site.externalSiteId.trim()||undefined,...(lat===undefined?{}:{latitude:lat,longitude:lng}),newOrganization};
}
