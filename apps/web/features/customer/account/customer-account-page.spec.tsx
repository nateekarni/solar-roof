import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "../../../providers/locale-provider";
import { CustomerAccountPage } from "./customer-account-page";
import { CustomerOrganizationCard } from "./customer-organization-card";

test("customer account owns profile, notifications and security without management or role controls", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="en">
      <CustomerAccountPage />
    </LocaleProvider>,
  );
  for (const label of [
    "Organization &amp; Account",
    "Contracted organization",
    "Your profile",
    "Review the contact details used for this customer account.",
    "Notification preferences",
    "Change password",
    "2FA",
  ])
    assert.ok(html.includes(label), label);
  assert.doesNotMatch(
    html,
    /System Role|Staff and permissions|Bank accounts|Company position|Connected accounts|own-company-position|signature|<main|role="tab"/,
  );
  assert.match(html, /customer-surface-elevated/);
  assert.match(html, /Edit profile/);
  assert.doesNotMatch(html, /id="customer-display-name"/);
  assert.match(
    html,
    /disabled=""[^>]*role="switch"|role="switch"[^>]*disabled=""/,
  );
  assert.equal((html.match(/data-customer-account-list="true"/g) ?? []).length, 2);
  assert.equal((html.match(/\[&amp;&gt;\*\]:border-t-0/g) ?? []).length, 2);
});

test("contract identity and tax data are display-only and unknown values are not invented", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="en">
      <CustomerOrganizationCard
        rows={[
          {
            id: "contract",
            companyName: "Acme",
            taxId: "1234567890123",
            taxAddress: "Bangkok",
            siteName: "Rooftop",
          },
        ]}
      />
    </LocaleProvider>,
  );
  for (const value of [
    "Acme",
    "Bangkok",
    "1234567890123",
    "Rooftop",
    "Tax branch",
  ])
    assert.ok(html.includes(value), value);
  assert.doesNotMatch(html, /<input|<select|Head Office/);
});

test("Thai account labels do not leak English headings", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="th">
      <CustomerAccountPage />
    </LocaleProvider>,
  );
  assert.match(html, /ข้อมูลองค์กรและบัญชี/);
  assert.doesNotMatch(
    html,
    /Contracted organization|Your profile|Notification preferences|customerPortal\./,
  );
});

test("empty organization and security cards provide consistent descriptive states", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="en">
      <CustomerOrganizationCard rows={[]} />
    </LocaleProvider>,
  );
  assert.match(html, /data-customer-card-heading="true"/);
  assert.match(html, /data-customer-empty-state="true"/);
  assert.match(html, /<svg[^>]*aria-hidden="true"/);
  assert.match(html, />No data</);

  const page = renderToStaticMarkup(
    <LocaleProvider initialLocale="en">
      <CustomerAccountPage />
    </LocaleProvider>,
  );
  assert.match(page, /Manage your password and two-factor authentication\./);
  assert.equal((page.match(/data-customer-card-heading="true"/g) ?? []).length, 4);
});
