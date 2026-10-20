import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { openFixtureBrowser } from "./browser-transport.mjs";
import {
  assertExternalScreenshotDirectory,
  allowOwnedFixtureRequest,
  withFixtureResources,
} from "./customer-portal-fixture-guards.mjs";

// Browser plugin not available: run the repository's regular Playwright transport.
// HTTP and server-route props are deterministic; React, CSS, navigation, Radix,
// account controls, file reads and the authenticated client are production code.
const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
const requireCss = createRequire(import.meta.resolve("@tailwindcss/postcss"));
const base = fileURLToPath(new URL("../../", import.meta.url));
export const recordPath = "/records/billing/bill-001";
export const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=",
  "base64",
);
const user = {
  id: "customer",
  email: "customer@example.test",
  displayName: "Customer",
  role: "customer_user",
};
export const alternatePng = await readFile(
  base + "public/brand/solar-roof-mark.png",
);
const capabilities = {
  actions: [],
  unavailable: {},
  operationsActions: ["submit_payment"],
};
const bundlePromise = build({
  stdin: {
    contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {ThemeProvider} from 'next-themes';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {PathnameContext} from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import {LocaleProvider} from './providers/locale-provider';
import {CustomerAppShell} from './features/customer/shell/customer-app-shell';
import {CustomerHomePage} from './features/customer/home/customer-home-page';
import {CustomerDocumentsPage} from './features/customer/documents/customer-documents-page';
import {CustomerFinancialRecordPage} from './features/customer/records/customer-financial-record-page';
import {CustomerAccountPage} from './features/customer/account/customer-account-page';
import {authStore} from './stores/auth-store';
const data=window.fixtureData;
authStore.setAuth({...${JSON.stringify(user)},preferredLanguage:data.locale},'fixture-access');
const router={back:()=>history.back(),forward:()=>history.forward(),refresh:()=>location.reload(),push:href=>location.assign(href),replace:href=>location.replace(href),prefetch:()=>Promise.resolve()};
// Match production: the server's cookie-derived page prop stays fixed for the
// lifetime of this document. Only the production provider can update live copy.
function Pages(){return <CustomerAppShell>{location.pathname==='/'?<CustomerHomePage initial={{status:'ready',data:data.home}} locale={data.locale}/>:location.pathname==='/billing'?<CustomerDocumentsPage initial={data.documents} initialQuery={location.search.slice(1)} locale={data.locale} capabilities={data.capabilities}/>:location.pathname==='/settings'?<CustomerAccountPage/>:<CustomerFinancialRecordPage row={data.row} locale={data.locale} capabilities={data.capabilities}/>}</CustomerAppShell>}
createRoot(document.getElementById('root')).render(<AppRouterContext.Provider value={router}><PathnameContext.Provider value={location.pathname}><ThemeProvider attribute="class" defaultTheme={data.theme} enableSystem={false}><LocaleProvider initialLocale={data.locale}><Pages/></LocaleProvider></ThemeProvider></PathnameContext.Provider></AppRouterContext.Provider>);
`,
    resolveDir: base,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  tsconfig: base + "tsconfig.ui-tests.json",
  define: {
    "process.env": "{}",
    "process.env.NODE_ENV": '"test"',
    "process.env.NEXT_PUBLIC_API_URL": '""',
  },
});
const cssPromise = readFile(base + "app/globals.css", "utf8")
  .then((source) =>
    requireCss("postcss")([
      requireCss("@tailwindcss/postcss")({ base }),
    ]).process(source.replace(/^@import url\([^\n]+\);\r?\n/, ""), {
      from: base + "app/globals.css",
    }),
  )
  .then((result) => result.css);

export async function customerFixture({
  width = 390,
  locale = "en",
  theme = "light",
  rejected = false,
  route = "/",
  reducedMotion = "reduce",
} = {}) {
  return withFixtureResources(async (own) => {
    const [bundle, css] = await Promise.all([bundlePromise, cssPromise]);
    // Chromium restarts attachment downloads outside route interception. Serve
    // just this owned file over loopback so completion (not only an event) is real.
    // Acquire it before the browser so it stays alive until browser cleanup ends.
    const downloads = createServer((request, response) => {
      if (request.url !== "/evidence/previous.bin") {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="previous.bin"',
      });
      response.end("downloadable original evidence");
    });
    own(
      () =>
        new Promise((resolve, reject) => {
          if (!downloads.listening) {
            resolve();
            return;
          }
          downloads.close((error) => (error ? reject(error) : resolve()));
          downloads.closeAllConnections();
        }),
    );
    await new Promise((resolve, reject) => {
      downloads.once("error", reject);
      downloads.listen(0, "127.0.0.1", resolve);
    });
    const origin = `http://localhost:${downloads.address().port}`;
    const browser = await openFixtureBrowser(chromium, process.env);
    own(() => browser.close());
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      timezoneId: "Asia/Bangkok",
      reducedMotion,
    });
    own(() => context.close());
    const page = await context.newPage();
    own(() => page.close());
    page.setDefaultTimeout(7000);
    const state = {
      errors: [],
      consoleErrors: [],
      unexpected: [],
      calls: [],
      posts: [],
      locale,
      theme,
      notifications: { criticalEmailAlert: true, inAppNotification: true },
      notificationFeed: {
        unreadCount: 1,
        rows: [
          {
            id: "document:invoice-001",
            title: "Issued invoice",
            detail: "INV-001",
            destination: "/records/billing/bill-001?document=invoice-001",
            createdAt: "2026-10-18T05:00:00.000Z",
            readAt: null,
            kind: "workflow",
            siteName: "Campus roof",
          },
        ],
      },
      row: {
        id: "bill-001",
        siteId: "site-001",
        period: "2026-10",
        status: "approved",
        billingStatusView: "awaiting_payment",
        invoiceId: "invoice-001",
        invoiceNumber: "INV-001",
        amount: "1070.13",
        approvedAmount: "0.00",
        outstandingAmount: "1070.13",
        consumedKwh: "250.00",
        rate: "4.00",
        subtotal: "1000.00",
        simulatedTax: "70.13",
        dueDate: "2026-11-10",
        issueDate: "2026-10-01",
        pendingEvidenceCount: 0,
        rejectedEvidenceCount: rejected ? 1 : 0,
        payments: rejected
          ? [
              {
                id: "rejected-001",
                amount: null,
                declaredAmount: "1070.13",
                status: "rejected",
                rejectionReason: "Unreadable transfer reference",
                submittedAt: "2026-10-02",
                slipUrl: `${origin}/evidence/previous.bin`,
              },
            ]
          : [],
      },
    };
    const documents = () => ({
      idKey: "id",
      columns: [],
      rows: [state.row],
      page: { limit: 25, nextCursor: null, hasMore: false },
      facets: {
        billingStatusCounts: { all: 1, [state.row.billingStatusView]: 1 },
      },
    });
    const home = () => {
      const bill = {
        ...state.row,
        status: state.row.billingStatusView,
        billedAmount: state.row.amount,
        tax: state.row.simulatedTax,
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        canPay: state.row.pendingEvidenceCount === 0,
      };
      return {
        range: "7d",
        site: { id: "site-001", name: "Campus roof", customerName: "Acme" },
        focusedBill: bill,
        additionalOpenBillCount: 0,
        energySeries: [
          { date: "2026-10-17", value: 12.5 },
          { date: "2026-10-18", value: 17.25 },
        ],
        recentFinancialRecords: [bill],
        capabilities: { canPay: bill.canPay, canViewDocuments: true },
      };
    };
    page.on("pageerror", (error) => state.errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") state.consoleErrors.push(message.text());
    });
    await context.route("**/*", async (intercepted) => {
      if (
        !(await allowOwnedFixtureRequest(intercepted, origin, state.unexpected))
      )
        return;
      const request = intercepted.request(),
        path = new URL(request.url()).pathname;
      if (
        path === "/v1/public/branding/logo" ||
        path === "/brand/solar-roof-mark.png"
      )
        return intercepted.fulfill({
          contentType: "image/png",
          body: alternatePng,
        });
      if (path === "/fixture.mjs")
        return intercepted.fulfill({
          contentType: "application/javascript",
          body: bundle.outputFiles[0].text,
        });
      if (path === "/fixture.css")
        return intercepted.fulfill({ contentType: "text/css", body: css });
      if (path.startsWith("/evidence/")) return intercepted.continue();
      if (path.startsWith("/v1/")) {
        state.calls.push({
          path,
          method: request.method(),
          body: request.postDataJSON(),
        });
        const json = (value) => intercepted.fulfill({ json: value });
        if (path === "/v1/customer/portal/payment-instructions")
          return json({
            available: true,
            bankName: "Fixture Bank",
            accountName: "Solar Roof",
            accountNumber: "123-456",
            branchName: "Bangkok",
          });
        if (
          path === "/v1/billing-cycles/bill-001/pay" &&
          request.method() === "POST"
        ) {
          const body = request.postDataJSON();
          state.posts.push(body);
          state.row.payments.push({
            id: `pending-${state.posts.length}`,
            amount: null,
            declaredAmount: body.amount,
            status: "pending_verification",
            submittedAt: "2026-10-18T05:00:00Z",
            slipUrl: body.slipUrl,
          });
          state.row.pendingEvidenceCount++;
          state.row.billingStatusView = "pending_verification";
          return json({ success: true, status: "pending_verification" });
        }
        if (path === "/v1/customer/portal/home") return json(home());
        if (path === "/v1/operations/billing") return json(documents());
        if (path === "/v1/operations/documents/invoice-001/original")
          return json({
            id: "invoice-001",
            hash: "fixture-hash",
            previewUrl: "/v1/operations/documents/invoice-001/pdf",
            downloadUrl: "/v1/operations/documents/invoice-001/pdf",
          });
        if (path === "/v1/operations/contracts")
          return json({
            rows: [
              {
                id: "contract",
                companyName: "Acme",
                taxAddress: "Bangkok",
                taxId: "1234567890123",
                taxBranch: "00001",
                siteName: "Campus roof",
              },
            ],
            page: { hasMore: false, nextCursor: null },
          });
        if (path === "/v1/auth/two-factor")
          return json({
            enabled: false,
            pending: false,
            recoveryCodesRemaining: 0,
            emailAvailable: true,
          });
        if (path === "/v1/notifications/settings") {
          if (request.method() === "PUT")
            state.notifications = request.postDataJSON();
          return json(state.notifications);
        }
        if (path === "/v1/me/notification-feed")
          return json(state.notificationFeed);
        if (path === "/v1/me/notification-feed/read-all") {
          state.notificationFeed.unreadCount = 0;
          state.notificationFeed.rows = state.notificationFeed.rows.map((row) => ({
            ...row,
            readAt: row.readAt ?? "2026-10-19T00:00:00.000Z",
          }));
          return json({ unreadCount: 0 });
        }
        if (path === "/v1/me/notification-feed/read") {
          const ids = request.postDataJSON()?.ids ?? [];
          state.notificationFeed.rows = state.notificationFeed.rows.map((row) =>
            ids.includes(row.id)
              ? { ...row, readAt: row.readAt ?? "2026-10-19T00:00:00.000Z" }
              : row,
          );
          state.notificationFeed.unreadCount = state.notificationFeed.rows.filter(
            (row) => !row.readAt,
          ).length;
          return json({ unreadCount: state.notificationFeed.unreadCount });
        }
        if (path === "/v1/me/preferences") {
          const body = request.postDataJSON();
          state.locale = body.preferredLanguage ?? state.locale;
          state.theme = body.preferredTheme ?? state.theme;
          return json(body);
        }
        state.unexpected.push(path);
        return intercepted.fulfill({
          status: 500,
          json: { message: "Unexpected fixture endpoint" },
        });
      }
      if (!["/", "/billing", "/settings", recordPath].includes(path)) {
        state.unexpected.push(path);
        return intercepted.fulfill({
          status: 404,
          body: "Unknown fixture route",
        });
      }
      const data = {
        row: state.row,
        documents: documents(),
        home: home(),
        capabilities,
        locale: state.locale,
        theme: state.theme,
      };
      return intercepted.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="${state.locale}" class="${state.theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Solar Roof Customer Portal</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script>window.fixtureData=${JSON.stringify(data).replaceAll("<", "\\u003c")}</script><script type="module" src="/fixture.mjs"></script></body></html>`,
      });
    });
    await page.goto(origin + route);
    await page.locator("#customer-main h1").waitFor();
    return {
      browser,
      context,
      page,
      origin,
      state,
    };
  });
}

export async function checkSurface(fixture, pathname) {
  const { page, state } = fixture;
  assert.equal(new URL(page.url()).pathname, pathname);
  assert.equal(await page.title(), "Solar Roof Customer Portal");
  await expect(page.locator("#customer-main h1")).toBeVisible();
  assert.ok((await page.locator("#customer-main").innerText()).length > 100);
  assert.equal(
    await page
      .locator(
        "nextjs-portal,vite-error-overlay,webpack-dev-server-client-overlay",
      )
      .count(),
    0,
  );
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -0.5 || rect.right > innerWidth + 0.5);
      })
      .slice(0, 5)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 80),
          className: String(element.className).slice(0, 160),
          left: rect.left,
          right: rect.right,
          width: rect.width,
        };
      }),
  }));
  assert.equal(
    overflow.width,
    page.viewportSize().width,
    `No page-level horizontal overflow: ${JSON.stringify(overflow.offenders)}`,
  );
  const visibleDialogs = page.getByRole("dialog").filter({ visible: true });
  const root = (await visibleDialogs.count())
    ? visibleDialogs.first()
    : page.locator(".customer-portal").first();
  if (await visibleDialogs.count()) {
    const box = await root.boundingBox();
    if (
      page.viewportSize().width < 768 &&
      !(await root.getAttribute("data-slot"))
    )
      assert.deepEqual(
        box,
        { x: 0, y: 0, ...page.viewportSize() },
        "Payment and preview fill the mobile viewport",
      );
    else
      assert.ok(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= page.viewportSize().width &&
          box.y + box.height <= page.viewportSize().height,
        "Dialog stays inside the viewport",
      );
  }
  const sizes = await root
    .locator(
      "button:visible,a:visible,select:visible,input:not([type=file]):not([type=radio]):visible,textarea:visible,summary:visible",
    )
    .evaluateAll((elements) =>
      elements
        .filter(
          (el) => {
            const rect = el.getBoundingClientRect();
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              !el.classList.contains("customer-skip-link") &&
              el.getAttribute("data-slot") !== "switch"
            );
          },
        )
        .map((el) => ({
          tag: el.tagName,
          id: el.id,
          dataSlot: el.getAttribute("data-slot"),
          className: String(el.className).slice(0, 160),
          text: el.getAttribute("aria-label") || el.textContent.slice(0, 50),
          height: el.getBoundingClientRect().height,
          width: el.getBoundingClientRect().width,
          font: parseFloat(getComputedStyle(el).fontSize),
        })),
    );
  assert.deepEqual(
    sizes.filter((size) => size.height < 44 || size.width < 44),
    [],
    "44px interactive targets",
  );
  assert.deepEqual(
    sizes.filter(
      (size) =>
        ["INPUT", "SELECT", "TEXTAREA"].includes(size.tag) && size.font < 16,
    ),
    [],
    "16px form text",
  );
  assert.deepEqual(state.errors, [], "No page errors");
  for (const radio of await root.locator('input[type="radio"]:visible').all())
    assert.ok(
      await radio.evaluate(
        (el) => el.closest("label").getBoundingClientRect().height >= 44,
      ),
      "Radio labels provide 44px touch targets",
    );
  assert.deepEqual(state.consoleErrors, [], "No console errors");
  assert.deepEqual(state.unexpected, [], "Only owned fixture routes used");
}

export async function openPayment(page) {
  await page.locator('#customer-main a[href$="?payment=1"]').first().click();
  await expect(
    page.getByRole("dialog").getByText("123-456", { exact: true }),
  ).toBeVisible();
}
export async function evidenceStep(
  page,
  { amount, name = "transfer.png", buffer = png } = {},
) {
  const dialog = page.getByRole("dialog");
  if (amount) {
    await dialog
      .getByRole("tab", { name: /Other amount|ระบุยอดอื่น/ })
      .click();
    await dialog.locator("#customer-amount").fill(amount);
  }
  await dialog
    .getByRole("button", { name: /Transfer date|วันที่โอน/, exact: true })
    .click();
  const datePicker = page
    .locator('[data-slot="sheet-content"],[data-slot="popover-content"]')
    .filter({ has: page.locator('[data-slot="calendar"]') });
  await datePicker.locator('[data-day="2026-10-18"] button').click();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name, mimeType: "image/png", buffer });
  await expect(
    dialog.getByRole("img", { name: /Transfer evidence|หลักฐานการโอน/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", {
      name: /Continue|ดำเนินการต่อ/,
    }),
  ).toBeEnabled();
  await dialog
    .getByRole("button", { name: /Continue|ดำเนินการต่อ/ })
    .click();
  await expect(dialog.locator('[data-slot="dialog-title"]')).toHaveText(
    /Review your submission|ตรวจสอบข้อมูลก่อนส่ง/,
  );
  await expect(dialog.locator('[data-slot="dialog-title"]')).toBeFocused();
  await expect(
    dialog.getByRole("button", {
      name: /Confirm payment|ยืนยันการชำระเงิน/,
    }),
  ).toBeEnabled();
}
export async function submitPayment(page) {
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: /Confirm payment|ยืนยันการชำระเงิน/ })
    .click();
  await expect(dialog.locator("#customer-amount")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toBeVisible();
}
export async function screenshot(page, name) {
  if (!process.env.CUSTOMER_PORTAL_SCREENSHOT_DIR) return;
  const target = assertExternalScreenshotDirectory(
    process.env.CUSTOMER_PORTAL_SCREENSHOT_DIR,
    resolve(base, "../.."),
  );
  await mkdir(target, { recursive: true });
  if (!(await page.getByRole("dialog").count()))
    await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: resolve(target, name + ".png"),
    fullPage: false,
  });
}
