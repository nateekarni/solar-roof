import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
const boundary = { role: "customer_user", queries: [] };
globalThis.__customerDocumentsRouteBoundary = boundary;
const result = await build({
  entryPoints: [
    fileURLToPath(new URL("../app/(app)/billing/page.tsx", import.meta.url)),
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  plugins: [
    {
      name: "route-external-boundaries",
      setup(build) {
        build.onResolve(
          {
            filter:
              /session-user$|operation-page$|customer-documents-page$|customer-documents-server-api$|^next\/headers$/,
          },
          (args) => ({ path: args.path, namespace: "route-boundary" }),
        );
        build.onLoad({ filter: /.*/, namespace: "route-boundary" }, (args) => ({
          loader: "js",
          contents: args.path.endsWith("session-user")
            ? "export async function getSessionUser(){return {role:globalThis.__customerDocumentsRouteBoundary.role}}"
            : args.path.endsWith("operation-page")
              ? "export function OperationPage(){}"
              : args.path.endsWith("customer-documents-page")
                ? "export function CustomerDocumentsPage(){}"
                : args.path === "next/headers"
                  ? "export async function cookies(){return {get(){return {value:'en'}}}}"
                  : "export async function loadCustomerDocumentsServer(query){globalThis.__customerDocumentsRouteBoundary.queries.push(query.toString());return {initial:null,capabilities:{actions:[],unavailable:{}}}}",
        }));
      },
    },
  ],
});
const { default: Page } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

test("every staff role receives the unchanged operations billing invocation without customer reads", async () => {
  const searchParams = Promise.resolve({
    search: "staff",
    cursor: "staff-cursor",
  });
  for (const role of ["owner", "admin", "accountant", "operator"]) {
    boundary.role = role;
    const element = await Page({ searchParams });
    assert.equal(element.type.name, "OperationPage");
    assert.deepEqual(element.props, {
      resource: "billing",
      eyebrow: "BILLING & INVOICES",
      title: "ใบวางบิล",
      description:
        "ตรวจสอบและจัดการใบวางบิล รอบการเรียกเก็บเงิน ตรวจหลักฐานสลิป และติดตามสถานะการชำระเงิน",
      action: "สร้างใบวางบิล",
      searchParams,
    });
  }
  assert.deepEqual(boundary.queries, []);
});
test("only customer_user routes to customer cards with locale, scoped initial reads and the complete query", async () => {
  boundary.role = "customer_user";
  const element = await Page({
    searchParams: Promise.resolve({
      search: "INV",
      from: "2026-10-01",
      to: "2026-10-31",
      billingStatusView: "partially_paid",
      cursor: "opaque",
    }),
  });
  assert.equal(element.type.name, "CustomerDocumentsPage");
  assert.equal(element.props.locale, "en");
  assert.deepEqual(
    Object.fromEntries(new URLSearchParams(element.props.initialQuery)),
    {
      search: "INV",
      from: "2026-10-01",
      to: "2026-10-31",
      billingStatusView: "partially_paid",
      cursor: "opaque",
    },
  );
  assert.equal(boundary.queries[0], element.props.initialQuery);
  assert.deepEqual(element.props.capabilities, {
    actions: [],
    unavailable: {},
  });
});
