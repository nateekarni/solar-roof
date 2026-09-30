import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFinancialPdf } from '../src/modules/documents/document-artifact.js';
test('real Thai PDF has complete PDF objects and rejects missing font configuration',async()=>{
 const document={document_number:'TEST-1',document_type:'invoice',amount:'100.00',issue_date:'2026-10-01',snapshot:{company:{company_name:'โรงเรียนทดสอบ',address:'กรุงเทพมหานคร',tax_id:'TEST'},customer:{school_name:'โรงเรียน',site_name:'หลังคา'},cycle:{period_start:'2026-09-01',period_end:'2026-09-30',meter_snapshot:[]},dueDate:'2026-10-31'}};
 await assert.rejects(renderFinancialPdf(document,''),/FINANCIAL_PDF_FONT_PATH/);
 const bytes=await renderFinancialPdf(document,process.env.FINANCIAL_PDF_FONT_PATH);
 assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 assert.match(bytes.toString('latin1'),/\/Type \/Page\b/);
 assert.match(bytes.subarray(-100).toString(),/%%EOF/);
 assert.ok(bytes.length>3000);
});
