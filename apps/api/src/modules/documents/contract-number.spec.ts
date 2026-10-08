import assert from 'node:assert/strict';import test from 'node:test';
import {buildContractSnapshot} from './contract-pdf.service.js';
const contract={id:'internal',document_number:'PPA261000001',site_id:'site',site_name:'Site',school_id:'school',start_date:'2026-10-08',end_date:null,company_name:'Buyer',tax_id:'1234567890123',tax_address:'Address',signer_name:'Signer',payment_terms:'30 days'};
test('contract snapshot uses frozen actual PPA number and retains internal routing id',()=>{
 const s=buildContractSnapshot(contract,{company_name:'Seller',tax_id:'1234567890123',address:'Address'},[{startDate:'2026-10-08',rate:'4'}],'logo');
 assert.equal(s.documentNumber,'PPA261000001');assert.equal(s.contractNumber,'PPA261000001');assert.equal(s.contractId,'internal');
});
