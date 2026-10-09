import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SchoolSettingsView } from "./school-settings-view";
import { validateOrganizationPassword } from "./organization-settings-model";
test("settings keeps organization legal records read only and exposes account editing", () => {
  const html = renderToStaticMarkup(<SchoolSettingsView />);
  assert.match(html, /ข้อมูลนิติบุคคล|Legal organization information/);
  assert.doesNotMatch(html, /PPA Agreement|โรงเรียน/);
});

test("account fields and preference triggers retain explicit accessible label associations", () => {
  const html = renderToStaticMarkup(<SchoolSettingsView />);
  for (const id of ["organization-display-name", "organization-language", "organization-theme"]) {
    assert.ok(html.includes(`for="${id}"`), `Missing label for ${id}`);
    assert.ok(html.includes(`id="${id}"`), `Missing control ${id}`);
  }
  const passwordControls = [...html.matchAll(/<input(?=[^>]*type="password")(?=[^>]*id="([^"]+)")[^>]*>/g)];
  assert.equal(passwordControls.length, 3);
  assert.equal(new Set(passwordControls.map(match => match[1])).size, 3);
  for (const match of passwordControls) assert.ok(html.includes(`for="${match[1]}"`));
});
test("password validation is localized and rejects mismatch before submission", () => {
  assert.equal(
    validateOrganizationPassword("short", "short", "en"),
    "New password must contain between 12 and 128 characters.",
  );
  assert.equal(
    validateOrganizationPassword("abcdefghijkl", "mnopqrstuvwx", "en"),
    "Passwords do not match.",
  );
  assert.match(
    validateOrganizationPassword("short", "short", "th") ?? "",
    /12/,
  );
  assert.equal(
    validateOrganizationPassword("abcdefghijkl", "abcdefghijkl", "en"),
    null,
  );
});

test("Settings actions pair semantic filled surfaces with their foreground tokens", () => {
  const html = renderToStaticMarkup(<SchoolSettingsView />);
  assert.match(
    html,
    /data-variant="default"[^>]*class="[^"]*bg-primary[^"]*text-primary-foreground/,
  );
  assert.match(
    html,
    /data-variant="destructive"[^>]*class="[^"]*bg-destructive[^"]*text-destructive-foreground/,
  );
});

test("Filled signout retains its semantic background in dark mode", () => {
  const html = renderToStaticMarkup(<SchoolSettingsView />);
  assert.doesNotMatch(html, /dark:bg-destructive\/20/);
});
