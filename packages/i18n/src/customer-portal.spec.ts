/// <reference types="node" />
import assert from "node:assert/strict";
import test from "node:test";
import { en } from "./en.js";
import { th } from "./th.js";
import { createTranslator } from "./locale.js";

function leaves(value: unknown, prefix = ""): Record<string, string> {
  assert.ok(value && typeof value === "object", `Missing dictionary group ${prefix}`);
  return Object.fromEntries(Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === "string") {
      assert.ok(entry.trim(), `Empty translation ${path}`);
      return [[path, entry]];
    }
    return Object.entries(leaves(entry, path));
  }));
}

test("customer portal has complete matching Thai and English groups and placeholders", () => {
  const thai = leaves(th.customerPortal);
  const english = leaves(en.customerPortal);
  assert.deepEqual(Object.keys(th.customerPortal).sort(), ["account", "billing", "common", "home", "payment", "record", "shell", "status", "validation"]);
  assert.deepEqual(Object.keys(english).sort(), Object.keys(thai).sort());
  for (const key of Object.keys(thai)) {
    assert.deepEqual(english[key]!.match(/\{\w+\}/g)?.sort() ?? [], thai[key]!.match(/\{\w+\}/g)?.sort() ?? [], key);
    for (const locale of ["th", "en"] as const) assert.notEqual(createTranslator(locale)(`customerPortal.${key}`), `customerPortal.${key}`);
  }
});
