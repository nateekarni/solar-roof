/** Display fields have an explicit order; IDs and preview metadata remain on the row. */
const fields:Record<string,string[]>={
 sites:['name','externalSiteId','schoolName','capacityMwp','gateway','externalGatewayId','protocol','productionKwh','lastUpdated','status'],
 schools:['name','region','capacityMwp','sitesCount','gatewaysCount','status'],
 billing:['period','schoolName','siteName','consumedKwh','rate','amount','slipUrl','status'],
 contracts:['contractNumber','schoolName','version','startDate','rate','signers','status'],
 documents:['documentNumber','type','schoolName','issueDate','amount','status'],
 receipts:['receiptNumber','taxInvoiceNumber','schoolName','issueDate','totalAmount','status'],
 alerts:['alertId','title','detail','severity','occurredAt','status'],
 notifications:['title','channel','recipient','sentAt','status'],
 reports:['title','category','scope','format','status'],
 users:['displayName','email','role','schoolName','lastActive','status'],
 audit:['time','action','entityType','entityId','actor','reason'],
};
export function operationKeys(resource:string,row:Record<string,unknown>,idKey='id'):string[]{return fields[resource] || Object.keys(row).filter(key=>key!==idKey);}

export function isTemporalColumn(key: string): boolean { return key.toLowerCase().includes("date") || /(?:At|_at)$/.test(key) || key.toLowerCase().includes("time") || key.includes("วัน") || key.includes("เวลา"); }
