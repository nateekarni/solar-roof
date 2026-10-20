import test from "node:test";
import assert from "node:assert/strict";
import {
  customerQrImageBlob,
  renderPromptPayQrDataUrl,
  resolveCustomerQrImage,
} from "./customer-payment-qr";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=";
test("stored PNG QR data becomes bounded image bytes, while malformed and non-image data are rejected", async () => {
  const blob = customerQrImageBlob(png);
  assert.equal(blob?.type, "image/png");
  assert.deepEqual(
    Array.from(new Uint8Array(await blob!.arrayBuffer()).slice(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  for (const value of [
    "data:image/svg+xml;base64,PHN2Zy8+",
    "data:application/pdf;base64,JVBERi0xLjQ=",
    "data:image/png;base64,PHNjcmlwdD4=",
    "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/png;base64,!!!=",
    png.slice(0, -1),
    png + " ",
    "data:image/png;base64," +
      Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64"),
  ])
    assert.equal(customerQrImageBlob(value), null, value.slice(0, 80));
});
test("QR resolver retains only current/configured API HTTP destinations and rejects arbitrary stored blobs", async () => {
  const local = await resolveCustomerQrImage(
    "/assets/qr.png",
    "https://portal.test",
    "https://api.test",
  );
  assert.equal(local?.url, "https://portal.test/assets/qr.png");
  local?.dispose();
  const api = await resolveCustomerQrImage(
    "https://api.test/qr.png",
    "https://portal.test",
    "https://api.test/v1",
  );
  assert.equal(api?.url, "https://api.test/qr.png");
  api?.dispose();
  for (const value of [
    "https://foreign.test/qr.png",
    "https://api.test.attacker.test/qr.png",
    "//foreign.test/qr.png",
    "javascript:alert(1)",
    "file:///qr.png",
    "blob:https://portal.test/stored",
    "https://user:pass@portal.test/qr.png",
  ])
    assert.equal(
      await resolveCustomerQrImage(
        value,
        "https://portal.test",
        "https://api.test",
      ),
      null,
    );
});
test("QR dimensions are bounded before image decoding for both PNG and JPEG", () => {
  const bytes = Buffer.from(png.split(",")[1]!, "base64");
  bytes.writeUInt32BE(5000, 16);
  assert.equal(
    customerQrImageBlob(`data:image/png;base64,${bytes.toString("base64")}`),
    null,
  );
  const jpeg = Buffer.from([
    255, 216, 255, 192, 0, 8, 8, 32, 0, 32, 0, 0, 255, 217,
  ]);
  assert.equal(
    customerQrImageBlob(`data:image/jpeg;base64,${jpeg.toString("base64")}`),
    null,
  );
});
test("renders a PromptPay payload to a local PNG data URL and propagates encoder errors", async () => {
  const result = await renderPromptPayQrDataUrl(
    "00020101021129370016A0000006770101110213010556501234553037645802TH63045FE3",
  );
  assert.match(result, /^data:image\/png;base64,/);
  await assert.rejects(
    () => renderPromptPayQrDataUrl("x".repeat(100_000)),
    /too big|capacity|length|code/i,
  );
});
