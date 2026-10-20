import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { openFixtureBrowser } from "./platform/browser-transport.mjs";
const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
const requireCss = createRequire(import.meta.resolve("@tailwindcss/postcss"));
const base = fileURLToPath(new URL("../", import.meta.url));
const css = (
  await requireCss("postcss")([
    requireCss("@tailwindcss/postcss")({ base }),
  ]).process(
    (await readFile(base + "app/globals.css", "utf8")).replace(
      /^@import url\([^\n]+\);\r?\n/,
      "",
    ),
    { from: base + "app/globals.css" },
  )
).css;
const row = {
  id: "bill/a",
  invoiceId: "invoice",
  invoiceNumber: "INV-001",
  billingStatusView: "awaiting_payment",
  outstandingAmount: "670.13",
  amount: "1070.13",
  approvedAmount: "400.00",
  pendingEvidenceCount: 0,
  rejectedEvidenceCount: 1,
  payments: [
    {
      id: "old",
      amount: null,
      declaredAmount: "670.13",
      status: "rejected",
      rejectionReason: "Unreadable transfer",
      submittedAt: "2020-10-02",
    },
  ],
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=",
  "base64",
);
const pdfWorker = await readFile(
  createRequire(new URL("../package.json", import.meta.url)).resolve(
    "pdfjs-dist/build/pdf.worker.min.mjs",
  ),
  "utf8",
);
function receiptPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R >>",
    "<< /Length 0 >>\nstream\n\nendstream",
  ];
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 5\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((value) => `${String(value).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}
async function fixture(
  width,
  {
    home = false,
    query = false,
    instructionFailure = false,
    expireInstructions = false,
  } = {},
) {
  const locale = width === 768 ? "th" : "en";
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CustomerFinancialRecordPage} from './features/customer/records/customer-financial-record-page';import {CurrentBillHero} from './features/customer/home/current-bill-hero';createRoot(document.getElementById('root')).render(${home ? `<CurrentBillHero bill={${JSON.stringify({ ...row, status: "awaiting_payment", canPay: true })}} canPay={true} locale="${locale}" additionalOpenBillCount={0}/>` : `<CustomerFinancialRecordPage row={${JSON.stringify(row)}} locale="${locale}" capabilities={{actions:[],unavailable:{},operationsActions:['submit_payment']}}/>`});`,
      resolveDir: base,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    jsx: "automatic",
    tsconfig: base + "tsconfig.ui-tests.json",
    define: { "process.env": "{}", "process.env.NODE_ENV": '"test"' },
  });
  const browser = await openFixtureBrowser(chromium, process.env),
    page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(5000);
  const state = {
    requests: [],
    requestHeaders: [],
    posts: [],
    errors: [],
    pending: null,
    instructionReads: 0,
    refreshes: 0,
  };
  await page.context().addCookies([
    {
      name: "session",
      value: "customer-fixture",
      domain: "customer-payment.test",
      path: "/",
      secure: true,
    },
  ]);
  page.on("pageerror", (e) => state.errors.push(e.message));
  await page.route("https://customer-payment.test/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    state.requests.push(path);
    state.requestHeaders.push({ path, headers: request.headers() });
    if (path.endsWith("/pdf.worker.min.mjs"))
      return route.fulfill({
        contentType: "application/javascript",
        body: pdfWorker,
      });
    if (path.endsWith("/auth/refresh")) {
      state.refreshes++;
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "customer",
            email: "customer@example.test",
            displayName: "Customer",
            role: "customer_user",
          },
          accessToken: `refreshed-${state.refreshes}`,
        }),
      });
    }
    if (path.endsWith("/payment-instructions")) {
      state.instructionReads++;
      return route.fulfill({
        status:
          state.instructionReads === 1 && expireInstructions
            ? 401
            : instructionFailure && state.instructionReads === 1
              ? 503
              : 200,
        contentType: "application/json",
        body: JSON.stringify({
          available: true,
          bankName: "Receiving bank",
          accountName: "Solar",
          accountNumber: "123-456",
          promptpayId: "0105565012345",
          qrCodeUrl: `data:image/png;base64,${png.toString("base64")}`,
        }),
      });
    }
    if (path.endsWith("/pay")) {
      state.posts.push(request.postDataJSON());
      state.pending = route;
      return;
    }
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html class="${width === 768 ? "dark" : ""}"><head><title>Payment fixture</title></head><body class="customer-portal"><main id="root"></main></body></html>`,
    });
  });
  await page.goto(
    `https://customer-payment.test/${query ? "records/billing/bill%2Fa?payment=1" : ""}`,
  );
  await page.clock.setFixedTime(new Date("2026-10-19T12:00:00+07:00"));
  await page.addStyleTag({ content: css });
  await page.addScriptTag({
    type: "module",
    content: bundle.outputFiles[0].text,
  });
  return { browser, page, state, locale };
}
for (const width of [360, 390, 768, 1280])
  test(`customer payment fits ${width}px, traps/restores focus and enters from ${width === 1280 ? "home" : "record"}`, async () => {
    const { browser, page, state, locale } = await fixture(width, {
      home: width === 1280,
    });
    try {
      const trigger = page.getByRole("link", {
        name:
          locale === "en"
            ? width === 1280
              ? "Pay"
              : "Report payment again"
            : "แจ้งชำระเงินใหม่",
      });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await expect(
        dialog.getByRole("heading", {
          name: locale === "en" ? "Make a payment" : "ชำระเงิน",
          exact: true,
        }),
      ).toBeFocused();
      await dialog.getByText("123-456", { exact: true }).waitFor();
      const copy = dialog.getByRole("button", {
        name: locale === "en" ? "Copy account number" : "คัดลอกเลขบัญชี",
      });
      await expect(copy).toBeVisible();
      assert.equal((await copy.textContent()).trim(), "");
      await expect(dialog.locator('input[type="file"]')).toBeHidden();
      await expect(dialog.getByLabel(locale === "en" ? "Transfer date" : "วันที่โอน")).toBeVisible();
      await expect(dialog.getByRole("button", { name: locale === "en" ? "Continue" : "ดำเนินการต่อ" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: locale === "en" ? "Confirm payment" : "ยืนยันการชำระเงิน" })).toHaveCount(0);
      const qrImage = dialog.getByRole("img", {
        name: locale === "en" ? "Payment QR code" : "QR Code สำหรับชำระเงิน",
      });
      await expect(qrImage).toBeVisible();
      await expect
        .poll(() =>
          qrImage.evaluate((image) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
      assert.match(await qrImage.getAttribute("src"), /^data:image\/png;base64,/);
      const saveQr = dialog.getByRole("link", {
        name: locale === "en" ? "Save QR code" : "บันทึก QR Code",
      });
      await expect(saveQr).toHaveAttribute("download", "payment-qr.png");
      const bounds = await dialog.boundingBox();
      if (width < 768) {
        assert.equal(Math.round(bounds.width), width);
        assert.equal(Math.round(bounds.height), 900);
        const headerHeight = await dialog
          .locator('[data-customer-payment-header="true"]')
          .evaluate((header) => header.getBoundingClientRect().height);
        assert.equal(Math.round(headerHeight), 73);
        const channelHeight = await dialog
          .locator('[aria-labelledby="customer-payment-channel-title"]')
          .evaluate((channel) => channel.getBoundingClientRect().height);
        assert.ok(channelHeight <= 360, `Compact payment channel is ${channelHeight}px`);
        assert.ok(
          await dialog.evaluate((element) => element.scrollHeight <= 1400),
          "Mobile payment flow requires only a short scroll",
        );
      } else assert.ok(bounds.width < width);
      for (let n = 0; n < 10; n++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
      }
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await expect(trigger).toBeFocused();
      assert.deepEqual(state.errors, []);
    } finally {
      await browser.close();
    }
  });
test("mobile payment note uses the same corner radius as the picker controls", async () => {
  const { browser, page } = await fixture(390, { query: true });
  try {
    const paymentDialog = page.getByRole("dialog");
    await paymentDialog.getByText("123-456", { exact: true }).waitFor();

    const dateTrigger = paymentDialog.getByLabel("Transfer date", {
      exact: true,
    });
    const noteInput = paymentDialog.getByLabel("Note");
    assert.equal(
      await noteInput.evaluate((element) => getComputedStyle(element).borderRadius),
      await dateTrigger.evaluate((element) => getComputedStyle(element).borderRadius),
      "The note field should use the same corner radius as the picker controls",
    );
  } finally {
    await browser.close();
  }
});

test("copy account number animates to a checked confirmation and then resets", async () => {
  const { browser, page } = await fixture(1280, { query: true });
  try {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "https://customer-payment.test",
    });
    const dialog = page.getByRole("dialog");
    const copy = dialog.getByRole("button", {
      name: "Copy account number",
      exact: true,
    });
    await copy.click();
    const copied = dialog.getByRole("button", { name: "Copied", exact: true });
    await expect(copied).toBeVisible();
    await expect(copied.locator(".lucide-check")).toBeVisible();
    await expect(copied.locator(".lucide-copy")).toHaveCSS("opacity", "0");
    await expect(copy).toBeVisible({ timeout: 2500 });
    await expect(copy.locator(".lucide-copy")).toHaveCSS("opacity", "1");
  } finally {
    await browser.close();
  }
});

test("mobile payment calendar fills the available sheet width", async () => {
  const { browser, page } = await fixture(390, { query: true });
  try {
    const paymentDialog = page.getByRole("dialog");
    await paymentDialog.getByText("123-456", { exact: true }).waitFor();

    const dateTrigger = paymentDialog.getByLabel("Transfer date", {
      exact: true,
    });
    await dateTrigger.click();
    const dateSheet = page.locator('[data-slot="sheet-content"]:visible');
    await dateSheet.getByText("Transfer date", { exact: true }).waitFor();
    const [dateSheetBounds, calendarBounds] = await Promise.all([
      dateSheet.boundingBox(),
      dateSheet.locator('[data-slot="calendar"] table').boundingBox(),
    ]);
    assert.ok(dateSheetBounds && calendarBounds);
    assert.ok(
      calendarBounds.width >= dateSheetBounds.width - 40,
      `Calendar is ${calendarBounds.width}px wide inside a ${dateSheetBounds.width}px sheet`,
    );
  } finally {
    await browser.close();
  }
});

test("payment calendar renders disabled future dates with muted color", async () => {
  const { browser, page } = await fixture(390, { query: true });
  try {
    const paymentDialog = page.getByRole("dialog");
    await paymentDialog.getByText("123-456", { exact: true }).waitFor();
    await paymentDialog.getByLabel("Transfer date", { exact: true }).click();

    const dateSheet = page.locator('[data-slot="sheet-content"]:visible');
    const selectedToday = dateSheet.getByRole("button", { name: /Today.*selected/ });
    const selectedPresentation=await selectedToday.evaluate((element)=>({
      background:getComputedStyle(element).backgroundColor,
      foreground:getComputedStyle(element).color,
      cellClass:element.parentElement?.className,
    }));
    assert.notEqual(selectedPresentation.background,"rgba(0, 0, 0, 0)");
    assert.match(selectedPresentation.cellClass??"",/rdp-selected/);
    const futureDay = dateSheet.getByRole("button", { name: /October 20/ });
    await expect(futureDay).toBeDisabled();
    const [futurePresentation, mutedColor] = await Promise.all([
      futureDay.evaluate((element) => ({
        color: getComputedStyle(element).color,
        className: element.className,
        parentClassName: element.parentElement?.className,
      })),
      dateSheet
        .locator('[data-slot="calendar"] thead th')
        .first()
        .evaluate((element) => getComputedStyle(element).color),
    ]);
    assert.equal(
      futurePresentation.color,
      mutedColor,
      `Disabled future dates should use the calendar's muted foreground color: ${JSON.stringify(futurePresentation)}`,
    );
  } finally {
    await browser.close();
  }
});

test("mounted payment validates files and amounts, preserves drafts, prevents double submission and recovers from duplicate evidence", async () => {
  const { browser, page, state } = await fixture(390, {
    query: true,
    instructionFailure: true,
  });
  try {
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Try again" }).click();
    await dialog.getByText("123-456", { exact: true }).waitFor();
    assert.equal(state.instructionReads, 2);
    const file = dialog.locator('input[type="file"]');
    assert.equal(
      await file.getAttribute("accept"),
      "image/jpeg,image/png,application/pdf",
    );
    assert.equal(await file.getAttribute("capture"), "environment");
    await expect(
      dialog.getByRole("tab", { name: /Full outstanding amount/ }),
    ).toHaveAttribute("aria-selected", "true");
    const amountInput = dialog.locator("#customer-amount");
    await expect(amountInput).toHaveCount(0);
    await dialog.getByRole("tab", { name: "Other amount" }).click();
    const initialQr=await dialog.getByRole("img",{name:"Payment QR code"}).getAttribute("src");
    await amountInput.fill("10");
    await expect.poll(()=>dialog.getByRole("img",{name:"Payment QR code"}).getAttribute("src")).not.toBe(initialQr);
    await dialog.getByRole("tab", { name: /Full outstanding amount/ }).click();
    await expect(amountInput).toHaveCount(0);
    await dialog.getByRole("tab", { name: "Other amount" }).click();
    await amountInput.fill("900");
    await dialog.getByLabel("Transfer date", { exact: true }).click();
    const futureDay = page
      .locator('[data-slot="sheet-content"]:visible')
      .getByRole("button", { name: /October 20/ });
    await expect(futureDay).toBeDisabled();
    await page.keyboard.press("Escape");
    await dialog
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toBeFocused();
    await expect(dialog.getByRole("alert")).toContainText("cannot exceed");
    await dialog
      .getByRole("alert")
      .getByRole("link", {
        name: "The amount cannot exceed the outstanding balance",
      })
      .click();
    const amountField = dialog.locator("#customer-amount");
    await amountField.fill("");
    await amountField.pressSequentially("123.45");
    await expect(amountField).toHaveValue("123.45");
    await expect(amountField).toBeFocused();
    await file.setInputFiles({
      name: "bad.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
    await expect(dialog.getByRole("alert")).toContainText("JPG, PNG or PDF");
    await file.setInputFiles({
      name: "big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(10485761),
    });
    await expect(dialog.getByRole("alert")).toContainText("10 MB");
    await file.setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(
      dialog.getByRole("img", { name: "Transfer evidence" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Remove file" }).click();
    assert.equal(
      await dialog.getByRole("img", { name: "Transfer evidence" }).count(),
      0,
    );
    await file.setInputFiles({
      name: "receipt.pdf",
      mimeType: "application/pdf",
      buffer: receiptPdf(),
    });
    await expect(
      dialog.getByRole("img", { name: "Transfer evidence · 1 / 1" }),
    ).toBeVisible();
    await file.setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: png,
    });
    await amountInput.fill("123.45");
    await dialog.getByLabel("Transfer date", { exact: true }).click();
    const dateSheet = page.locator('[data-slot="sheet-content"]:visible');
    await dateSheet.locator("button").filter({ hasText: /^18$/ }).click();
    await dialog.getByLabel("Note").fill("Keep my draft");
    await expect(dialog.getByLabel("Note")).toHaveValue(
      "Keep my draft",
    );
    await expect(amountInput).toHaveValue("123.45");
    await expect(dialog.getByLabel("Note")).toHaveValue(
      "Keep my draft",
    );
    await expect(
      dialog.getByRole("img", { name: "Transfer evidence" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(dialog.locator('[data-slot="dialog-title"]')).toHaveText(
      "Review your submission",
    );
    await expect(dialog.locator('[data-slot="dialog-title"]')).toBeFocused();
    await expect(dialog).toContainText("receipt.png");
    await dialog
      .getByRole("button", { name: "Confirm payment", exact: true })
      .dblclick({ force: true });
    await expect(
      dialog.getByRole("button", { name: "Reporting payment" }),
    ).toBeDisabled();
    await expect.poll(() => state.posts.length).toBe(1);
    assert.equal(state.posts[0].amount, "123.45");
    assert.equal(state.posts[0].paidAt, "2026-10-18T05:00:00.000Z");
    assert.equal(state.posts[0].paymentMethod, "bank_transfer");
    assert.equal(state.posts[0].transferChannel, "promptpay");
    assert.equal(state.posts[0].note, "Keep my draft");
    assert.ok(!("verifiedAmount" in state.posts[0]));
    assert.ok(!("payerName" in state.posts[0]));
    assert.ok(state.requests.includes("/v1/billing-cycles/bill%2Fa/pay"));
    await state.pending.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ message: "Transfer evidence already submitted" }),
    });
    await expect(dialog.getByRole("alert")).toContainText(
      "already been submitted",
    );
    await expect(dialog.getByLabel("Note")).toHaveValue(
      "Keep my draft",
    );
    await file.setInputFiles({
      name: "new.png",
      mimeType: "image/png",
      buffer: png,
    });
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Confirm payment", exact: true })
      .click();
    await expect.poll(() => state.posts.length).toBe(2);
    assert.notEqual(state.posts[0].evidenceKey, state.posts[1].evidenceKey);
    await state.pending.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, status: "pending_verification" }),
    });
    await expect(
      dialog.getByRole("heading", {
        name: "Payment reported — evidence review",
      }),
    ).toBeFocused();
    await expect(dialog).toContainText("balance changes after approval");
    assert.equal(
      await dialog
        .getByRole("button", { name: "Confirm payment", exact: true })
        .count(),
      0,
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page.getByText("Reason for rejection: Unreadable transfer", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "View financial record", exact: true }),
    ).toBeFocused();
    assert.deepEqual(state.errors, []);
  } finally {
    await browser.close();
  }
});
test("authenticated instructions refresh and mutation retry follows the existing safe-replay contract", async () => {
  const { browser, page, state } = await fixture(390, {
    query: true,
    expireInstructions: true,
  });
  try {
    const dialog = page.getByRole("dialog");
    await dialog.getByText("123-456", { exact: true }).waitFor();
    assert.equal(state.instructionReads, 2);
    assert.equal(state.refreshes, 1);
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(
      dialog.getByRole("img", { name: "Transfer evidence" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Confirm payment", exact: true })
      .click();
    await expect.poll(() => state.posts.length).toBe(1);
    await state.pending.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message: "Controller rejected request" }),
    });
    await expect(dialog.getByRole("alert")).toContainText(
      "entered details are preserved",
    );
    assert.equal(state.posts.length, 1);
    assert.equal(state.refreshes, 1);
    await dialog.getByRole("button", { name: "Continue", exact: true }).click();
    await dialog
      .getByRole("button", { name: "Confirm payment", exact: true })
      .click();
    await expect.poll(() => state.posts.length).toBe(2);
    await state.pending.fulfill({
      status: 401,
      headers: { "X-Auth-Retry-Safe": "1" },
      contentType: "application/json",
      body: JSON.stringify({ message: "Guard expired token" }),
    });
    await expect.poll(() => state.posts.length).toBe(3);
    assert.equal(state.refreshes, 2);
    assert.deepEqual(state.posts[1], state.posts[2]);
    const postHeaders = state.requestHeaders.filter((value) =>
      value.path.endsWith("/pay"),
    );
    assert.equal(postHeaders[0].headers.authorization, "Bearer refreshed-1");
    assert.equal(postHeaders[2].headers.authorization, "Bearer refreshed-2");
    assert.match(postHeaders[2].headers.cookie, /session=customer-fixture/);
    await state.pending.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true, status: "pending_verification" }),
    });
    await expect(
      dialog.getByRole("heading", {
        name: "Payment reported — evidence review",
      }),
    ).toBeFocused();
    assert.deepEqual(state.errors, []);
  } finally {
    await browser.close();
  }
});
test("desktop drag/drop uses the same validation and fresh rejected resubmission", async () => {
  const { browser, page } = await fixture(1280);
  try {
    const trigger = page.getByRole("link", { name: "Report payment again" });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    const data = await page.evaluateHandle(() => {
      const dt = new DataTransfer();
      dt.items.add(new File(["gif"], "bad.gif", { type: "image/gif" }));
      return dt;
    });
    await dialog
      .getByTestId("evidence-dropzone")
      .dispatchEvent("drop", { dataTransfer: data });
    await expect(dialog.getByRole("alert")).toContainText("JPG, PNG or PDF");
    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: "old.png", mimeType: "image/png", buffer: png });
    await expect(
      dialog.getByRole("img", { name: "Transfer evidence" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await trigger.click();
    assert.equal(
      await dialog.getByRole("img", { name: "Transfer evidence" }).count(),
      0,
    );
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page.getByText("Reason for rejection: Unreadable transfer", {
        exact: true,
      }),
    ).toBeVisible();
  } finally {
    await browser.close();
  }
});
