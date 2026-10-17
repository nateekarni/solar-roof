/** Display fields have an explicit order; IDs and preview metadata remain on the row. */
const fields:Record<string,string[]>={
 sites:['name','externalSiteId','customerName','capacityMwp','status','serviceStartDate'],
 customers:['name','region','capacityMwp','sitesCount','gatewaysCount','status'],
 billing:['period','customerName','siteName','consumedKwh','rate','amount','daysOverdue','status'],
 contracts:['contractNumber','customerName','version','startDate','rate','signers','status'],
 documents:['documentNumber','type','customerName','issueDate','amount','status'],
 receipts:['receiptNumber','taxInvoiceNumber','customerName','issueDate','totalAmount','status'],
 alerts:['alertId','title','detail','severity','occurredAt','status'],
 notifications:['title','channel','recipient','sentAt','status'],
 reports:['title','category','scope','format','status'],
 users:['displayName','email','role','customerName','lastActive','status'],
 audit:['time','action','entityType','entityId','actor','reason'],
};
export function operationKeys(resource:string,row:Record<string,unknown>,idKey='id'):string[]{return fields[resource] || Object.keys(row).filter(key=>key!==idKey);}
const columnLabels:Record<string,[string,string]>={daysOverdue:['จำนวนวันที่ค้างชำระ','Days overdue'],successfulReminderCount:['จำนวนครั้งที่แจ้งเตือนสำเร็จ','Successful reminders'],name:['ชื่อ','Name'],externalSiteId:['รหัสไซต์','Site code'],customerName:['ลูกค้า','Customer'],region:['ภูมิภาค','Region'],capacityMwp:['กำลังติดตั้ง (MWp)','Capacity (MWp)'],status:['สถานะ','Status'],serviceStartDate:['วันที่เริ่มบริการ','Service start date'],period:['รอบบิล','Billing period'],siteName:['ไซต์งาน','Site'],consumedKwh:['พลังงาน (kWh)','Energy (kWh)'],rate:['อัตรา (บาท/kWh)','Rate (THB/kWh)'],amount:['ยอดเงิน (บาท)','Amount (THB)'],slipUrl:['หลักฐานการชำระ','Payment evidence'],receiptNumber:['เลขที่ใบเสร็จ','Receipt number'],taxInvoiceNumber:['เลขที่ใบกำกับภาษี','Tax invoice number'],issueDate:['วันที่ออก','Issue date'],totalAmount:['ยอดเงินสุทธิ (บาท)','Total (THB)'],documentNumber:['เลขที่เอกสาร','Document number'],type:['ประเภท','Type'],contractNumber:['เลขที่สัญญา','Contract number'],version:['เวอร์ชัน','Version'],startDate:['วันเริ่มต้น','Start date'],signers:['คู่สัญญา','Signers'],alertId:['รหัสแจ้งเตือน','Alert code'],title:['หัวข้อ','Title'],detail:['รายละเอียด','Detail'],severity:['ความรุนแรง','Severity'],occurredAt:['เวลาที่เกิด','Occurred at'],channel:['ช่องทาง','Channel'],recipient:['ผู้รับ','Recipient'],sentAt:['เวลาส่ง','Sent at'],category:['หมวดหมู่','Category'],scope:['ขอบเขต','Scope'],format:['รูปแบบ','Format'],displayName:['ชื่อผู้ใช้','Name'],email:['อีเมล','Email'],role:['บทบาท','Role'],lastActive:['ใช้งานล่าสุด','Last active'],time:['วันเวลา','Time'],action:['การดำเนินการ','Action'],entityType:['ประเภทข้อมูล','Resource type'],entityId:['รหัสข้อมูล','Resource ID'],actor:['ผู้ดำเนินการ','Actor'],reason:['เหตุผล','Reason'],sitesCount:['จำนวนไซต์','Sites'],gatewaysCount:['จำนวนเกตเวย์','Gateways']};
export function operationColumnLabel(resource:string,key:string,locale:string,fallback:string){if(key==='name'&&resource==='sites')return locale==='th'?'ชื่อไซต์งาน':'Site name';return columnLabels[key]?.[locale==='en'?1:0]??fallback;}

export function isTemporalColumn(key: string): boolean { return key.toLowerCase().includes("date") || /(?:At|_at)$/.test(key) || key.toLowerCase().includes("time") || key.includes("วัน") || key.includes("เวลา"); }
