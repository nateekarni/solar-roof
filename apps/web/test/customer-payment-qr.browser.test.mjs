import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { openFixtureBrowser } from "./platform/browser-transport.mjs";
const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
const base = fileURLToPath(new URL("../", import.meta.url));
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=";
test("stored QR images decode as owned blobs, reject invalid content and release changed, stale and unmounted URLs", async () => {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {PaymentInstructionsStep} from './features/customer/payment/payment-instructions-step';const root=createRoot(document.getElementById('root'));function Harness(){const [qr,setQr]=React.useState(${JSON.stringify(png)});window.setQr=setQr;return <PaymentInstructionsStep instructions={{available:true,accountNumber:'123',qrCodeUrl:qr}} outstanding="100" locale="en"/>}window.unmountQr=()=>root.unmount();root.render(<Harness/>);`,
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
    page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route("https://customer-qr.test/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><head><title>QR fixture</title></head><body><main id='root'></main></body></html>",
      }),
    );
    await page.goto("https://customer-qr.test/");
    await page.evaluate(() => {
      window.qrAudit = {
        created: [],
        revoked: [],
        rawSources: [],
        held: 0,
        decodeErrors: [],
      };
      const create = URL.createObjectURL.bind(URL),
        revoke = URL.revokeObjectURL.bind(URL),
        decode = window.createImageBitmap.bind(window);
      URL.createObjectURL = (blob) => {
        const value = create(blob);
        window.qrAudit.created.push(value);
        return value;
      };
      URL.revokeObjectURL = (url) => {
        window.qrAudit.revoked.push(url);
        revoke(url);
      };
      window.holdQr = false;
      window.createImageBitmap = async (...args) => {
        let image;
        try {
          image = await decode(...args);
        } catch (error) {
          window.qrAudit.decodeErrors.push(String(error));
          throw error;
        }
        if (window.holdQr) {
          window.qrAudit.held++;
          await new Promise((resolve) => {
            window.releaseQr = resolve;
          });
        }
        return image;
      };
      new MutationObserver((records) => {
        for (const record of records) {
          if (
            record.type === "attributes" &&
            record.target instanceof HTMLImageElement &&
            record.target.src.startsWith("data:")
          )
            window.qrAudit.rawSources.push(record.target.src);
          for (const node of record.addedNodes)
            if (node instanceof Element)
              for (const image of [node, ...node.querySelectorAll("img")])
                if (
                  image instanceof HTMLImageElement &&
                  image.src.startsWith("data:")
                )
                  window.qrAudit.rawSources.push(image.src);
        }
      }).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src"],
      });
    });
    await page.addScriptTag({
      type: "module",
      content: bundle.outputFiles[0].text,
    });
    const image = page.getByRole("img", { name: "Payment QR code" });
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (element) => element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
    const first = await image.getAttribute("src");
    assert.match(first, /^blob:/);
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 2;
      canvas.getContext("2d").fillRect(0, 0, 2, 2);
      window.setQr(canvas.toDataURL("image/jpeg"));
    });
    await expect.poll(() => image.getAttribute("src")).not.toBe(first);
    await expect
      .poll(() =>
        image.evaluate(
          (element) => element.complete && element.naturalWidth === 2,
        ),
      )
      .toBe(true);
    assert.equal(
      await page.evaluate((url) => window.qrAudit.revoked.includes(url), first),
      true,
    );
    const jpeg = await image.getAttribute("src");
    assert.match(jpeg, /^blob:/);
    for (const value of [
      "data:image/svg+xml;base64,PHN2Zy8+",
      "data:application/pdf;base64,JVBERi0xLjQ=",
      "data:image/png;base64,PHNjcmlwdD4=",
      "javascript:alert(1)",
      "https://foreign.test/qr.png",
      "blob:https://customer-qr.test/not-owned",
      "data:image/png;base64," + "A".repeat(5600000),
    ]) {
      await page.evaluate((value) => window.setQr(value), value);
      await expect(image).toHaveCount(0);
    }
    assert.equal(
      await page.evaluate((url) => window.qrAudit.revoked.includes(url), jpeg),
      true,
    );
    // Correct PNG signature/header, but corrupt compressed image content.
    await page.evaluate(() =>
      window.setQr(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
      ),
    );
    await expect
      .poll(() => page.evaluate(() => window.qrAudit.decodeErrors.length))
      .toBe(1);
    await expect(image).toHaveCount(0);
    await page.evaluate((value) => {
      window.holdQr = true;
      window.setQr(value);
    }, png);
    await expect.poll(() => page.evaluate(() => window.qrAudit.held)).toBe(1);
    await page.evaluate(() => window.setQr("https://foreign.test/stale.png"));
    await expect(image).toHaveCount(0);
    await page.evaluate(() => {
      window.holdQr = false;
      window.releaseQr();
    });
    await expect
      .poll(() => page.evaluate(() => window.qrAudit.created.length))
      .toBe(3);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.qrAudit.created.every((url) =>
            window.qrAudit.revoked.includes(url),
          ),
        ),
      )
      .toBe(true);
    await page.evaluate((value) => window.setQr(value), png);
    await expect(image).toBeVisible();
    await page.evaluate(() => window.unmountQr());
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.qrAudit.created.length === 4 &&
            window.qrAudit.created.every((url) =>
              window.qrAudit.revoked.includes(url),
            ),
        ),
      )
      .toBe(true);
    assert.deepEqual(await page.evaluate(() => window.qrAudit.rawSources), []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
