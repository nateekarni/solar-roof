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
test('invoice and receipt tables reserve Solar Gold for the leading rule and keep financial cells white', () => {
  for (const name of ['invoice', 'receipt'] as const) {
    const definition = documentDefinition(fixtures[name]!);
    const grid = definition.content.find((node:any) => node.table?.headerRows === 1);
    const totals = definition.content.find((node:any) => node.table?.body?.some((row:any[]) => row.some(cell => cell.rowSpan)));
    assert.equal(grid.layout.hLineColor(0), fixtures[name]!.brandPrimary, name);
    assert.equal(grid.layout.hLineColor(1), '#d9dde1', name);
    assert.equal(grid.layout.vLineColor(1), '#d9dde1', name);
    for (const row of totals.table.body)
      for (const cell of row)
        if (cell && Object.keys(cell).length)
          assert.equal(cell.fillColor, '#ffffff', `${name}: ${cell.text ?? 'amount words'}`);
  }
});

test('v11 invoice uses the standard biller and billing receiver roles without profile identity',()=>{
 const snapshot={
  ...fixtures.invoice!,
  templateVersion:'sarabun-a4-v11',
  syntheticTest:true,
  signatories:{issuer:{name:'ผู้บริหาร Solar Roof',title:'ผู้อนุมัติเอกสารทดสอบ',signatureDataUri:fixtures.invoice!.logoDataUri}},
 };
 const definition=documentDefinition(snapshot);
 const page=layoutDocumentPages(snapshot)[0];
 const lines=pageLines(page);
 const visible=lines.map(lineText).join('\n');
 assert.deepEqual([definition.pageMargins[0],definition.pageMargins[2]],[10,10]);
 assert.doesNotMatch(visible,/SYNTHETIC LOCAL TEST|SYNTHETIC LOCAL DRAFT/);
 assert.equal((visible.match(/________________________/g)??[]).length,2);
 assert.match(visible,/ผู้วางบิล/);
 assert.match(visible,/ผู้รับวางบิล/);
 assert.doesNotMatch(visible,/ผู้รับใบวางบิล/);
 assert.doesNotMatch(visible,/ผู้บริหาร Solar Roof|ผู้อนุมัติเอกสารทดสอบ|ผู้ออกใบวางบิล/);
 assert.equal(lines.filter((line:any)=>line.y>690&&lineText(line).startsWith('วันที่:')).length,2);
});

test('v11 receipt keeps its single receiver signature role',()=>{
 const snapshot={...fixtures.receipt!,templateVersion:'sarabun-a4-v11',syntheticTest:true};
 const definition=documentDefinition(snapshot),visible=pageLines(layoutDocumentPages(snapshot)[0]).map(lineText).join('\n');
 assert.deepEqual([definition.pageMargins[0],definition.pageMargins[2]],[10,10]);
 assert.doesNotMatch(visible,/SYNTHETIC LOCAL TEST|เอกสารทดสอบ/);
 assert.equal((visible.match(/________________________/g)??[]).length,1);
 assert.match(visible,/ผู้รับเงิน/);
 assert.doesNotMatch(visible,/ผู้วางบิล|ผู้รับวางบิล|ผู้รับใบวางบิล/);
});

test('short invoice and receipt settle totals below the expanded item region without moving lower facts or signatures off page', () => {
  for (const name of ['invoice', 'receipt'] as const) {
    const pages = layoutDocumentPages(fixtures[name]!);
    assert.equal(pages.length, 1, name);
    const lines = pageLines(pages[0]);
    const total = lines.find((line:any) => lineText(line) === 'ยอดรวม' || lineText(line) === 'ยอดชำระเงินทั้งสิ้น');
    const lower = lines.find((line:any) => lineText(line) === (name === 'invoice' ? 'บัญชีรับชำระ' : 'ข้อมูลการชำระเงิน'));
    assert.ok(total && total.y > 430, `${name}: totals should settle below the expanded item region`);
    assert.ok(lower && lower.y > total.y, `${name}: lower facts follow totals`);
    assert.ok(lines.every((line:any) => line.y + line.getHeight() < 835), name);
  }
});
test('receipt preserves outstanding balances and skips the empty filler row when that table is present', () => {
  const receipt = {
    ...fixtures.receipt!,
    outstandingBills: {
      bills: [
        { period: '2026-08', billedAmount: '1000.00', paidAmount: '250.00', remainingAmount: '750.00' },
      ],
      totalOutstanding: '750.00',
    },
  };
  const definition = documentDefinition(receipt);
  const grids = definition.content.filter((node:any) => node.table?.headerRows === 1);
  assert.equal(grids.length, 2);
  assert.equal(grids[0].table.body.length, 2, 'main grid must not receive a filler row');
  const lines = pageLines(layoutDocumentPages(receipt)[0]);
  assert.ok(lines.some((line:any) => lineText(line) === 'ยอดค้างชำระ'));
  assert.ok(lines.some((line:any) => lineText(line) === 'ข้อมูลการชำระเงิน'));
  assert.ok(lines.some((line:any) => lineText(line).includes('ผู้รับเงิน')));
});
test('financial pages preserve all saved rows and keep signatures on final page', () => {
  for(const name of ['invoice','receipt','long-invoice','long-receipt','oversized-row']) {
    const pages = layoutDocumentPages(fixtures[name]!);
    assert.equal(pages.length === 1, name === 'invoice' || name === 'receipt', name);
    pages.forEach((p:any,i:number)=> {
      const lines=pageLines(p);
      assert.ok(lines.every((l:any)=>l.x>=9.9 && l.x+l.getWidth()<=585.4 && l.y+l.getHeight()<835), name);
      assert.equal(lines.some((l:any)=>lineText(l).includes('ผู้รับเงิน')||lineText(l).includes('ผู้วางบิล')),i===pages.length-1,name);
    });
  }
});
