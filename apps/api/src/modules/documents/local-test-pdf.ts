import { createRequire } from 'node:module';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
export async function renderLocalTestPdf(document:any):Promise<Buffer> {
 const font=process.env.FINANCIAL_PDF_FONT_PATH;if(!font)throw new Error('FINANCIAL_PDF_FONT_PATH required');await access(font);
 const pdf=require('pdfmake');pdf.setUrlAccessPolicy(()=>false);pdf.setLocalAccessPolicy((path:string)=>resolve(path)===resolve(font));
 pdf.addFonts({Financial:{normal:font,bold:font,italics:font,bolditalics:font}});
 const s=document.snapshot;const money=formatTestMoney;
 const receipt=document.document_type==='receipt';const title=receipt?'TEST Receipt / Tax Invoice · ใบเสร็จรับเงิน / ใบกำกับภาษีทดสอบ':'TEST Invoice · ใบแจ้งหนี้ทดสอบ';
 const lines=s.cycle.meter_snapshot.map((line:any)=>[`${line.from} – ${new Date(Date.parse(line.to)-86400000).toISOString().slice(0,10)}`,line.consumedKwh,line.rate,money(line.subtotal)]);
 const content:any[]=[{columns:[{image:s.logo,width:120},{width:'*',text:title,alignment:'right',fontSize:17,color:'#123e43'}]},
 {text:'SYNTHETIC LOCAL TEST — simulated tax 7%; no withholding',fontSize:9,margin:[0,12,0,10]},
 {text:s.company.company_name,fontSize:15},s.company.address,`Tax ID: ${s.company.tax_id} · ${s.company.branch??''}`,
 {text:`${document.document_number} · Issued ${s.issueDate}`,margin:[0,15,0,8]},
 {text:s.customer.company_name,bold:true},s.customer.tax_address,`Tax ID: ${s.customer.tax_id} · ${s.customer.branch??''}`,`Site: ${s.customer.site_name}`,
 {text:`Contract: ${s.customer.id} · Billing ${new Date(s.cycle.period_start).toISOString().slice(0,10)} – ${new Date(s.cycle.period_end).toISOString().slice(0,10)}`,margin:[0,10,0,8]},
 {table:{headerRows:1,widths:['*',70,75,90],body:[['Period','kWh','THB / kWh','Charge THB'],...lines]},layout:'lightHorizontalLines'},
 {text:`Charge: ${money(s.cycle.subtotal)} THB\nSimulated tax 7%: ${money(s.cycle.simulated_tax)} THB\nTotal: ${money(s.cycle.amount)} THB`,alignment:'right',fontSize:13,margin:[0,15,0,20]}];
 if(receipt){content.push('Approved transfers / หลักฐานการชำระ');for(const p of s.payments)content.push(`${new Date(p.paid_at).toISOString()} · ${money(p.amount)} THB · ${p.evidence_key??p.slip_url??''}`);}else {content.push(`Due: ${s.dueDate}`);for(const bank of s.banks)content.push(`${bank.bank_name} · ${bank.account_name} · ${bank.account_number}`);}
 const bytes=await pdf.createPdf({pageSize:'A4',pageMargins:[40,40,40,45],defaultStyle:{font:'Financial',fontSize:10},content,info:{title:document.document_number},footer:(page:number,total:number)=>({text:`TEST · ${document.document_number} · ${page}/${total}`,alignment:'right',margin:[40,10,40,0],fontSize:8})}).getBuffer();if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('Invalid PDF bytes');return bytes;
}
export function formatTestMoney(value:unknown):string {
 const raw=String(value);if(!/^\d+(\.\d+)?$/.test(raw))throw new Error('Exact nonnegative money required');const [whole,fraction='']=raw.split('.');if(/[1-9]/.test(fraction.slice(2)))throw new Error('Money must be whole satang');return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction.padEnd(2,'0').slice(0,2)}`;
}

