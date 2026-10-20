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
const base = fileURLToPath(new URL("../", import.meta.url));
const user = {
  id: "customer",
  role: "customer_user",
  displayName: "Customer",
  email: "customer@example.test",
  phoneNumber: null,
};
const bundle = await build({
  stdin: {
    contents: `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {CustomerAccountPage} from './features/customer/account/customer-account-page';
import {LocaleProvider} from './providers/locale-provider';
import {authStore} from './stores/auth-store';
authStore.setAuth(${JSON.stringify(user)}, 'test-access');
createRoot(document.getElementById('root')).render(<LocaleProvider initialLocale="en"><CustomerAccountPage/></LocaleProvider>);
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
    "process.env.NODE_ENV": '"test"',
    "process.env.NEXT_PUBLIC_API_URL": '""',
  },
});
const source = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const css = (
  await requireTailwind("postcss")([
    requireTailwind("@tailwindcss/postcss")({ base }),
  ]).process(source.replace(/^@import url\([^\n]+\);\r?\n/, ""), {
    from: base + "app/globals.css",
  })
).css;

test("mounted account saves only customer fields, rolls preferences back, and preserves secure dialogs", async () => {
  const browser = await openFixtureBrowser(chromium, process.env);
  const page = await browser.newPage({
    viewport: { width: 390, height: 1000 },
  });
  const calls = [],
    errors = [];
  let failNotifications = true,
    failOrganization = true;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("http://customer-account.test/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (!path.startsWith("/v1/"))
      return route.fulfill({
        contentType: "text/html",
        body: '<html><body class="customer-portal"><main id="root" style="max-width:1100px;margin:auto;padding:16px"></main></body></html>',
      });
    calls.push({
      path,
      method: request.method(),
      body: request.postDataJSON(),
    });
    const json = (body) => route.fulfill({ json: body });
    if (path === "/v1/operations/contracts") {
      if (failOrganization) {
        failOrganization = false;
        return route.fulfill({ status: 503, json: { message: "unavailable" } });
      }
      return json({
        rows: [
          {
            id: "contract",
            companyName: "Acme",
            taxAddress: "Bangkok",
            taxId: "1234567890123",
            taxBranch: "00001",
            siteName: "Roof",
          },
        ],
        page: { hasMore: false, nextCursor: null },
      });
    }
    if (path === "/v1/notifications/settings") {
      if (request.method() === "GET")
        return json({ criticalEmailAlert: true, inAppNotification: true });
      if (failNotifications) {
        failNotifications = false;
        return route.fulfill({ status: 503, json: { message: "unavailable" } });
      }
      return json(request.postDataJSON());
    }
    if (path === "/v1/me/profile")
      return json({
        displayName: request.postDataJSON().displayName,
        phoneNumber: request.postDataJSON().phoneNumber,
      });
    if (path === "/v1/auth/two-factor")
      return json({
        enabled: false,
        pending: false,
        recoveryCodesRemaining: 0,
        emailAvailable: true,
      });
    return route.fulfill({
      status: 500,
      json: { message: "Unexpected endpoint" },
    });
  });
  try {
    await page.goto("http://customer-account.test/settings");
    await page.addStyleTag({ content: css });
    await page.addScriptTag({
      content: bundle.outputFiles[0].text,
      type: "module",
    });
    await page.getByRole("heading", { name: "Your profile" }).waitFor();
    const profileCard = page.locator('[aria-labelledby="customer-profile-title"]');
    await profileCard.getByText("customer@example.test", { exact: true }).waitFor();
    await profileCard.getByText("-", { exact: true }).waitFor();
    assert.equal(await profileCard.locator(".border-t").count(), 0);
    for (const title of [
      "Contracted organization",
      "Notification preferences",
      "Security",
    ]) {
      const section = page.getByRole("heading", { name: title }).locator("xpath=ancestor::section[1]");
      const heading = section.getByRole("heading", { name: title });
      const description = section.locator('[data-customer-card-heading="true"] > p');
      const [headingBox, descriptionBox] = await Promise.all([
        heading.boundingBox(),
        description.boundingBox(),
      ]);
      assert.ok(headingBox && descriptionBox);
      assert.ok(descriptionBox.y - (headingBox.y + headingBox.height) <= 8);
    }
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByText("Acme", { exact: true }).waitFor();
    const email = page.getByRole("switch", {
      name: "Email alerts for invoices and critical updates",
    });
    const switchBox = await email.boundingBox();
    assert.ok(switchBox && switchBox.width >= 28 && switchBox.width <= 40);
    assert.ok(switchBox && switchBox.height >= 16 && switchBox.height <= 24);
    const accountLists = page.locator('[data-customer-account-list="true"]');
    assert.equal(await accountLists.count(), 2);
    for (const list of await accountLists.all()) {
      const rows = list.locator(":scope > div");
      assert.equal(
        await rows.evaluateAll((elements) =>
          elements.every(
            (element) => getComputedStyle(element).borderTopWidth === "0px",
          ),
        ),
        true,
      );
      if ((await rows.count()) > 1) {
        const first = await rows.nth(0).boundingBox();
        const second = await rows.nth(1).boundingBox();
        assert.ok(first && second && Math.abs(second.y - (first.y + first.height)) < 1);
      }
    }
    await email.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "previous preferences have been restored" })
      .waitFor();
    assert.equal(await email.getAttribute("aria-checked"), "true");
    await email.click();
    await page
      .getByRole("status")
      .filter({ hasText: "Your preferences have been saved" })
      .waitFor();
    assert.equal(await email.getAttribute("aria-checked"), "false");
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page
      .getByLabel("Display Name", { exact: true })
      .fill("  New Customer  ");
    await page
      .getByLabel("Phone number", { exact: true })
      .fill("  +66 81 234 5678  ");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.getByText("New Customer", { exact: true }).waitFor();
    await profileCard.getByText("+66 81 234 5678", { exact: true }).waitFor();
    assert.deepEqual(
      calls.find((call) => call.path === "/v1/me/profile").body,
      { displayName: "New Customer", phoneNumber: "+66 81 234 5678" },
    );
    assert.deepEqual(
      calls
        .filter(
          (call) =>
            call.path === "/v1/notifications/settings" && call.method === "PUT",
        )
        .map((call) => call.body),
      [
        {
          criticalEmailAlert: false,
          inAppNotification: true,
          emailAddress: "customer@example.test",
        },
        {
          criticalEmailAlert: false,
          inAppNotification: true,
          emailAddress: "customer@example.test",
        },
      ],
    );
    await page
      .getByRole("button", { name: "Change password", exact: true })
      .click();
    await page
      .getByLabel("Current password", { exact: true })
      .fill("existing-password");
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page
      .getByLabel("Confirm new password", { exact: true })
      .fill("short");
    await page.getByRole("button", { name: "Update password" }).click();
    await page
      .getByRole("dialog")
      .getByText("New password must contain between 12 and 128 characters.", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      calls.filter((call) => call.path === "/v1/auth/password").length,
      0,
    );
    const dialog = page.getByRole("dialog");
    assert.ok((await dialog.getAttribute("class")).includes("customer-portal"));
    for (const control of await dialog
      .locator("button:visible,input:visible")
      .all()) {
      const box = await control.boundingBox();
      assert.ok(box.height >= 44, JSON.stringify(box));
    }
    for (const control of await dialog.locator("input:visible").all())
      assert.ok(
        await control.evaluate(
          (node) => parseFloat(getComputedStyle(node).fontSize) >= 16,
        ),
      );
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Enable 2FA", exact: true }).click();
    await page.getByRole("button", { name: /Authenticator App/ }).click();
    await page.getByLabel("Current password", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Edit profile" }).click();
    await page
      .getByRole("button", { name: "Upload new photo", exact: true })
      .waitFor();
    assert.equal(
      await page.locator('input[type="file"]').getAttribute("accept"),
      "image/png,image/jpeg",
    );
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.locator('#customer-profile-display-name').waitFor({ state: "hidden" });
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      for (const control of await page
        .locator('button:not([data-slot="switch"]):visible,input:not([type="file"]):visible,a:visible')
        .all()) {
        const box = await control.boundingBox();
        assert.ok(box.height >= 44, `${width}: ${JSON.stringify(box)}`);
      }
    }
    assert.deepEqual([...new Set(calls.map((call) => call.path))].sort(), [
      "/v1/auth/two-factor",
      "/v1/me/profile",
      "/v1/notifications/settings",
      "/v1/operations/contracts",
    ]);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
