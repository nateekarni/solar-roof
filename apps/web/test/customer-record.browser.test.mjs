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
    (
      await readFile(new URL("../app/globals.css", import.meta.url), "utf8")
    ).replace(/^@import url\([^\n]+\);\r?\n/, ""),
    { from: base + "app/globals.css" },
  )
).css;
const record = {
  id: "bill",
  siteId: "site",
  period: "2026-10",
  status: "approved",
  billingStatusView: "awaiting_payment",
  invoiceId: null,
  invoiceNumber: "INV-001",
  amount: "1070.13",
  subtotal: "999.99",
  simulatedTax: "70.14",
  approvedAmount: "400.00",
  outstandingAmount: "670.13",
  pendingEvidenceCount: 0,
  rejectedEvidenceCount: 1,
  receipts: [
    { id: "receipt-one", documentNumber: "REC-001", issueDate: "2026-10-03" },
    { id: "receipt-two", documentNumber: "REC-002", issueDate: "2026-10-06" },
  ],
  payments: [
    {
      id: "old",
      amount: null,
      declaredAmount: "670.13",
      status: "rejected",
      rejectionReason: "Unreadable transfer",
      submittedAt: "2026-10-02",
      slipUrl: "https://customer-record.test/evidence.bin",
    },
    {
      id: "image",
      amount: null,
      status: "rejected",
      slipUrl: "https://customer-record.test/missing.png",
    },
    {
      id: "stored-data",
      amount: null,
      status: "paid",
      submittedAt: "2026-10-04",
      slipUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
    },
    {
      id: "unsafe",
      amount: null,
      status: "rejected",
      submittedAt: "2026-10-08",
      slipUrl: "javascript:alert(1)",
    },
  ],
};
for (const width of [390, 768, 1280])
  test(`customer record preview fits ${width}px, traps focus, restores focus and retains download on failure`, async () => {
    const locale = width === 768 ? "th" : "en";
    const bundle = await build({
      stdin: {
        contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {CustomerFinancialRecordPage} from './features/customer/records/customer-financial-record-page';createRoot(document.getElementById('root')).render(<CustomerFinancialRecordPage row={${JSON.stringify(record)}} locale="${locale}" capabilities={{actions:[],unavailable:{},operationsActions:['submit_payment','verify_payment']}}/>);`,
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
      page = await browser.newPage({ viewport: { width, height: 900 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.route("https://customer-record.test/**", (route) =>
        route.request().url().endsWith("missing.png")
          ? route.fulfill({ status: 404, body: "" })
          : route.fulfill({
              contentType: "text/html",
              body: `<!doctype html><html class="${width === 768 ? "dark" : ""}"><head><title>Record fixture</title></head><body class="customer-portal"><main id="root" style="max-width:1100px;margin:auto;padding:16px"></main></body></html>`,
            }),
      );
      await page.goto("https://customer-record.test/records/billing/bill");
      await page.addStyleTag({ content: css });
      await page.addScriptTag({
        type: "module",
        content: bundle.outputFiles[0].text,
      });
      const preview = locale === "en" ? "Preview document" : "ดูตัวอย่างเอกสาร",
        close = locale === "en" ? "Close" : "ปิด",
        download = locale === "en" ? "Download" : "ดาวน์โหลด";
      await page.getByText("Unreadable transfer").waitFor();
      assert.deepEqual(
        await page
          .locator("[data-document-id]")
          .evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-document-id")),
          ),
        [
          "payment:old",
          "receipt:receipt-one",
          "payment:stored-data",
          "receipt:receipt-two",
          "payment:unsafe",
          "payment:image",
        ],
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const trigger = page
        .locator('[data-document-id="payment:old"]')
        .getByRole("button", { name: preview });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.getByRole("link", { name: download }).waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.width <= width);
      if (width < 768) {
        assert.equal(Math.round(bounds.width), width);
        assert.equal(Math.round(bounds.height), 900);
      } else assert.ok(bounds.width < width);
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await dialog.evaluate((el) => el.contains(document.activeElement)),
          true,
        );
      }
      const closeButton = dialog.getByRole("button", { name: close });
      const closeBox = await closeButton.boundingBox();
      const closeMinHeight = await closeButton.evaluate(
        (element) => getComputedStyle(element).minHeight,
      );
      assert.ok(
        Number.parseFloat(closeMinHeight) >= 44,
        JSON.stringify({
          box: closeBox,
          className: await closeButton.getAttribute("class"),
          minHeight: closeMinHeight,
        }),
      );
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      await expect(trigger).toBeFocused();
      await page
        .locator('[data-document-id="payment:image"]')
        .getByRole("button", { name: preview })
        .click();
      await dialog.getByRole("alert").waitFor();
      await dialog.getByRole("link", { name: download }).waitFor();
      await dialog.getByRole("button", { name: close }).click();
      await page
        .locator('[data-document-id="payment:stored-data"]')
        .getByRole("button", { name: preview })
        .click();
      await expect(dialog.getByRole("img")).toBeVisible();
      assert.match(
        await dialog.getByRole("link", { name: download }).getAttribute("href"),
        /^blob:/,
      );
      assert.match(await dialog.getByRole("img").getAttribute("src"), /^blob:/);
      await dialog.getByRole("button", { name: close }).click();
      await page
        .locator('[data-document-id="payment:unsafe"]')
        .getByRole("button", { name: preview })
        .click();
      await dialog.getByRole("alert").waitFor();
      assert.equal(await dialog.getByRole("link").count(), 0);
      assert.equal(await dialog.getByRole("img").count(), 0);
      await dialog.getByRole("button", { name: close }).click();
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
