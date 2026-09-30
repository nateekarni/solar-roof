import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
const require=createRequire(import.meta.url);
interface PdfEngine {addFonts(fonts:unknown):void;setUrlAccessPolicy(policy:(url:string)=>boolean):void;setLocalAccessPolicy(policy:(path:string)=>boolean):void;createPdf(definition:unknown):{getBuffer():Promise<Buffer>};}

/** Real shared A4 renderer. Accounting-dependent labels/totals must be added only after confirmation. */
export async function renderFinancialPdf(document:any,fontPath=process.env.FINANCIAL_PDF_FONT_PATH):Promise<Buffer> {
 if(!fontPath)throw new Error('FINANCIAL_PDF_FONT_PATH must name an installed Thai-capable font');
 await access(fontPath);
 const pdf=require('pdfmake') as PdfEngine;
 pdf.setUrlAccessPolicy(()=>false);
 pdf.setLocalAccessPolicy(path=>resolve(path)===resolve(fontPath));
 pdf.addFonts({Financial:{normal:fontPath,bold:fontPath,italics:fontPath,bolditalics:fontPath}});
 const snapshot=document.snapshot;
 if(!snapshot?.company || !snapshot?.customer || !snapshot?.cycle)throw new Error('Immutable issued snapshot is unavailable');
 const text=(value:unknown)=>value===null || value===undefined?'':String(value);
 const optional=(label:string,value:unknown)=>value===null || value===undefined || value===''?[]:[`${label}${text(value)}`];
 const date=(value:unknown)=>value instanceof Date?value.toISOString().slice(0,10):text(value).slice(0,10);
 const money=(value:unknown)=>value===null||value===undefined||value===''?'':Number.isFinite(Number(value))?Number(value).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):text(value);
 const inclusiveEnd=(value:unknown)=>new Date(Date.parse(date(value))-86400000).toISOString().slice(0,10);
 const company=snapshot.company,customer=snapshot.customer,receipt=document.document_type==='receipt';
 const title=receipt?'Receipt / ใบเสร็จรับเงิน':'Invoice / ใบแจ้งหนี้';
 const header:any={columns:[
  {width:'*',stack:[{text:text(company.company_name),fontSize:16,color:'#123e43'},...optional('',company.address),...optional('Tax ID: ',company.tax_id),...optional('Branch: ',company.branch),...optional('Phone: ',company.phone),...optional('Email: ',company.email)]},
  {width:210,alignment:'right',stack:[{text:title,fontSize:17,color:'#123e43'},{text:text(document.document_number),margin:[0,8,0,4]},`Issued: ${date(snapshot.issueDate??document.issue_date)}`,...(!receipt?optional('Due: ',snapshot.dueDate):[])]}
 ]};
 const rows:any[][]=[[{text:'Period / รายการ',bold:true},{text:'kWh',bold:true},{text:'Rate THB',bold:true},{text:'Amount THB',bold:true}]];
 if(Array.isArray(snapshot.cycle.meter_snapshot))for(const line of snapshot.cycle.meter_snapshot)rows.push([`${date(line.from)} – ${inclusiveEnd(line.to)}\n${text(line.meterId)}`,text(line.consumedKwh),text(line.rate),money(line.amount)]);
 if(rows.length===1)rows.push([`${date(snapshot.cycle.period_start)} – ${date(snapshot.cycle.period_end)}`,text(snapshot.cycle.consumed_kwh),text(snapshot.cycle.rate),money(document.amount)]);
 const content:any[]=[header,
  {canvas:[{type:'line',x1:0,y1:0,x2:515,y2:0,lineWidth:1,lineColor:'#b8cccc'}],margin:[0,18,0,18]},
  {text:'Bill to / ผู้รับเอกสาร',bold:true,color:'#496568'},
  {text:text(customer.company_name || customer.school_name || customer.customer_name),margin:[0,4,0,2]},
  ...optional('',customer.tax_address),...optional('Tax ID: ',customer.tax_id),...optional('Branch: ',customer.branch),
  ...optional('Site: ',customer.site_name),
  {text:`Billing period: ${date(snapshot.cycle.period_start)} – ${date(snapshot.cycle.period_end)}`,margin:[0,14,0,8]},
  {table:{headerRows:1,widths:['*',65,75,90],body:rows},layout:'lightHorizontalLines'},
  {text:`Total / รวม: ${money(document.amount)} THB`,alignment:'right',fontSize:15,margin:[0,16,0,22]}
 ];
 if(receipt) {
  content.push({text:'Approved settlement / การชำระที่ตรวจสอบแล้ว',bold:true});
  for(const payment of Array.isArray(snapshot.payment)?snapshot.payment:[])content.push(`${date(payment.paid_at)}  ${money(payment.amount)} THB`,...optional('Reference: ',payment.evidence_key));
 }else for(const bank of snapshot.banks??[])content.push({text:[bank.bank_name,bank.account_name,bank.account_number].filter(Boolean).join(' · ')},...optional('Branch: ',bank.branch_name),...optional('PromptPay: ',bank.promptpay_id));
 const bytes=await pdf.createPdf({pageSize:'A4',pageMargins:[40,40,40,45],defaultStyle:{font:'Financial',fontSize:10,lineHeight:1.15},content,footer:(current:number,total:number)=>({text:`${text(document.document_number)}  ·  ${current} / ${total}`,alignment:'right',margin:[40,10,40,0],fontSize:8,color:'#637575'}),info:{title:text(document.document_number)}}).getBuffer();
 if(bytes.subarray(0,5).toString()!=='%PDF-')throw new Error('PDF renderer returned invalid bytes');
 return bytes;
}
export async function ensureDocumentArtifact(client:PoolClient,documentId:string):Promise<{bytes:Buffer;sha256:string}> {
 const existing=(await client.query('SELECT pdf_bytes,sha256 FROM document_artifacts WHERE document_id=$1',[documentId])).rows[0];
 if(existing)return {bytes:existing.pdf_bytes,sha256:existing.sha256};
 // Serializes parallel artifact builders; originals cannot be regenerated from mutable state.
 const document=(await client.query("SELECT * FROM documents WHERE id=$1 AND status IN('issued','finalized') FOR UPDATE",[documentId])).rows[0];
 if(!document?.snapshot || !document.render_eligible)throw new Error('Original issued artifact unavailable; historical documents are not reconstructed');
 const again=(await client.query('SELECT pdf_bytes,sha256 FROM document_artifacts WHERE document_id=$1',[documentId])).rows[0];
 if(again)return {bytes:again.pdf_bytes,sha256:again.sha256};
 // Only documents atomically queued by the new issue path are eligible for first rendering.
 if(!(await client.query("SELECT 1 FROM financial_delivery_outbox WHERE document_id=$1 AND purpose='issue'",[documentId])).rowCount)throw new Error('Original historical PDF unavailable');
 const bytes=await renderFinancialPdf(document),sha256=createHash('sha256').update(bytes).digest('hex');
 await client.query('INSERT INTO document_artifacts(document_id,pdf_bytes,sha256) VALUES($1,$2,$3)',[documentId,bytes,sha256]);
 return {bytes,sha256};
}


