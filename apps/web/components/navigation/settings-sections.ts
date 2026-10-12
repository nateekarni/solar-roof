import {canVisitPage} from '@solar/domain';
import {effectivePageAccess,type AuthorizationSnapshot} from '../../lib/effective-page-access';
export interface SettingsSection {key:string;label:[string,string];items:{href:string;label:[string,string]}[]}
export function settingsSections(role:string,authorization?:AuthorizationSnapshot):SettingsSection[]{
 const sections:SettingsSection[]=[
 {key:'business',label:['ตั้งค่าธุรกิจ','Business settings'],items:[{href:'/settings/company',label:['บริษัทและบัญชี','Company and accounts']},{href:'/settings/rates',label:['อัตราค่าไฟ','Tariffs']}]},
 {key:'technical',label:['ตั้งค่าเกตเวย์','Gateway settings'],items:[{href:'/settings/system',label:['การรับข้อมูล','Data reception']},{href:'/settings/meter-presets',label:['แม่แบบอุปกรณ์','Device templates']}]},
 {key:'team',label:['ทีมงานและสิทธิ์','Staff and permissions'],items:[{href:'/settings/users',label:['พนักงานและสิทธิ์','Staff and permissions']}]},
 {key:'audit',label:['ประวัติการทำงาน','Audit'],items:[{href:'/settings/audit',label:['ประวัติการทำงาน','Audit']}]},
 {key:'account',label:['บัญชีของฉัน','My Account'],items:[{href:'/settings/account',label:['บัญชีของฉัน','My Account']}]},
 ];
 return sections.filter(s=>s.key!=='business'||role!=='admin').filter(s=>s.key!=='technical'||role!=='owner').map(s=>({...s,items:s.items.filter(i=>effectivePageAccess({role,...(authorization?{authorization}:{})},i.href))})).filter(s=>s.items.length);
}
