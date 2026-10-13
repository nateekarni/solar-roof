import assert from 'node:assert/strict';import test from 'node:test';import {financialDocumentSnapshot} from './financial-document-pdf.js';
test('site invoice and receipt omit historical contract workflow labels',()=>{
 const party={id:'routing-uuid',contract_number:'PPA261000001',company_name:'Buyer',tax_id:'1234567890123',tax_address:'Address'};
 for(const type of ['invoice','receipt']){
 const s=financialDocumentSnapshot({document_type:type,document_number:type==='invoice'?'INV261000001':'RCP261000001',snapshot:{customer:party,company:party,cycle:{period_start:'2026-09-01',period_end:'2026-09-30',subtotal:'1',simulated_tax:'0',amount:'1',meter_snapshot:[]},issueDate:'2026-10-08',logo:'logo',banks:[],payments:[]}});
 assert.equal(s.contractNumber,undefined);
 }
});
