import assert from "node:assert/strict";
import test from "node:test";
import {
  refinementFixtures,
  layoutDocumentPages,
  pageLines,
  lineText,
} from "./document-layout.test-fixtures.js";
import { documentDefinition } from "./document-layout.js";
const fixtures = refinementFixtures();
const signatures = (page: any) =>
  pageLines(page).filter((l) =>
    lineText(l).startsWith("________________________"),
  );
test("ordinary financial references use one A4 page and bottom blank-date signatures without footer identity", () => {
  for (const name of ["invoice", "receipt"]) {
    const pages = layoutDocumentPages(fixtures[name]!);
    assert.equal(pages.length, 1, name);
    const lines = pageLines(pages[0]);
    const sig = signatures(pages[0]);
    assert.equal(sig.length, name === "receipt" ? 1 : 2);
    assert.ok(sig.every((l) => l.y > 690));
    assert.doesNotMatch(lines.map(lineText).join("\n"), /Page 1 \/ 1/);
    assert.equal(
      lines.filter((l) => lineText(l).includes("วันที่ลงนาม:")).length,
      name === "receipt" ? 1 : 2,
    );
  }
});
test("long facts survive pagination, final-page signatures and compact continuation identity", () => {
  for (const [name, count, prefix] of [
    ["long-contract", 60, "4."],
    ["long-invoice", 45, "ROW-"],
    ["long-receipt", 35, "TRANSFER-"],
    ["oversized-row", 100, "LINE-"],
  ] as const) {
    const pages = layoutDocumentPages(fixtures[name]!);
    assert.ok(pages.length > 1, name);
    for (let i = 0; i < pages.length; i++) {
      const lines = pageLines(pages[i]);
      assert.equal(
        signatures(pages[i]).length,
        i === pages.length - 1 ? (name === "long-receipt" ? 1 : 2) : 0,
        name,
      );
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
            (item: any) => item.type === "image" && item.item.y < 60,
          ),
          name,
        );
      }
      for (const line of lines) {
        assert.ok(
          line.x >= 39.9 && line.x + line.getWidth() <= 555.4,
          `${name} ${lineText(line)}`,
        );
        assert.ok(line.y + line.getHeight() < 830, `${name} ${lineText(line)}`);
      }
    }
    const all = pages.flatMap(pageLines).map(lineText).join("\n");
    for (let i = 1; i <= count; i++)
      assert.ok(
        all.includes(
          prefix === "4."
            ? `4.${String(i - 1).padStart(4, "0")}`
            : `${prefix}${i}`,
        ),
        `${name} lost ${i}`,
      );
    assert.ok(
      pageLines(pages.at(-1)).some(
        (l) => l.y > 60 && l.y < 690 && lineText(l).trim(),
      ),
      `${name} signature-only final page`,
    );
  }
});
test("draft PPA has all ten saved clauses and a complete inclusive dated table", () => {
  const pages = layoutDocumentPages(fixtures.contract!);
  const text = pages.flatMap(pageLines).map(lineText).join("\n");
  for (const c of fixtures.contract!.ppaClauses!)
    assert.ok(text.includes(`${c.number}. ${c.title}`), c.title);
  for (const rate of fixtures.contract!.rates)
    assert.ok(text.includes(rate.rate));
  assert.match(text, /12.345 kWp/);
  assert.match(text, /End inclusive/);
  assert.match(text, /SYNTHETIC LOCAL DRAFT/);
  assert.equal(signatures(pages.at(-1)).length, 2);
});
test("long Thai signatories preserve text and align roles and blank dates within A4", () => {
  const snapshot = {
    ...fixtures["long-identity"]!,
    signatories: {
      issuer: {
        name: "ผู้ลงนามฝ่ายผู้ขายโครงการและผู้แทนที่มีชื่อยาวสำหรับทดสอบการตัดบรรทัด".repeat(
          3,
        ),
        title: "กรรมการผู้มีอำนาจ",
      },
      customer: { name: "นายผู้ซื้อ", title: "ผู้แทนองค์กร" },
    },
  };
  const pages = layoutDocumentPages(snapshot);
  const lines = pages.flatMap(pageLines);
  for (const l of lines) {
    assert.ok(l.x >= 39.9 && l.x + l.getWidth() <= 555.4, lineText(l));
    assert.ok(l.y + l.getHeight() < 830);
  }
  const dates = pageLines(pages.at(-1)).filter((l) =>
    lineText(l).includes("วันที่ลงนาม:"),
  );
  assert.equal(dates.length, 2);
  assert.equal(dates[0].y, dates[1].y);
  assert.ok(
    lines
      .map(lineText)
      .join("")
      .replaceAll(/\s/g, "")
      .includes(snapshot.signatories.issuer.name.replaceAll(/\s/g, "")),
  );
});
test("numeric columns fit exact large values and return unused space to ordinary descriptions", () => {
  const ordinary = pageLines(layoutDocumentPages(fixtures.invoice!)[0]);
  const large = layoutDocumentPages(fixtures["oversized-row"]!).flatMap(
    pageLines,
  );
  for (const value of [
    "90071992547409.123",
    "12345.6789",
    "90,071,992,547,409.91",
  ]) {
    const line = large.find((l) => lineText(l) === value);
    assert.ok(line, value);
    assert.ok(line.getWidth() <= line.maxWidth + 0.01, value);
  }
  assert.ok(
    ordinary.find((l) => lineText(l).includes("Solar electricity charges"))
      .maxWidth >
      large.find((l) => lineText(l).includes("LINE-1")).maxWidth + 100,
  );
});
test("reference header and paired cards remain separated, with complete long saved identity", () => {
  const snapshot = fixtures["long-header"]!;
  const pages = layoutDocumentPages(snapshot);
  const lines = pageLines(pages[0]);
  const customer = lines.find((l) =>
    lineText(l).includes("ข้อมูลลูกค้า / Customer"),
  );
  const header = lines.filter((l) => l.y < customer.y);
  const joined = header.map(lineText).join("").replaceAll(/\s/g, "");
  for (const value of [
    snapshot.documentNumber,
    snapshot.issueDate,
    snapshot.issuer.name,
    snapshot.issuer.address,
    snapshot.issuer.email!,
  ])
    assert.ok(joined.includes(value.replaceAll(/\s/g, "")), value);
  for (const page of pages) {
    for (const l of pageLines(page))
      assert.ok(
        l.x >= 39.9 && l.x + l.getWidth() <= 555.4 && l.y + l.getHeight() < 830,
        lineText(l),
      );
  }
  const image = pages[0].items.find((i: any) => i.type === "image").item;
  assert.ok(Math.abs(image.x - 40) < 0.01);
  assert.ok(image._width <= 65.01);
  const issuer = header.find((l) => lineText(l).includes("บริษัท"));
  assert.ok(issuer.x - image.x < 80);
  assert.equal(issuer.y, image.y);
  for (const l of header) assert.ok(l.y + l.getHeight() < customer.y);
});

test("PPA numbered headings are kept with body content on every page", () => {
  for (const name of ["contract", "long-contract", "long-identity"]) {
    const bodyEnd =
      841.89 - documentDefinition(fixtures[name]!).pageMargins[3]!;
    for (const page of layoutDocumentPages(fixtures[name]!)) {
      const last = pageLines(page)
        .filter((l) => l.y > 60 && l.y < bodyEnd + 0.1)
        .at(-1);
      if (last)
        assert.doesNotMatch(
          lineText(last),
          /^\d+\. (คู่สัญญา|วัตถุประสงค์|สถานที่|ระยะเวลา|อัตรา|การวัด|เงื่อนไข|การบำรุง|การบอก|ข้อกำหนด)/,
        );
    }
  }
});
