import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import * as handover from './handover-preview-modal';

test('handover preview keeps uploaded logo and metadata in header with issuer details once below',()=>{
 // Removing the company-information block or repeating it in the header breaks this rendered contract.
 assert.equal(typeof (handover as any).HandoverDocument,'function');
 const html=renderToStaticMarkup(React.createElement((handover as any).HandoverDocument,{th:false,title:'Handover',data:{type:'handover',documentNumber:'HANDOVER-1',issueDate:'2026-10-13',customerName:'Recorded customer'},company:{companyName:'Recorded issuer',address:'Recorded address',taxId:'1234567890123',branch:'00000',phone:'02-123',email:'issuer@example.invalid',logoUrl:'data:image/png;base64,UPLOADED'}}));
 const header=html.match(/<header[\s\S]*?<\/header>/)![0];
 assert.match(header,/src="data:image\/png;base64,UPLOADED"/);assert.match(header,/HANDOVER-1/);
 assert.doesNotMatch(header.replace(/<[^>]*>/g,''),/Recorded issuer|Recorded address|1234567890123/);
 const body=html.slice(html.indexOf('</header>')+9).replace(/<[^>]*>/g,' ');
 assert.equal((body.match(/Recorded issuer/g)||[]).length,1);
 for(const fact of ['Company Information','Recorded address','1234567890123','00000','02-123','issuer@example.invalid','Recorded customer'])assert.ok(body.includes(fact),fact);
});
