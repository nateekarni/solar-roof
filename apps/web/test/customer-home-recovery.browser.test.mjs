import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { openFixtureBrowser } from "./platform/browser-transport.mjs";

const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
const user = {
  id: "customer-test",
  email: "customer@example.test",
  displayName: "Customer",
  role: "customer_user",
};
const initial = {
  range: "7d",
  site: { id: "s", name: "Campus", customerName: "School" },
  focusedBill: null,
  additionalOpenBillCount: 0,
  energySeries: [{ date: "2026-10-18", value: 17.125 }],
  recentFinancialRecords: [],
  capabilities: { canPay: false, canViewDocuments: true },
};
const thirtyDays = {
  ...initial,
  range: "30d",
  energySeries: [{ date: "2026-10-17", value: 99.25 }],
};
let bundlePromise;
async function fixture(handleApi) {
  bundlePromise ??= build({
    stdin: {
      contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {CustomerEnergyChart} from './features/customer/home/customer-energy-chart';
    import {authStore} from './stores/auth-store';
    authStore.setAuth(${JSON.stringify(user)},'expired-access');
    createRoot(document.getElementById('root')).render(<CustomerEnergyChart initial={${JSON.stringify(initial)}} locale="en"/>);
  `,
      resolveDir: fileURLToPath(new URL("../", import.meta.url)),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    tsconfig: fileURLToPath(
      new URL("../tsconfig.ui-tests.json", import.meta.url),
    ),
    define: {
      "process.env": "{}",
      "process.env.NEXT_PUBLIC_API_URL": '""',
      "process.env.API_INTERNAL_URL": '""',
      "process.env.NODE_ENV": '"test"',
    },
  });
  const bundle = await bundlePromise;
  const browser = await openFixtureBrowser(chromium, process.env);
  const page = await browser.newPage();
  const errors = [];
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.route("http://customer-home.test/**", async (route) => {
      if (new URL(route.request().url()).pathname.startsWith("/v1/"))
        return handleApi(route);
      return route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><title>Customer energy test</title><div id="root"></div></html>',
      });
    });
    await page.goto("http://customer-home.test/");
    await page.addScriptTag({
      type: "module",
      content: bundle.outputFiles[0].text,
    });
    await page.getByRole("button", { name: "7 days", exact: true }).waitFor();
    await page.getByText("View energy readings", { exact: true }).click();
    return { browser, page, errors };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

test("mounted range request recovers expired access through the existing refresh and authenticated GET retry", async () => {
  const requests = [];
  const { browser, page, errors } = await fixture(async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({
      path,
      method: request.method(),
      authorization: request.headers().authorization,
    });
    if (path === "/v1/auth/refresh")
      return route.fulfill({ json: { user, accessToken: "renewed-access" } });
    assert.equal(path, "/v1/customer/portal/home");
    assert.equal(new URL(request.url()).search, "?range=30d");
    if (request.headers().authorization !== "Bearer renewed-access")
      return route.fulfill({ status: 401, json: { message: "expired" } });
    return route.fulfill({ json: thirtyDays });
  });
  try {
    await page.getByRole("button", { name: "30 days", exact: true }).click();
    await page
      .getByRole("cell", { name: "99.25", exact: true })
      .waitFor({ state: "attached" });
    assert.deepEqual(requests, [
      {
        path: "/v1/customer/portal/home",
        method: "GET",
        authorization: "Bearer expired-access",
      },
      { path: "/v1/auth/refresh", method: "POST", authorization: undefined },
      {
        path: "/v1/customer/portal/home",
        method: "GET",
        authorization: "Bearer renewed-access",
      },
    ]);
    assert.equal(
      await page
        .getByRole("button", { name: "30 days", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page
        .getByText("Energy data is unavailable", { exact: false })
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("failed 7d to 30d switch retains actual 7d selection and readings, then retry selects 30d only on success", async () => {
  let release;
  let requested;
  let attempts = 0;
  const waiting = new Promise((resolve) => {
    requested = resolve;
  });
  const responseReady = new Promise((resolve) => {
    release = resolve;
  });
  const { browser, page, errors } = await fixture(async (route) => {
    assert.equal(new URL(route.request().url()).search, "?range=30d");
    attempts++;
    if (attempts === 1) {
      requested();
      await responseReady;
      return route.fulfill({ status: 503, json: { message: "unavailable" } });
    }
    return route.fulfill({ json: thirtyDays });
  });
  try {
    const seven = page.getByRole("button", { name: "7 days", exact: true });
    const thirty = page.getByRole("button", { name: "30 days", exact: true });
    await thirty.click();
    await waiting;
    assert.equal(
      await seven.getAttribute("aria-pressed"),
      "true",
      "loading must retain the displayed 7d selection",
    );
    assert.equal(await thirty.getAttribute("aria-pressed"), "false");
    release();
    await page
      .getByRole("button", { name: "Try again", exact: true })
      .waitFor();
    assert.equal(
      await seven.getAttribute("aria-pressed"),
      "true",
      "failure must retain the displayed 7d selection",
    );
    assert.equal(await thirty.getAttribute("aria-pressed"), "false");
    assert.match(
      await page.getByRole("status").innerText(),
      /Showing the last available data/,
    );
    assert.equal(
      await page.getByRole("cell", { name: "17.13", exact: true }).count(),
      1,
    );
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page
      .getByRole("cell", { name: "99.25", exact: true })
      .waitFor({ state: "attached" });
    assert.equal(await seven.getAttribute("aria-pressed"), "false");
    assert.equal(await thirty.getAttribute("aria-pressed"), "true");
    assert.equal(attempts, 2);
    assert.deepEqual(errors, []);
  } finally {
    release();
    await browser.close();
  }
});
