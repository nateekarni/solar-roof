import test from 'node:test';
import assert from 'node:assert/strict';

test('Mailpit restoration selects only missing document-recipient messages',async()=>{
 let restoration;
 try{restoration=await import('./restore-mailpit.mjs');}catch{}
 assert.equal(typeof restoration?.missingDeliveries,'function','Mailpit restoration planner must exist');
 const documents=[
  {document_number:'INV001',recipient:'a@example.test'},
  {document_number:'INV001',recipient:'b@example.test'},
  {document_number:'RC001',recipient:'a@example.test'},
 ];
 const existing=[{Subject:'TEST INV001',To:[{Address:'a@example.test'}]}];
 assert.deepEqual(restoration.missingDeliveries(documents,existing),[documents[1],documents[2]]);
});
