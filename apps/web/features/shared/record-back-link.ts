export function recordBackLink(resource:string,role:string,fallback:string,locale:'th'|'en') {
 const documents=role==='school_user'&&['billing','documents','receipts'].includes(resource);
 return {href:documents?'/contracts':fallback,label:documents?(locale==='th'?'กลับไปหน้าเอกสาร':'Back to documents'):(locale==='th'?'กลับไปหน้ารายการ':'Back to list')};
}
