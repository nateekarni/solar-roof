import assert from 'node:assert/strict';
import test from 'node:test';
import { documentDefinition } from './document-layout.js';
import { refinementFixtures, layoutDocumentPages, pageLines, lineText } from './document-layout.test-fixtures.js';
const fixtures = refinementFixtures();
test('financial reference uses compact typography, plain parties and attached totals', () => {
  const d = documentDefinition(fixtures.invoice!);
  assert.equal(d.defaultStyle.fontSize, 11);
  assert.equal(d.pageMargins[0], 10);
  const grid = d.content.find((n:any) => n.table?.headerRows === 1);
  assert.equal(grid.table.widths.length, 6);
  assert.equal(grid.layout.vLineWidth(), 0.28);
  assert.ok(d.content.some((n:any)=>n.table?.body?.some((r:any[])=>r.some(c=>c.rowSpan))));
});
test('financial pages preserve all saved rows and keep signatures on final page', () => {
  for(const name of ['invoice','receipt','long-invoice','long-receipt','oversized-row']) {
    const pages = layoutDocumentPages(fixtures[name]!);
    assert.equal(pages.length === 1, name === 'invoice' || name === 'receipt', name);
    pages.forEach((p:any,i:number)=> {
      const lines=pageLines(p);
      assert.ok(lines.every((l:any)=>l.x>=9.9 && l.x+l.getWidth()<=585.4 && l.y+l.getHeight()<835), name);
      assert.equal(lines.some((l:any)=>lineText(l).includes('ผู้รับเงิน')||lineText(l).includes('ผู้อนุมัติออกเอกสาร')),i===pages.length-1,name);
    });
  }
});
