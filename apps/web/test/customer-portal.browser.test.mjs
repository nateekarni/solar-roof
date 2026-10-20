import assert from "node:assert/strict";
import test from "node:test";
import { expect } from "@playwright/test";
import {
  customerFixture,
  checkSurface,
  openPayment,
  evidenceStep,
  submitPayment,
  recordPath,
  screenshot,
  alternatePng,
} from "./platform/customer-portal-fixture.mjs";

function channelSpread(hex) {
  const value = hex.trim().replace("#", "");
  const channels = [0, 2, 4].map((start) =>
    Number.parseInt(value.slice(start, start + 2), 16),
  );
  return Math.max(...channels) - Math.min(...channels);
}

function isPurple(hex) {
  const value = hex.trim().replace("#", "");
  const [red, green, blue] = [0, 2, 4].map((start) =>
    Number.parseInt(value.slice(start, start + 2), 16),
  );
  return red - green > 12 && blue - green > 12;
}

async function openProfileMenu(page) {
  const menu = page.locator(".customer-profile-menu");
  if (!(await menu.isVisible()))
    await page.locator(".customer-profile-trigger").click();
  await expect(menu).toBeVisible();
  return menu;
}

async function setProfilePreference(page, kind, value) {
  const menu = await openProfileMenu(page);
  if (kind === "locale") {
    await menu
      .getByRole("button", { name: value === "th" ? "ไทย" : "English", exact: true })
      .click();
  } else {
    const labels =
      value === "dark" ? ["Dark", "มืด"] : value === "light" ? ["Light", "สว่าง"] : ["System", "ตามระบบ"];
    await menu.locator(labels.map((label) => `button[aria-label="${label}"]`).join(",")).click();
  }
  return menu;
}

async function assertIconCentered(button, label) {
  const geometry = await button.evaluate((element) => {
    const icon = element.querySelector("svg");
    const buttonBox = element.getBoundingClientRect();
    const iconBox = icon?.getBoundingClientRect();
    return iconBox
      ? {
          buttonX: buttonBox.x + buttonBox.width / 2,
          buttonY: buttonBox.y + buttonBox.height / 2,
          iconX: iconBox.x + iconBox.width / 2,
          iconY: iconBox.y + iconBox.height / 2,
        }
      : null;
  });
  assert.ok(geometry, `${label} has an icon`);
  assert.ok(
    Math.abs(geometry.buttonX - geometry.iconX) <= 1 &&
      Math.abs(geometry.buttonY - geometry.iconY) <= 1,
    `${label} icon is centered: ${JSON.stringify(geometry)}`,
  );
}

test("mobile shell uses a profile menu, neutral dark surfaces and floating navigation", async () => {
  const fixture = await customerFixture({
    width: 390,
    locale: "en",
    theme: "dark",
    route: "/settings",
  });
  const { page, state } = fixture;
  try {
    const profile = page.getByRole("button", {
      name: "Profile menu",
      exact: true,
    });
    await expect(profile).toBeVisible();
    await profile.click();
    const menu = page.locator(".customer-profile-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("customer@example.test");
    await expect(menu.getByRole("link", { name: "Account" })).toHaveCount(0);
    await expect(menu.getByText("Language", { exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "English" })).toBeVisible();
    await expect(menu.getByText("Theme", { exact: true })).toBeVisible();
    await expect(menu.getByRole("button", { name: "Dark" })).toBeVisible();
    await expect(
      menu.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();

    const geometry = await page.locator(".customer-bottom-nav").evaluate((nav) => {
      const box = nav.getBoundingClientRect();
      return {
        x: box.x,
        width: box.width,
        bottomGap: innerHeight - box.bottom,
        radius: Number.parseFloat(getComputedStyle(nav).borderRadius),
      };
    });
    assert.ok(geometry.x >= 12, JSON.stringify(geometry));
    assert.ok(geometry.width <= 366, JSON.stringify(geometry));
    assert.ok(geometry.bottomGap >= 8, JSON.stringify(geometry));
    assert.ok(geometry.radius >= 24, JSON.stringify(geometry));

    const navigationColors = await page.evaluate(() => {
      const root = document.querySelector(".customer-portal");
      const active = document.querySelector(
        '.customer-bottom-nav a[href="/settings"]',
      );
      const inactive = document.querySelector(
        '.customer-bottom-nav a[href="/"]',
      );
      const probe = document.createElement("span");
      probe.style.color = "var(--customer-action-primary)";
      root.append(probe);
      const primary = getComputedStyle(probe).color;
      probe.remove();
      return {
        primary,
        activeColor: getComputedStyle(active).color,
        activeBackground: getComputedStyle(active).backgroundColor,
        inactiveColor: getComputedStyle(inactive).color,
      };
    });
    assert.equal(navigationColors.activeColor, navigationColors.primary);
    assert.notEqual(
      navigationColors.activeBackground,
      navigationColors.primary,
      "Active destination must not become a filled yellow tile",
    );
    assert.notEqual(
      navigationColors.inactiveColor,
      navigationColors.primary,
      "Only the active icon and label use Solar Gold",
    );

    const palette = await page.locator(".customer-portal").first().evaluate((root) => {
      const style = getComputedStyle(root);
      return [
        "--customer-surface-background",
        "--customer-surface-elevated",
        "--customer-surface-hero",
        "--customer-muted",
        "--customer-border",
        "--customer-pending",
        "--customer-chart-comparison",
      ].map((name) => style.getPropertyValue(name));
    });
    for (const color of palette)
      assert.ok(channelSpread(color) <= 8, `Expected neutral dark token, got ${color}`);

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Edit profile" }).click();
    const displayName = page.getByLabel("Display Name", { exact: true });
    await displayName.focus();
    assert.ok(
      await displayName.evaluate(
        (input) => Number.parseFloat(getComputedStyle(input).fontSize) >= 16,
      ),
      "Mobile form controls remain at least 16px to avoid iOS focus zoom",
    );
    const profileCardStyle = await page
      .locator('[aria-labelledby="customer-profile-title"]')
      .evaluate((card) => {
        const style = getComputedStyle(card);
        return { boxShadow: style.boxShadow, background: style.backgroundColor };
      });
    assert.notEqual(
      profileCardStyle.boxShadow,
      "none",
      "Primary customer cards use subtle elevation instead of flat purple panels",
    );
    assert.deepEqual(state.errors, []);
  } finally {
    await fixture.close();
  }
});

test("light customer palette uses solar gold and neutral surfaces without purple accents", async () => {
  const fixture = await customerFixture({
    width: 390,
    locale: "en",
    theme: "light",
    route: "/",
  });
  try {
    const colors = await fixture.page.locator(".customer-portal").first().evaluate((root) => {
      const style = getComputedStyle(root);
      return [
        "--customer-action-primary-foreground",
        "--customer-surface-background",
        "--customer-surface-elevated",
        "--customer-surface-hero",
        "--customer-foreground",
        "--customer-muted",
        "--customer-muted-foreground",
        "--customer-border",
        "--customer-focus",
        "--customer-pending",
        "--customer-pending-foreground",
        "--customer-chart-comparison",
      ].map((name) => style.getPropertyValue(name));
    });
    for (const color of colors)
      assert.equal(isPurple(color), false, `Purple customer token remains: ${color}`);
  } finally {
    await fixture.close();
  }
});

test("customer notification trigger opens a full-screen feed with a top-bar-height header", async () => {
  const fixture = await customerFixture({ width: 390, locale: "en", theme: "dark" });
  const { page, state } = fixture;
  try {
    const trigger = page.getByRole("button", { name: "Notifications", exact: true });
    const profile = page.getByRole("button", { name: "Profile menu", exact: true });
    await expect(trigger).toBeVisible();
    const order = await trigger.evaluate((button, profileButton) =>
      button.compareDocumentPosition(profileButton) & Node.DOCUMENT_POSITION_FOLLOWING,
      await profile.elementHandle(),
    );
    assert.ok(order, "Notification trigger precedes the profile trigger");

    await trigger.click();
    const center = page.getByRole("dialog", { name: "Notifications" });
    await expect(center).toBeVisible();
    await expect(center).toContainText("Recent billing, payment and account updates.");
    await expect(center).toContainText("Invoice ready for payment");
    await expect(center).toContainText("Review invoice INV-001 and make a payment");

    const geometry = await page.evaluate(() => {
      const topBar = document.querySelector(".customer-top-nav").getBoundingClientRect();
      const dialog = document.querySelector('[data-customer-notification-center="true"]').getBoundingClientRect();
      const header = document.querySelector('[data-customer-notification-header="true"]').getBoundingClientRect();
      return { topBarHeight: topBar.height, dialogWidth: dialog.width, dialogHeight: dialog.height, headerHeight: header.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.equal(geometry.dialogWidth, geometry.viewportWidth);
    assert.equal(geometry.dialogHeight, geometry.viewportHeight);
    assert.equal(geometry.headerHeight, geometry.topBarHeight);

    await center.getByRole("button", { name: "Mark all as read", exact: true }).click();
    await expect.poll(() => state.notificationFeed.unreadCount).toBe(0);
    await expect(trigger.locator('[data-customer-notification-unread="true"]')).toHaveCount(0);
    await center.getByRole("button", { name: "Close", exact: true }).click();
    await expect(center).toBeHidden();
    await expect(trigger).toBeFocused();
  } finally {
    await fixture.close();
  }
});

test("invoice notification opens the customer billing record with its document preview", async () => {
  const fixture = await customerFixture({ width: 1280, locale: "en", theme: "dark" });
  const { page } = fixture;
  try {
    await page.getByRole("button", { name: "Notifications", exact: true }).click();
    const notification = page.getByRole("link", {
      name: /Invoice ready for payment/,
    });
    await expect(notification).toHaveAttribute(
      "href",
      "/records/billing/bill-001?document=invoice-001",
    );
    await notification.click();
    await page.waitForURL("**/records/billing/bill-001?document=invoice-001");
    await expect(page.getByRole("dialog", { name: "INV-001" })).toBeVisible();
  } finally {
    await fixture.close();
  }
});

for (const width of [768, 1280]) {
  test(`${width}: customer notifications open as a compact popover aligned to the bell`, async () => {
    const fixture = await customerFixture({ width, locale: "en", theme: "dark" });
    const { page } = fixture;
    try {
      const trigger = page.getByRole("button", { name: "Notifications", exact: true });
      await trigger.click();
      const center = page.locator('[data-customer-notification-center="true"]');
      await expect(center).toBeVisible();
      const geometry = await page.evaluate(() => {
        const triggerBox = document.querySelector(".customer-notification-trigger").getBoundingClientRect();
        const centerBox = document.querySelector('[data-customer-notification-center="true"]').getBoundingClientRect();
        return {
          triggerRight: triggerBox.right,
          centerRight: centerBox.right,
          centerWidth: centerBox.width,
          centerHeight: centerBox.height,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
        };
      });
      assert.ok(geometry.centerWidth >= 360 && geometry.centerWidth <= 400, JSON.stringify(geometry));
      assert.ok(geometry.centerHeight < geometry.viewportHeight, JSON.stringify(geometry));
      assert.ok(Math.abs(geometry.centerRight - geometry.triggerRight) <= 16, JSON.stringify(geometry));
      await page.keyboard.press("Escape");
      await expect(center).toBeHidden();
      await expect(trigger).toBeFocused();
    } finally {
      await fixture.close();
    }
  });
}

for (const width of [390, 1280]) {
  test(`${width}: payment upload and pickers use the responsive customer controls`, async () => {
    const fixture = await customerFixture({ width, route: recordPath });
    const { page } = fixture;
    try {
      await openPayment(page);
      const payment = page.getByRole("dialog").first();
      const copy = payment.getByRole("button", {
        name: "Copy account number",
        exact: true,
      });
      await assertIconCentered(copy, "Copy account number");
      if (width === 390)
        await assertIconCentered(
          payment.getByRole("button", { name: "Close", exact: true }),
          "Mobile close",
        );

      const upload = payment.getByTestId("evidence-dropzone");
      assert.equal(await upload.evaluate((element) => element.tagName), "LABEL");
      const nativeFileControl = await payment
        .locator('input[type="file"]')
        .evaluate((element) => {
          const box = element.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });
      assert.ok(
        nativeFileControl.width <= 1 && nativeFileControl.height <= 1,
        `Native file UI is visually hidden: ${JSON.stringify(nativeFileControl)}`,
      );
      const chooserPromise = page.waitForEvent("filechooser");
      await upload.click();
      const chooser = await chooserPromise;
      await chooser.setFiles({
        name: "transfer.png",
        mimeType: "image/png",
        buffer: alternatePng,
      });
      const preview = payment.getByTestId("evidence-preview");
      await expect(preview).toBeVisible();
      const remove = preview.getByRole("button", {
        name: "Remove file",
        exact: true,
      });
      assert.equal(await remove.getAttribute("data-variant"), "destructive");
      const removeGeometry = await Promise.all([
        preview.boundingBox(),
        remove.boundingBox(),
      ]);
      assert.ok(
        removeGeometry[0] &&
          removeGeometry[1] &&
          removeGeometry[1].x + removeGeometry[1].width <=
            removeGeometry[0].x + removeGeometry[0].width - 7 &&
          removeGeometry[1].y <= removeGeometry[0].y + 9,
        `Remove action stays in the preview corner: ${JSON.stringify(removeGeometry)}`,
      );
      await assertIconCentered(remove, "Remove file");

      await payment
        .getByRole("button", { name: "Transfer date", exact: true })
        .click();
      const dateSurface = page.locator(
        width === 390
          ? '[data-slot="sheet-content"]'
          : '[data-slot="popover-content"]',
      );
      await expect(dateSurface).toBeVisible();
      await expect(dateSurface.locator('[data-slot="calendar"]')).toBeVisible();
      await page.keyboard.press("Escape");

      await expect(payment.getByLabel("Transfer method")).toHaveCount(0);
    } finally {
      await fixture.close();
    }
  });
}

// A fixed server locale prop must not override the provider after a switch.
// Start in each language to catch implementations that only handle one direction.
for (const locale of ["en", "th"]) {
  for (const route of ["/", "/billing", recordPath]) {
    test(`live locale ${locale} on ${route} with fixed server props`, async () => {
      const fixture = await customerFixture({ locale, route });
      const { page, state } = fixture;
      try {
        const marker =
          route === "/"
            ? ["Amount due", "ยอดที่ต้องชำระ"]
            : route === "/billing"
              ? ["Search documents", "ค้นหาเอกสาร"]
              : ["Bill breakdown", "รายละเอียดค่าใช้จ่าย"];
        for (const next of [locale === "en" ? "th" : "en", locale]) {
          const menu = await setProfilePreference(page, "locale", next);
          await expect(page.locator("#customer-main")).toContainText(
            marker[next === "en" ? 0 : 1],
          );
          await expect.poll(() => state.locale).toBe(next);
          assert.equal(
            await page.evaluate(() =>
              document.cookie.includes(
                `locale=${document.querySelector('.customer-profile-menu button[aria-pressed="true"][aria-label="ไทย"]') ? "th" : "en"}`,
              ),
            ),
            true,
          );
          await expect(menu).toBeVisible();
        }
        if (route !== "/billing") {
          for (const next of [locale === "en" ? "th" : "en", locale]) {
            if (await page.getByRole("dialog").count()) {
              await page.keyboard.press("Escape");
              await expect(page.getByRole("dialog")).toHaveCount(0);
            }
            await setProfilePreference(page, "locale", next);
            await page
              .locator('#customer-main a[href$="?payment=1"]')
              .first()
              .click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await expect(
              page.getByRole("dialog").getByRole("heading", {
                name: next === "en" ? "Payment channel" : "ช่องทางชำระเงิน",
                exact: true,
              }),
            ).toBeVisible();
            await expect(page.getByRole("dialog")).toContainText("INV-001");
          }
        }
        assert.deepEqual(state.errors, []);
        assert.deepEqual(state.unexpected, []);
      } finally {
        await fixture.close();
      }
    });
  }
}

// Catches disconnected customer routes, wrong payment amount/lifecycle, missing
// prior evidence, stale balance projection, preference writes and clipped UI.
for (const width of [390, 768, 1280]) {
  test(`${width}: home → record → full payment → pending verification`, async () => {
    const fixture = await customerFixture({ width });
    const { page, state, origin } = fixture;
    try {
      await checkSurface(fixture, "/");
      const hero = await page
        .locator('[aria-labelledby="current-bill-title"]')
        .boundingBox();
      const heroAction = await page
        .locator('[data-current-bill-actions="true"]')
        .getByRole("link", { name: "Pay", exact: true })
        .boundingBox();
      assert.ok(hero && heroAction && hero.y + hero.height - (heroAction.y + heroAction.height) <= 34);
      const recordActions = page
        .locator("[data-financial-record]")
        .first()
        .locator('[data-record-actions="true"]');
      const details = recordActions.getByRole("link", { name: "View details" });
      const evidence = recordActions.getByRole("link", { name: "Pay" });
      assert.equal(await details.getAttribute("data-variant"), "outline");
      assert.equal(await evidence.getAttribute("data-variant"), "default");
      const detailsBox = await details.boundingBox();
      const evidenceBox = await evidence.boundingBox();
      assert.ok(
        detailsBox &&
          evidenceBox &&
          Math.abs(detailsBox.y - evidenceBox.y) < 1 &&
          detailsBox.x < evidenceBox.x,
      );
      if (width === 390) await screenshot(page, "customer-home-en-light-390");
      await page.locator("[data-financial-record] a").first().click();
      await page.waitForURL(origin + recordPath);
      await checkSurface(fixture, recordPath);
      await openPayment(page);
      await checkSurface(fixture, recordPath);
      await evidenceStep(page);
      await expect(
        page.getByRole("dialog").locator("#customer-payment-review-title").locator(".."),
      ).toContainText("1,070.13");
      await checkSurface(fixture, recordPath);
      await submitPayment(page);
      await checkSurface(fixture, recordPath);
      assert.equal(state.posts.length, 1);
      assert.equal(state.posts[0].amount, "1070.13");
      assert.equal(state.posts[0].paidAt, "2026-10-18T05:00:00.000Z");
      assert.equal(state.posts[0].paymentMethod, "bank_transfer");
      assert.equal(state.posts[0].transferChannel, "bank_account");
      assert.ok(state.posts[0].slipUrl.startsWith("data:image/png;base64,"));
      assert.ok(!("verifiedAmount" in state.posts[0]));
      assert.equal(state.row.outstandingAmount, "1070.13");
      assert.equal(state.row.approvedAmount, "0.00");
      await expect(page.getByRole("dialog")).toContainText(
        "balance changes after approval",
      );
      if (width === 390)
        await screenshot(page, "customer-payment-pending-en-light-390");
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "View financial record", exact: true })
        .click();
      await page.waitForURL(origin + recordPath);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator("#customer-main")).toContainText(
        "Evidence review",
      );
      await expect(
        page.locator('#customer-main a[href$="?payment=1"]'),
      ).toHaveCount(0);
      await checkSurface(fixture, recordPath);
    } finally {
      await fixture.close();
    }
  });

  test(`${width}: rejected evidence retains reason and old attempt through resubmission`, async () => {
    const fixture = await customerFixture({
      width,
      rejected: true,
      route: recordPath,
    });
    const { page, state } = fixture;
    try {
      await expect(
        page.getByText("Reason for rejection: Unreadable transfer reference", {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("link", { name: "Report payment again", exact: true })
        .click();
      await expect(
        page.getByRole("dialog").getByText("123-456", { exact: true }),
      ).toBeVisible();
      await evidenceStep(page, { name: "replacement.png" });
      await submitPayment(page);
      await page
        .getByRole("dialog")
        .getByRole("link", { name: "View financial record", exact: true })
        .click();
      await expect(
        page.getByText("Reason for rejection: Unreadable transfer reference", {
          exact: true,
        }),
      ).toBeVisible();
      assert.deepEqual(
        state.row.payments.map((p) => p.status),
        ["rejected", "pending_verification"],
      );
      await checkSurface(fixture, recordPath);
    } finally {
      await fixture.close();
    }
  });

  test(`${width}: partial submission waits for approval, remaining balance funds a second submission`, async () => {
    const fixture = await customerFixture({ width, route: recordPath });
    const { page, state } = fixture;
    try {
      await openPayment(page);
      await evidenceStep(page, { amount: "400.00", name: "first.png" });
      await submitPayment(page);
      assert.equal(
        state.row.outstandingAmount,
        "1070.13",
        "Submission does not approve funds",
      );
      // Explicit external approval fixture; the browser never calculates a balance.
      state.row.payments[0].status = "paid";
      state.row.payments[0].amount = "400.00";
      state.row.approvedAmount = "400.00";
      state.row.outstandingAmount = "670.13";
      state.row.pendingEvidenceCount = 0;
      state.row.billingStatusView = "partially_paid";
      await page.reload();
      await expect(page.locator("#customer-main")).toContainText(
        "Partially paid",
      );
      await expect(
        page.getByRole("heading", { name: "Payment progress" }).locator(".."),
      ).toContainText("Paid 400.00 / 1,070.13");
      await openPayment(page);
      await evidenceStep(page, { name: "second.png", buffer: alternatePng });
      await expect(
        page.getByRole("dialog").locator("#customer-payment-review-title").locator(".."),
      ).toContainText("670.13");
      await submitPayment(page);
      assert.deepEqual(
        state.posts.map((p) => p.amount),
        ["400.00", "670.13"],
      );
      assert.notEqual(state.posts[0].evidenceKey, state.posts[1].evidenceKey);
      assert.notEqual(
        state.posts[0].slipUrl,
        state.posts[1].slipUrl,
        "Distinct transfers have distinct evidence bytes",
      );
      assert.equal(state.row.approvedAmount, "400.00");
      assert.equal(state.row.outstandingAmount, "670.13");
      await checkSurface(fixture, recordPath);
    } finally {
      await fixture.close();
    }
  });

  test(`${width}: recent record → all documents → detail and preview fallback/download`, async () => {
    const fixture = await customerFixture({ width, rejected: true });
    const { page, origin } = fixture;
    try {
      await expect(page.locator("[data-financial-record]")).toHaveCount(1);
      await page
        .getByRole("link", { name: "View all documents", exact: true })
        .click();
      await page.waitForURL(origin + "/billing");
      await checkSurface(fixture, "/billing");
      await expect(page.getByRole("tab")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Document status" }),
      ).toBeVisible();
      await page.locator('#customer-main a[href="' + recordPath + '"]').click();
      await page.waitForURL(origin + recordPath);
      await checkSurface(fixture, recordPath);
      const preview = page
        .locator('[data-document-id="payment:rejected-001"]')
        .getByRole("button", { name: "Preview document", exact: true });
      await preview.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("alert")).toContainText(
        "Preview is unavailable",
      );
      const download = dialog.getByRole("link", {
        name: "Download",
        exact: true,
      });
      assert.equal(
        await download.getAttribute("href"),
        origin + "/evidence/previous.bin",
      );
      const downloaded = page.waitForEvent("download");
      await download.click();
      const file = await downloaded;
      assert.equal(file.suggestedFilename(), "previous.bin");
      assert.equal(await file.failure(), null, "Fallback download completes");
      await checkSurface(fixture, recordPath);
      await page.keyboard.press("Escape");
      await expect(preview).toBeFocused();
    } finally {
      await fixture.close();
    }
  });
}

test("locale/theme controls persist across navigation and account notification preference survives reload", async () => {
  const fixture = await customerFixture();
  const { page, state, origin } = fixture;
  try {
    await setProfilePreference(page, "locale", "th");
    await expect(page.locator(".customer-portal").first()).toHaveAttribute(
      "lang",
      "th",
    );
    await setProfilePreference(page, "theme", "dark");
    await expect(page.locator("html")).toHaveClass("dark");
    await expect.poll(() => state.locale).toBe("th");
    await expect.poll(() => state.theme).toBe("dark");
    await page.locator('.customer-bottom-nav a[href="/settings"]').click();
    await page.waitForURL(origin + "/settings");
    await expect(page.locator("#customer-main")).toContainText("Acme");
    await checkSurface(fixture, "/settings");
    await screenshot(page, "customer-account-th-dark-390");
    const notification = page.locator("#customer-criticalEmailAlert");
    await expect(notification).toHaveAttribute("aria-checked", "true");
    await notification.click();
    await expect.poll(() => state.notifications.criticalEmailAlert).toBe(false);
    await page.reload();
    await expect(notification).toHaveAttribute("aria-checked", "false");
    await setProfilePreference(page, "locale", "en");
    await setProfilePreference(page, "theme", "light");
    await expect(page.locator("html")).toHaveClass("light");
    await expect(
      page.getByRole("heading", { name: "Your profile", exact: true }),
    ).toBeVisible();
    assert.deepEqual(
      state.calls
        .filter(
          (c) => c.path === "/v1/notifications/settings" && c.method === "PUT",
        )
        .map((c) => c.body),
      [
        {
          criticalEmailAlert: false,
          inAppNotification: true,
          emailAddress: "customer@example.test",
        },
      ],
    );
    await checkSurface(fixture, "/settings");
  } finally {
    await fixture.close();
  }
});
