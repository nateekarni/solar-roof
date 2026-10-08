import assert from 'node:assert/strict';
import test from 'node:test';
import {
  refinementFixtures,
  layoutDocumentPages,
  pageLines,
  lineText,
} from './document-layout.test-fixtures.js';
const fixtures = refinementFixtures();
test('ordinary documents share one A4 page and anchor paired signatures above page footer', () => {
  for (const name of ['contract', 'invoice', 'receipt']) {
    const pages = layoutDocumentPages(fixtures[name]!);
    assert.equal(pages.length, 1, name);
    const lines = pageLines(pages[0]);
    const signatures = lines.filter((l) =>
      lineText(l).startsWith('________________________'),
    );
    assert.equal(signatures.length, 2, name);
    assert.equal(signatures[0].y, signatures[1].y);
    assert.ok(signatures[0].y > 680, name);
    const footer = lines.find((l) => lineText(l).includes('Page 1 / 1'));
    assert.ok(footer.y >= 795 && footer.y < 820);
    for (const line of lines) assert.ok(line.y + line.getHeight() < 830);
  }
});
test('long documents preserve all facts, compact continuation identity and final-page signatures', () => {
  for (const [name, count, prefix] of [
    ['long-contract', 60, '4.'],
    ['long-invoice', 45, 'ROW-'],
    ['long-receipt', 35, 'TRANSFER-'],
    ['oversized-row', 100, 'LINE-'],
  ] as const) {
    const pages = layoutDocumentPages(fixtures[name]!);
    assert.ok(pages.length > 1, name);
    for (let i = 0; i < pages.length; i++) {
      const lines = pageLines(pages[i]);
      const signatures = lines.filter((l) =>
        lineText(l).startsWith('________________________'),
      );
      assert.equal(signatures.length, i === pages.length - 1 ? 2 : 0, name);
      if (signatures.length) assert.ok(signatures[0].y > 680);
      if (i > 0) {
        assert.ok(
          lines.some(
            (l) =>
              l.y < 60 && lineText(l).includes(fixtures[name]!.documentNumber),
          ),
          name,
        );
        assert.ok(
          pages[i].items.some(
            (item: any) => item.type === 'image' && item.item.y < 60,
          ),
          name,
        );
      }
      for (const line of lines) {
        assert.ok(
          line.x >= 39.9 && line.x + line.getWidth() <= 555.4,
          `${name}: ${lineText(line)}`,
        );
        assert.ok(line.y + line.getHeight() < 830, `${name} text below footer`);
      }
    }
    const text = pages.flatMap(pageLines).map(lineText).join('\n');
    for (let i = 1; i <= count; i++)
      assert.ok(
        text.includes(
          prefix === '4.'
            ? `4.${String(i - 1).padStart(4, '0')}`
            : `${prefix}${i}`,
        ),
        `${name} lost ${i}`,
      );
    assert.ok(
      pageLines(pages.at(-1)).some((l) => l.y > 60 && l.y < 650),
      `${name} signature-only final page`,
    );
  }
});
test('long Thai parties and signatories wrap within A4 and preserve footer clearance', () => {
  const pages = layoutDocumentPages(fixtures['long-identity']!);
  const lines = pages.flatMap(pageLines);
  for (const line of lines) {
    assert.ok(
      line.x >= 39.9 && line.x + line.getWidth() <= 555.4,
      lineText(line),
    );
    assert.ok(line.y + line.getHeight() < 830);
  }
  const signatureLines = pageLines(pages.at(-1)).filter((l) =>
    lineText(l).startsWith('________________________'),
  );
  assert.equal(signatureLines.length, 2);
  assert.equal(signatureLines[0].y, signatureLines[1].y);
  const fullText = lines.map(lineText).join('').replaceAll(/\s/g, '');
  assert.ok(
    fullText.includes(
      fixtures['long-identity']!.signatories.issuer!.name!.replaceAll(
        /\s/g,
        '',
      ),
    ),
  );
});

test('paired PPA names of different lengths retain aligned roles and blank signing dates', () => {
  const pages = layoutDocumentPages({
    ...fixtures.contract!,
    signatories: {
      issuer: {
        name: 'ผู้ลงนามฝ่ายผู้ขายโครงการและผู้แทนที่มีชื่อยาวสำหรับทดสอบการตัดบรรทัด'.repeat(
          3,
        ),
        title: 'กรรมการผู้มีอำนาจ',
      },
      customer: { name: 'นายผู้ซื้อ', title: 'ผู้แทนองค์กร' },
    },
  });
  const lines = pageLines(pages.at(-1));
  const dates = lines.filter((l) => lineText(l).includes('วันที่ลงนาม:'));
  assert.equal(dates.length, 2);
  assert.equal(dates[0].y, dates[1].y);
});
test('financial numeric columns grow to fit exact values and return unused space to descriptions', () => {
  const ordinary = pageLines(layoutDocumentPages(fixtures.invoice!)[0]);
  const large = layoutDocumentPages(fixtures['oversized-row']!).flatMap(
    pageLines,
  );
  for (const value of [
    '90071992547409.123',
    '12345.6789',
    '90,071,992,547,409.91',
  ]) {
    const line = large.find((l) => lineText(l) === value);
    assert.ok(line, value);
    assert.ok(line.getWidth() <= line.maxWidth + 0.01, value);
  }
  const ordinaryDescription = ordinary.find((l) =>
    lineText(l).includes('Solar electricity charges'),
  );
  const largeDescription = large.find((l) => lineText(l).includes('LINE-1'));
  assert.ok(ordinaryDescription.maxWidth > largeDescription.maxWidth + 100);
});


test('ordinary first-page header uses three top-aligned blocks with the confirmed whitespace and full-width customer below', () => {
  for(const name of ['contract','invoice','receipt']) {
    const page=layoutDocumentPages(fixtures[name]!)[0];
    const lines=pageLines(page);
    const image=page.items.find((i:any)=>i.type==='image').item;
    assert.ok(Math.abs(image.x-40)<0.01,name);
    assert.ok(Math.abs(image._width-77.292)<0.01,name);
    const issuer=lines.find(l=>lineText(l).includes('บริษัท โซลาร์ รูฟ จำกัด'));
    assert.ok(Math.abs(issuer.x-168.82)<0.01,name);
    assert.equal(issuer.y,image.y,name);
    const number=lines.find(l=>lineText(l).includes(fixtures[name]!.documentNumber));
    assert.ok(number.x>=400.696-0.01,name);
    assert.ok(number.x+number.getWidth()<=555.28+0.01,name);
    const customer=lines.find(l=>lineText(l).includes('ลูกค้า / Customer'));
    const upper=lines.filter(l=>l.y>=image.y&&l.y<customer.y);
    assert.ok(customer.y>Math.max(image.y+image._height,...upper.map(l=>l.y+l.getHeight())),name);
    assert.equal(customer.x,40,name);
  }
});

test('long saved number date and issuer wrap completely within header columns and clear continuation content', () => {
  const snapshot = fixtures['long-header']!;
  const pages=layoutDocumentPages(snapshot);
  const first=pageLines(pages[0]);
  const customer=first.find(l=>lineText(l).includes('ลูกค้า / Customer'));
  const header=first.filter(l=>l.y<customer.y && lineText(l) && !lineText(l).includes('SYNTHETIC LOCAL TEST'));
  const joined=header.map(lineText).join('').replaceAll(/\s/g,'');
  for(const value of [snapshot.documentNumber,snapshot.issueDate,snapshot.issuer.name,snapshot.issuer.address,snapshot.issuer.email!]) assert.ok(joined.includes(value.replaceAll(/\s/g,'')),value);
  for(const line of header) {
    const left=line.x<400?168.82:400.696;
    const edge=line.x<400?349.168:555.28;
    assert.ok(line.x>=left-0.01 && line.x+line.getWidth()<=edge+0.01,lineText(line));
    assert.ok(line.y+line.getHeight()<=customer.y,lineText(line));
    assert.ok(line.inlines.every((inline:any)=>inline.fontSize===0||inline.fontSize>=12));
  }
  for(let i=0;i<pages.length;i++) {
    const footerLines=pageLines(pages[i]).filter(l=>l.y>760);
    assert.ok(footerLines.map(lineText).join('').includes(snapshot.documentNumber));
    assert.ok(footerLines.some(l=>lineText(l).includes(`Page ${i+1} / ${pages.length}`)),`page ${i+1} lost footer page label`);
    for(const line of footerLines) assert.ok(line.y+line.getHeight()<830);
  }
  for(const page of pages.slice(1)) {
    const image=page.items.find((i:any)=>i.type==='image').item;
    assert.ok(image._height<=26.01 && image._width<=32.01);
    const lines=pageLines(page);
    const body=lines.find(l=>l.y>=75);
    assert.ok(body);
    const metadata=lines.filter(l=>l.y<body.y);
    assert.ok(metadata.map(lineText).join('').includes(snapshot.documentNumber));
    assert.ok(body.y>=Math.max(image.y+image._height,...metadata.map(l=>l.y+l.getHeight())));
  }
});
