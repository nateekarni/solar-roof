import assert from "node:assert/strict";
import test from "node:test";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import {
  customerFixture,
  checkSurface,
  openPayment,
  evidenceStep,
  submitPayment,
  recordPath,
  screenshot,
} from "./platform/customer-portal-fixture.mjs";

async function scan(fixture, surface) {
  const results = await new AxeBuilder({ page: fixture.page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  assert.deepEqual(
    results.violations
      .filter((v) => ["serious", "critical"].includes(v.impact))
      .map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, failureSummary }) => ({
          target,
          failureSummary,
        })),
      })),
    [],
    `${surface}: no serious/critical axe violations`,
  );
  await checkSurface(fixture, new URL(fixture.page.url()).pathname);
}

async function visibleFocus(locator) {
  await expect(locator).toBeFocused();
  assert.equal(
    await locator.evaluate((el) => el.matches(":focus-visible")),
    true,
  );
  const outline = await locator.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      style: css.outlineStyle,
      width: parseFloat(css.outlineWidth),
      color: css.outlineColor,
    };
  });
  assert.ok(
    outline.style !== "none" &&
      outline.width >= 2 &&
      outline.color !== "rgba(0, 0, 0, 0)",
    JSON.stringify(outline),
  );
}

async function trap(page) {
  const dialog = page.getByRole("dialog");
  // Keyboard enters the task controls in their DOM/visual order and wraps at both ends.
  const heading = dialog.locator("h2[tabindex='-1']");
  await expect(heading).toBeFocused();
  const first = dialog.locator("button").first();
  await page.keyboard.press("Tab");
  await visibleFocus(first);
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  const last = dialog.locator("button").last();
  await visibleFocus(last);
  await page.keyboard.press("Tab");
  await visibleFocus(first);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    assert.equal(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
      true,
      "Focus stays in the modal",
    );
  }
}

// Missing accessible names/contrast, color-only state, hidden keyboard focus,
// untrapped portals and animations ignoring reduced motion all fail this matrix.
for (const locale of ["th", "en"])
  for (const theme of ["light", "dark"]) {
    test(`${locale}/${theme}: all customer pages and payment steps meet axe, keyboard and reduced-motion gates`, async () => {
      const fixture = await customerFixture({ locale, theme, rejected: true });
      const { page, origin } = fixture;
      try {
        await expect(page.locator("html")).toHaveClass(theme);
        await expect(page.locator(".recharts-area-curve")).toBeVisible();
        await scan(fixture, "home");
        await page.keyboard.press("Tab");
        await visibleFocus(page.locator(".customer-skip-link"));
        await page.keyboard.press("Tab");
        await visibleFocus(page.locator("header a").first());
        await page.keyboard.press("Tab");
        const notificationTrigger = page.locator(".customer-notification-trigger");
        await visibleFocus(notificationTrigger);
        await page.keyboard.press("Enter");
        const notificationCenter = page.locator('[data-customer-notification-center="true"]');
        await expect(notificationCenter).toBeVisible();
        await scan(fixture, "notification center");
        await page.keyboard.press("Escape");
        await expect(notificationCenter).toBeHidden();
        await visibleFocus(notificationTrigger);
        await page.keyboard.press("Tab");
        const profileTrigger = page.locator(".customer-profile-trigger");
        await visibleFocus(profileTrigger);
        await page.keyboard.press("Enter");
        const profileMenu = page.locator(".customer-profile-menu");
        await expect(profileMenu).toBeVisible();
        const firstPreference = profileMenu.locator("button").first();
        const signOut = profileMenu.locator("button").last();
        await visibleFocus(firstPreference);
        await page.keyboard.press("Shift+Tab");
        await visibleFocus(signOut);
        await page.keyboard.press("Tab");
        await visibleFocus(firstPreference);
        for (let index = 1; index < 6; index++) await page.keyboard.press("Tab");
        await visibleFocus(signOut);
        await page.keyboard.press("Escape");
        await expect(profileMenu).toBeHidden();
        await page.waitForTimeout(25);
        await visibleFocus(profileTrigger);
        await page.keyboard.press("Tab");
        await visibleFocus(
          page.locator('#customer-main a[href$="?payment=1"]').first(),
        );
        await page.waitForTimeout(25);
        const motion = await page
          .locator(".customer-portal *")
          .evaluateAll((elements) =>
            elements
              .map((el) => ({
                animation: getComputedStyle(el).animationDuration,
                transition: getComputedStyle(el).transitionDuration,
              }))
              .filter((css) =>
                [
                  ...css.animation.split(","),
                  ...css.transition.split(","),
                ].some((value) => parseFloat(value) > 0.00001),
              ),
          );
        assert.deepEqual(
          motion,
          [],
          "Reduced motion removes nonessential CSS motion",
        );
        assert.deepEqual(
          await page.evaluate(() =>
            document
              .getAnimations()
              .filter((animation) => animation.playState === "running")
              .map(
                (animation) => animation.animationName ?? "running animation",
              ),
          ),
          [],
          "Reduced-motion chart has no running entry animation",
        );
        // The energy readings stay reachable with motion disabled.
        await page.locator("summary").click();
        await expect(
          page.getByRole("cell", { name: "17.25", exact: true }),
        ).toBeVisible();
        for (const width of [768, 1280, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await checkSurface(fixture, "/");
        }
        if (locale === "th" && theme === "dark") {
          await page.setViewportSize({ width: 1280, height: 1000 });
          await screenshot(page, "customer-home-th-dark-1280");
          await page.setViewportSize({ width: 390, height: 1000 });
        }

        await page.goto(origin + "/billing");
        await page.getByRole("article").waitFor();
        await scan(fixture, "documents");
        const statusFilter = page.getByRole("button", {
          name: locale === "th" ? "สถานะเอกสาร" : "Document status",
        });
        await statusFilter.focus();
        await visibleFocus(statusFilter);
        await page.keyboard.press("Enter");
        await expect(page.getByRole("option")).toHaveCount(6);
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        for (const width of [768, 1280, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await checkSurface(fixture, "/billing");
        }

        await page.goto(origin + recordPath);
        await page.locator("#customer-main h1").waitFor();
        await expect(
          page.locator('[data-document-id="payment:rejected-001"]'),
        ).toContainText("Unreadable transfer reference");
        // Literal visible status, not only a colored pill/icon.
        await expect(
          page
            .locator("#customer-main > div > header")
            .getByText(locale === "en" ? "Awaiting payment" : "รอชำระเงิน", {
              exact: true,
            }),
        ).toBeVisible();
        await scan(fixture, "record with rejected evidence");
        for (const width of [768, 1280, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await checkSurface(fixture, recordPath);
        }
        const trigger = page.locator('#customer-main a[href$="?payment=1"]');
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(
          page.getByRole("dialog").getByText("123-456", { exact: true }),
        ).toBeVisible();
        await trap(page);
        await scan(fixture, "payment instructions");
        await page.keyboard.press("Escape");
        await expect(trigger).toBeFocused();
        await openPayment(page);
        await evidenceStep(page);
        await scan(fixture, "payment evidence");
        if (locale === "en" && theme === "light")
          await screenshot(page, "customer-payment-evidence-en-light-390");
        await submitPayment(page);
        await expect(
          page.getByRole("dialog").getByRole("status"),
        ).toBeVisible();
        await scan(fixture, "payment pending verification");
        await page.keyboard.press("Escape");
        await expect(
          page.locator('#customer-main a[href="' + recordPath + '"]'),
        ).toBeFocused();

        await page.goto(origin + "/settings");
        await page.getByText("Acme", { exact: true }).waitFor();
        await expect(
          page.locator("#customer-criticalEmailAlert"),
        ).toBeEnabled();
        await scan(fixture, "account");
        for (const width of [768, 1280, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await checkSurface(fixture, "/settings");
        }
        const password = page.getByRole("button", {
          name: locale === "en" ? "Change password" : "เปลี่ยนรหัสผ่าน",
          exact: true,
        });
        await password.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        for (const modalSurface of await page
          .locator('[role="dialog"],[data-slot="dialog-overlay"]')
          .all())
          assert.ok(
            await modalSurface.evaluate(
              (el) =>
                parseFloat(getComputedStyle(el).animationDuration) <= 0.00001,
            ),
            "Customer modal roots and overlays respect reduced motion",
          );
        await scan(fixture, "account password dialog");
        await page.keyboard.press("Escape");
        await expect(password).toBeFocused();
        await checkSurface(fixture, "/settings");
      } finally {
        await fixture.close();
      }
    });
  }
