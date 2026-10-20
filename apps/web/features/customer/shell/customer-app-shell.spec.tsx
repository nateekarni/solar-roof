import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "../../../providers/locale-provider";
import { CustomerAppShell } from "./customer-app-shell";
import { CustomerBottomNav } from "./customer-bottom-nav";

for (const [locale, labels] of [
  ["th", ["หน้าแรก", "เอกสาร", "บัญชี"]],
  ["en", ["Home", "Documents", "Account"]],
] as const) {
  test(`customer shell exposes the three approved destinations in ${locale}`, () => {
    const html = renderToStaticMarkup(
      <LocaleProvider initialLocale={locale}><CustomerAppShell><h1>Content</h1></CustomerAppShell></LocaleProvider>,
    );
    for (const label of labels) assert.ok(html.includes(label));
    for (const href of ["/", "/billing", "/settings"]) assert.ok(html.includes(`href="${href}"`));
    assert.match(html, /href="#customer-main"/);
    assert.match(html, /id="customer-main"/);
    assert.match(html, /Content/);
    assert.doesNotMatch(html, /data-sidebar|SidebarTrigger|href="\/users"/);
    assert.doesNotMatch(html, /customerPortal\./);
    assert.match(
      html,
      new RegExp(`aria-label="${locale === "th" ? "เมนูโปรไฟล์" : "Profile menu"}"`),
    );
    const notificationLabel = locale === "th" ? "การแจ้งเตือน" : "Notifications";
    assert.match(html, new RegExp(`aria-label="${notificationLabel}"`));
    assert.match(
      html,
      new RegExp(`aria-label="${notificationLabel}"[\\s\\S]*aria-label="${locale === "th" ? "เมนูโปรไฟล์" : "Profile menu"}"`),
    );
    assert.doesNotMatch(html, /<header[^>]*>[\s\S]*<select/);
  });
}

test("record detail keeps Documents active without marking Home active", () => {
  const html = renderToStaticMarkup(<CustomerBottomNav pathname="/records/billing/123" />);
  assert.match(html.match(/<a[^>]+href="\/billing"[^>]*>/)?.[0] ?? "", /aria-current="page"/);
  assert.doesNotMatch(html.match(/<a[^>]+href="\/"[^>]*>/)?.[0] ?? "", /aria-current="page"/);
});

test("account subroutes keep Account active", () => {
  const html = renderToStaticMarkup(<CustomerBottomNav pathname="/settings/security" />);
  assert.match(html.match(/<a[^>]+href="\/settings"[^>]*>/)?.[0] ?? "", /aria-current="page"/);
});
