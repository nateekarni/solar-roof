import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { openFixtureBrowser } from "./platform/browser-transport.mjs";

const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
const requireTailwind = createRequire(
  import.meta.resolve("@tailwindcss/postcss"),
);
const postcss = requireTailwind("postcss");
const tailwind = requireTailwind("@tailwindcss/postcss");
const base = fileURLToPath(new URL("../", import.meta.url));
const record = {
  id: "first",
  siteId: "site",
  period: "2026-10",
  status: "approved",
  billingStatusView: "partially_paid",
  invoiceId: "invoice",
  invoiceNumber: "INV-001",
  receiptId: null,
  receiptNumber: null,
  amount: "963.14",
  approvedAmount: "100.00",
  outstandingAmount: "863.14",
  dueDate: "2026-11-10",
  pendingEvidenceCount: 0,
  rejectedEvidenceCount: 1,
};
const initial = {
  idKey: "id",
  columns: [],
  rows: [record],
  page: { limit: 25, nextCursor: "opaque+/=", hasMore: true },
  facets: {
    billingStatusCounts: {
      all: 99,
      awaiting_payment: 20,
      pending_verification: 30,
      partially_paid: 3,
      overdue: 5,
      paid: 41,
    },
  },
};
const user = {
  id: "customer",
  email: "customer@example.test",
  displayName: "Customer",
  role: "customer_user",
};
let cssPromise;
const bundleCache = new Map();
async function fixture(
  handleApi,
  {
    locale = "en",
    dark = false,
    width = 390,
    capabilities = {
      actions: [],
      unavailable: {},
      operationsActions: ["submit_payment"],
    },
  } = {},
) {
  cssPromise ??= readFile(
    new URL("../app/globals.css", import.meta.url),
    "utf8",
  )
    .then((source) =>
      postcss([tailwind({ base })]).process(
        source.replace(/^@import url\([^\n]+\);\r?\n/, ""),
        { from: fileURLToPath(new URL("../app/globals.css", import.meta.url)) },
      ),
    )
    .then((result) => result.css);
  if (!bundleCache.has(locale))
    bundleCache.set(
      locale,
      build({
        stdin: {
          contents: `
 import React from 'react';
 import {createRoot} from 'react-dom/client';
 import {CustomerDocumentsPage} from './features/customer/documents/customer-documents-page';
 import {authStore} from './stores/auth-store';
 authStore.setAuth(${JSON.stringify(user)},'test-access');
 const root=createRoot(document.getElementById('root'));
 window.renderCustomerDocuments=(data,query)=>root.render(<CustomerDocumentsPage initial={data} initialQuery={query} locale="${locale}" capabilities={window.initialCapabilities}/>);
 window.renderCustomerDocuments(${JSON.stringify(initial)},'search=INV&from=2026-10-01&to=2026-10-31');
 `,
          resolveDir: base,
          loader: "tsx",
        },
        bundle: true,
        write: false,
        platform: "browser",
        format: "esm",
        jsx: "automatic",
        tsconfig: base + "tsconfig.ui-tests.json",
        define: {
          "process.env": "{}",
          "process.env.NEXT_PUBLIC_API_URL": '""',
          "process.env.NODE_ENV": '"test"',
        },
      }),
    );
  const [css, bundle] = await Promise.all([
    cssPromise,
    bundleCache.get(locale),
  ]);
  const browser = await openFixtureBrowser(chromium, process.env),
    page = await browser.newPage({ viewport: { width, height: 1000 } }),
    errors = [];
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route("http://customer-documents.test/**", async (route) => {
      if (new URL(route.request().url()).pathname.startsWith("/v1/"))
        return handleApi(route);
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html class="${dark ? "dark" : ""}"><head><title>Customer documents fixture</title></head><body class="customer-portal"><main id="root" style="max-width:1100px;margin:auto;padding:16px"></main></body></html>`,
      });
    });
    await page.goto(
      "http://customer-documents.test/billing?search=INV&from=2026-10-01&to=2026-10-31",
    );
    await page.addStyleTag({ content: css });
    await page.evaluate(
      (value) => (window.initialCapabilities = value),
      capabilities,
    );
    await page.addScriptTag({
      type: "module",
      content: bundle.outputFiles[0].text,
    });
    await page.getByRole("article").waitFor();
    return { browser, page, errors };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

test("load more appends records and retry repeats the failed cursor while preserving displayed cards", async () => {
  const requests = [];
  let attempts = 0;
  const { browser, page, errors } = await fixture(async (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(query));
    if (++attempts === 1)
      return route.fulfill({ status: 503, json: { message: "unavailable" } });
    return route.fulfill({
      json: {
        ...initial,
        rows: [record, { ...record, id: "second", invoiceNumber: "INV-002" }],
        page: { limit: 25, nextCursor: null, hasMore: false },
      },
    });
  });
  try {
    await page.getByRole("button", { name: "Load more documents" }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("article").count(), 1);
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("INV-002", { exact: true }).waitFor();
    assert.equal(await page.getByRole("article").count(), 2);
    assert.equal(requests.length, 2);
    for (const query of requests) {
      assert.equal(query.cursor, "opaque+/=");
      assert.equal(query.search, "INV");
      assert.equal(query.from, "2026-10-01");
      assert.equal(query.to, "2026-10-31");
    }
    assert.equal(
      await page.getByRole("button", { name: "Load more documents" }).count(),
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("failed capabilities remain visible and fail closed through HTTP/network retry, then eligible actions recover", async () => {
  let attempts = 0;
  const { browser, page, errors } = await fixture(
    async (route) => {
      assert.equal(
        new URL(route.request().url()).pathname,
        "/v1/auth/capabilities",
      );
      attempts++;
      if (attempts === 1)
        return route.fulfill({ status: 503, json: { message: "unavailable" } });
      if (attempts === 2) return route.abort("failed");
      return route.fulfill({
        json: {
          actions: [],
          unavailable: {},
          operationsActions: ["submit_payment"],
        },
      });
    },
    { capabilities: null },
  );
  try {
    assert.equal(await page.getByRole("article").count(), 1);
    const retry = page.getByRole("button", { name: "Retry payment actions" });
    await retry.waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Pay" }).count(),
      0,
    );
    const failedHttp = page.waitForResponse(
      (response) =>
        response.url().includes("/v1/auth/capabilities") &&
        response.status() === 503,
    );
    await retry.click();
    await failedHttp;
    await retry.waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Pay" }).count(),
      0,
    );
    const failedNetwork = page.waitForEvent("requestfailed");
    await retry.click();
    await failedNetwork;
    await retry.waitFor();
    assert.equal(
      await page.getByRole("link", { name: "Pay" }).count(),
      0,
    );
    await retry.click();
    await page.getByRole("link", { name: "Pay" }).waitFor();
    assert.equal(attempts, 3);
    assert.equal(await page.getByRole("article").count(), 1);
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("successful capability retry without permission does not grant payment actions", async () => {
  const { browser, page, errors } = await fixture(
    (route) =>
      route.fulfill({
        json: { actions: [], unavailable: {}, operationsActions: [] },
      }),
    { capabilities: null },
  );
  try {
    await page.getByRole("button", { name: "Retry payment actions" }).click();
    await page.getByRole("alert").waitFor({ state: "detached" });
    assert.equal(
      await page.getByRole("link", { name: "Pay" }).count(),
      0,
    );
    assert.equal(await page.getByRole("article").count(), 1);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("filters reset the cursor, preserve search and dates, and browser back reloads its query", async () => {
  const requests = [];
  const { browser, page, errors } = await fixture(async (route) => {
    const query = new URL(route.request().url()).searchParams;
    requests.push(Object.fromEntries(query));
    const paid = query.get("billingStatusView") === "paid";
    return route.fulfill({
      json: {
        ...initial,
        rows: [
          {
            ...record,
            id: paid ? "paid" : "back",
            invoiceNumber: paid ? "PAID-001" : "BACK-001",
            billingStatusView: paid ? "paid" : "partially_paid",
          },
        ],
        page: { limit: 25, nextCursor: null, hasMore: false },
      },
    });
  });
  try {
    await page.getByRole("button", { name: "Billing period" }).click();
    await page.locator('[data-slot="calendar"]').waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Document status" }).click();
    await page.getByRole("option", { name: /^Paid/ }).click();
    await page.getByText("PAID-001", { exact: true }).waitFor();
    assert.equal(
      new URL(page.url()).searchParams.get("billingStatusView"),
      "paid",
    );
    assert.equal(requests[0].cursor, undefined);
    assert.equal(requests[0].search, "INV");
    assert.equal(requests[0].from, "2026-10-01");
    assert.equal(requests[0].to, "2026-10-31");
    await page.getByLabel("Search documents", { exact: true }).fill("New");
    await page.getByLabel("Search documents", { exact: true }).press("Enter");
    await page.waitForFunction(() => location.search.includes("search=New"));
    await page.goBack();
    await page.waitForFunction(() => location.search.includes("search=INV"));
    await page.getByText("PAID-001", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("Search documents", { exact: true }).inputValue(),
      "INV",
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("cards remain readable without page overflow across customer viewports, locales and themes", async () => {
  for (const locale of ["en", "th"])
    for (const dark of [false, true]) {
      const { browser, page, errors } = await fixture(
        (route) => route.fulfill({ json: initial }),
        { locale, dark },
      );
      try {
        assert.equal(await page.title(), "Customer documents fixture");
        assert.equal(new URL(page.url()).pathname, "/billing");
        assert.equal(
          (await page.getByRole("button", {
            name: locale === "en" ? "Document status" : "สถานะเอกสาร",
          }).textContent()).trim(),
          locale === "en" ? "All (99)" : "ทั้งหมด (99)",
        );
        const article = page.getByRole("article");
        const articleText = await article.textContent();
        for (const removed of locale === "en"
          ? ["Pending evidence", "Evidence rejected", "No receipt issued yet"]
          : ["หลักฐานรอตรวจสอบ", "หลักฐานไม่ผ่านการตรวจสอบ", "ยังไม่มีใบเสร็จรับเงิน"])
          assert.equal(articleText.includes(removed), false, removed);
        const actions = article.locator('[data-record-actions="true"]');
        const details = actions.getByRole("link", {
          name: locale === "en" ? "View details" : "ดูรายละเอียด",
        });
        const evidence = actions.getByRole("link", {
          name: locale === "en" ? "Pay" : "ชำระเงิน",
        });
        assert.equal(await details.getAttribute("data-variant"), "outline");
        assert.equal(await evidence.getAttribute("data-variant"), "default");
        for (const width of [360, 390, 768, 1280]) {
          await page.setViewportSize({ width, height: 1000 });
          assert.equal(await page.getByRole("article").count(), 1);
          assert.equal(await page.locator("table").count(), 0);
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            `${locale}/${dark}/${width}: page overflow`,
          );
          const sizes = await page
            .locator("button,input,a")
            .evaluateAll((elements) =>
              elements.flatMap((element) => {
                const rect = element.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return [];
                return [{
                  height: rect.height,
                  font: parseFloat(getComputedStyle(element).fontSize),
                  input: element.tagName === "INPUT",
                }];
              }),
            );
          assert.ok(
            sizes.every((size) => size.height >= 44),
            `${locale}/${dark}/${width}: touch targets ${JSON.stringify(sizes.filter((size) => size.height < 44))}`,
          );
          assert.ok(
            sizes.filter((size) => size.input).every((size) => size.font >= 16),
            `${locale}/${dark}/${width}: input font ${JSON.stringify(sizes.filter((size) => size.input && size.font < 16))}`,
          );
          if (
            process.env.CUSTOMER_DOCUMENTS_SCREENSHOT_DIR &&
            ((locale === "en" && !dark && width === 390) ||
              (locale === "th" && dark && width === 1280))
          )
            await page.screenshot({
              path: `${process.env.CUSTOMER_DOCUMENTS_SCREENSHOT_DIR}/documents-${locale}-${dark ? "dark" : "light"}-${width}.png`,
              fullPage: true,
            });
        }
        assert.deepEqual(errors, []);
      } finally {
        await browser.close();
      }
    }
});

test("new server navigation props replace the old records and filter state", async () => {
  const { browser, page, errors } = await fixture((route) =>
    route.fulfill({ json: initial }),
  );
  try {
    await page.evaluate(
      (data) =>
        window.renderCustomerDocuments(
          data,
          "search=NEW&billingStatusView=paid",
        ),
      {
        ...initial,
        rows: [
          {
            ...record,
            id: "new",
            invoiceNumber: "NEW-001",
            billingStatusView: "paid",
          },
        ],
        page: { limit: 25, nextCursor: null, hasMore: false },
      },
    );
    await page.getByText("NEW-001", { exact: true }).waitFor();
    assert.equal(await page.getByText("INV-001", { exact: true }).count(), 0);
    assert.equal(
      await page.getByLabel("Search documents", { exact: true }).inputValue(),
      "NEW",
    );
    await assert.doesNotReject(async () =>
      page.getByRole("button", { name: "Document status" }).getByText(/^Paid/).waitFor(),
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
