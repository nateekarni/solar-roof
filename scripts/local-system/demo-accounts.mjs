const staffProfiles={
 owner:[
  {email:'owner@demo.solar.test',name:'ธนกฤต วัฒนาภิรมย์'},
  {email:'owner.backup@demo.solar.test',name:'พิมพ์ชนก ศรีวัฒน์'},
 ],
 admin:[
  {email:'admin@demo.solar.test',name:'กิตติศักดิ์ จันทร์ประเสริฐ'},
  {email:'admin.backup@demo.solar.test',name:'อรทัย สุขเกษม'},
 ],
 operator:[
  {email:'operator@demo.solar.test',name:'ภาคภูมิ อินทร์แก้ว'},
  {email:'operator.backup@demo.solar.test',name:'ณัฐชา พงศ์ไพบูลย์'},
 ],
 accountant:[
  {email:'accountant@demo.solar.test',name:'ชนาภา รัตนวาณิช'},
  {email:'accountant.backup@demo.solar.test',name:'วรพล ตั้งสุวรรณ'},
 ],
};

const customerContacts={
 'BKK-LKB-001':'สิริพร วัฒนกิจ',
 'SPK-BPL-002':'ธนพงศ์ เกียรติไพบูลย์',
 'PTT-KLG-003':'วรัญญา สุขประเสริฐ',
 'AYA-BPI-004':'กฤตภาส นาคะวัฒน์',
 'CBI-SRC-005':'พรทิพย์ จิรเมธากุล',
 'RYG-PLD-006':'อภิชาติ แสงสุวรรณ',
 'NPT-SMP-007':'ชลธิชา วัฒนวงศ์',
 'NMA-MUE-008':'พีรณัฐ ตั้งเจริญ',
 'CMI-SKP-009':'ณิชาภัทร อินทนนท์',
 'SKA-HDY-010':'ศุภชัย มณีรัตน์',
};

const siteValue=(site,...keys)=>keys.map(key=>site[key]).find(value=>value!==undefined&&value!==null);
const normalizedSite=site=>({
 siteId:siteValue(site,'siteId','id'),
 siteCode:siteValue(site,'code','external_site_id','externalSiteId'),
 siteName:siteValue(site,'name','siteName'),
 customerId:siteValue(site,'customerId','customer_id'),
 customerName:siteValue(site,'customer','customer_name','customerName'),
});
const primaryFirst=(role,a,b)=>{
 const rank=value=>value.email===`${role}@example.test`||value.email===`${role}@demo.solar.test`?0:value.email.includes('.backup@')||new RegExp(`^${role}2@`).test(value.email)?1:2;
 return rank(a)-rank(b)||a.email.localeCompare(b.email)||String(a.id).localeCompare(String(b.id));
};

export function buildDemoAccounts(existingUsers,inputSites){
 const sites=inputSites.map(normalizedSite);
 const siteByCustomer=new Map(sites.map(site=>[site.customerId,site]));
 if(sites.length!==10||siteByCustomer.size!==10)throw Error('Ten unique customer sites are required');
 const accounts=[];
 for(const [role,profiles] of Object.entries(staffProfiles)){
  const users=existingUsers.filter(user=>user.role===role).sort((a,b)=>primaryFirst(role,a,b));
  if(users.length!==profiles.length)throw Error(`Expected ${profiles.length} ${role} accounts`);
  users.forEach((user,index)=>accounts.push({id:user.id,email:profiles[index].email,role,name:profiles[index].name}));
 }
 const customers=existingUsers.filter(user=>user.role==='customer_user');
 if(customers.length!==sites.length)throw Error('One customer account per site is required');
 for(const user of customers){
  const site=siteByCustomer.get(user.customer_id??user.customerId);
  if(!site)throw Error(`Customer ${user.id} is not assigned to a fixture site`);
  const contact=customerContacts[site.siteCode];
  if(!contact)throw Error(`Missing contact profile for ${site.siteCode}`);
  accounts.push({
   id:user.id,
   email:`billing.${site.siteCode.toLowerCase()}@customer.solar.test`,
   role:user.role,
   name:`${contact} · ${site.customerName}`,
   siteId:site.siteId,
   siteCode:site.siteCode,
   siteName:site.siteName,
   customerId:site.customerId,
   customerName:site.customerName,
  });
 }
 const emails=accounts.map(account=>account.email);
 if(new Set(emails).size!==emails.length)throw Error('Demo account emails must be unique');
 const roleOrder=new Map(['owner','admin','operator','accountant','customer_user'].map((role,index)=>[role,index]));
 return accounts.sort((a,b)=>{
  const roleDifference=roleOrder.get(a.role)-roleOrder.get(b.role);
  if(roleDifference)return roleDifference;
  if(a.role==='customer_user')return a.siteCode.localeCompare(b.siteCode);
  return Number(a.email.includes('.backup@'))-Number(b.email.includes('.backup@'))||a.email.localeCompare(b.email);
 });
}
