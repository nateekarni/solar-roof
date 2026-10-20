import assert from 'node:assert/strict';
import test from 'node:test';
import {financialDocumentSnapshot} from './financial-document-pdf.js';
test('receipt PDF adapter renders only its own frozen reviewer, including unsigned and historical receipts',()=>{
 const saved:any={document_type:'receipt',document_number:'RCT261000001',snapshot:{company:{company_name:'Issuer',tax_id:'0',signatory_name:'Company signer',signatory_title:'Director',signature_data_uri:'data:image/png;base64,AA=='},customer:{company_name:'Customer',tax_id:'1'},issueDate:'2026-10-14',logo:'data:image/png;base64,AA==',cycle:{period_start:'2026-09-01',period_end:'2026-09-30',subtotal:'1.00',simulated_tax:'0.00',amount:'1.00',meter_snapshot:[]},banks:[],payments:[],approver:{userId:'reviewer',displayName:'ผู้ตรวจหลักฐาน',position:'ฝ่ายบัญชี',signatureDataUri:'data:image/png;base64,AQ==',approvedAt:'2026-10-14T01:00:00.000Z'}}};
 const original=JSON.stringify(saved);
 assert.deepEqual(financialDocumentSnapshot(saved).signatories.issuer,{name:'ผู้ตรวจหลักฐาน',title:'ฝ่ายบัญชี',signatureDataUri:'data:image/png;base64,AQ=='});
 assert.equal(JSON.stringify(saved),original);
 delete saved.snapshot.approver.signatureDataUri;
 assert.deepEqual(financialDocumentSnapshot(saved).signatories.issuer,{name:'ผู้ตรวจหลักฐาน',title:'ฝ่ายบัญชี'});
 delete saved.snapshot.approver;
 assert.deepEqual(financialDocumentSnapshot(saved).signatories.issuer,{});
});
test('invoice PDF adapter uses the frozen approver rather than company signatory defaults',()=>{
 const saved:any={document_type:'invoice',document_number:'INV261000001',snapshot:{company:{company_name:'Issuer',tax_id:'0',signatory_name:'Somchai',signatory_title:'Director',signature_data_uri:'data:image/png;base64,AA=='},customer:{company_name:'Customer',tax_id:'1'},issueDate:'2026-10-09',logo:'data:image/png;base64,AA==',cycle:{period_start:'2026-09-01',period_end:'2026-09-30',subtotal:'1.00',simulated_tax:'0.00',amount:'1.00',meter_snapshot:[]},banks:[],payments:[]}};
 saved.snapshot.approver={userId:'actor',displayName:'สมชาย ใจดี',position:'กรรมการบริษัท',signatureDataUri:'data:image/png;base64,AA==',approvedAt:'2026-10-14T01:00:00.000Z'};
 const original=JSON.stringify(saved);
 assert.deepEqual(financialDocumentSnapshot(saved).signatories.issuer,{name:'สมชาย ใจดี',title:'กรรมการบริษัท',signatureDataUri:'data:image/png;base64,AA=='});
 assert.equal(JSON.stringify(saved),original);
 saved.snapshot.approver={userId:'unsigned',displayName:'สมหญิง ใจดี',position:'ผู้จัดการฝ่ายบัญชี',approvedAt:'2026-10-14T01:00:00.000Z'};
 assert.deepEqual(financialDocumentSnapshot(saved).signatories.issuer,{name:'สมหญิง ใจดี',title:'ผู้จัดการฝ่ายบัญชี'});
 delete saved.snapshot.approver;
 assert.deepEqual(financialDocumentSnapshot(saved).signatories.issuer,{});
});
import {refinementFixtures,layoutDocumentPages,pageLines,lineText} from './document-layout.test-fixtures.js';
import {documentDefinition,renderDocumentPdf} from './document-layout.js';
test('A4 invoice retains approver audit data without rendering profile identity or signature bytes',async()=>{
 const invoice=refinementFixtures().invoice!;
 invoice.signatories={issuer:{name:'ผู้ลงนามที่บันทึกไว้',title:'กรรมการ',signatureDataUri:invoice.logoDataUri}};
 const pages=layoutDocumentPages(invoice);assert.ok(pages.length>=1);
 const text=pageLines(pages.at(-1)).map(lineText).join('\n');assert.doesNotMatch(text,/ผู้ลงนามที่บันทึกไว้|กรรมการ|ผู้ออกใบวางบิล|ผู้รับใบวางบิล/);assert.match(text,/ผู้วางบิล/);assert.match(text,/ผู้รับวางบิล/);
 const footer=documentDefinition(invoice).footer(1,1);assert.ok(footer.stack[0].table.body[0].every((cell:any)=>!cell.image));
 const bytes=await renderDocumentPdf(invoice);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
});
test('manual document preserves issued line descriptions and configured tax without test watermark',()=>{
 const saved:any={document_type:'invoice',document_number:'INV261000001',snapshot:{company:{company_name:'Issuer',tax_id:'0'},customer:{company_name:'Customer',tax_id:'1'},issueDate:'2026-10-09',logo:'data:image/png;base64,AA==',policy:{taxPercent:'3.5',taxMode:'exclusive'},cycle:{period_start:'2026-09-01',period_end:'2026-09-30',subtotal:'100.00',simulated_tax:'3.50',amount:'103.50',meter_snapshot:[],billing_note:'Maintenance complete',manual_lines:[{description:'Maintenance',quantity:'2',unitPrice:'50',amount:'100.00'}]},banks:[],payments:[]}};
 const value=financialDocumentSnapshot(saved);assert.deepEqual(value.items,[{description:'Maintenance',quantity:'2',rate:'50',amount:'100.00'}]);assert.equal(value.totals?.taxLabel,'ภาษี 3.5%');assert.equal(value.syntheticTest,false);assert.ok(value.remarks?.includes('Maintenance complete'));
});
