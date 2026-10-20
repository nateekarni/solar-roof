import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
const state = { role: "customer_user", reads: [], access: [] };
globalThis.__recordRoute = state;
const result = await build({
  entryPoints: [
    fileURLToPath(
      new URL("../app/(app)/records/[resource]/[id]/page.tsx", import.meta.url),
    ),
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  plugins: [
    {
      name: "external-boundaries",
      setup(build) {
        build.onResolve(
          { filter: /features\/|components\/|lib\/|^next\/|^lucide-react$/ },
          (args) => ({ path: args.path, namespace: "boundary" }),
        );
        build.onLoad({ filter: /.*/, namespace: "boundary" }, (args) => {
          let contents;
          if (args.path.endsWith("session-user"))
            contents =
              "export async function requirePageAccess(path){globalThis.__recordRoute.access.push(path);return {role:globalThis.__recordRoute.role}}";
          else if (args.path.endsWith("server-fetch"))
            contents =
              'export function getApiBaseUrl(){return "https://api.test"} export async function serverFetch(url){globalThis.__recordRoute.reads.push(url);return {ok:true,status:200,json:async()=>url.endsWith("capabilities")?{actions:[],unavailable:{}}:{row:{id:"record",siteName:"Site",period:"2026-10"},columns:[]}}}';
          else if (args.path === "next/headers")
            contents =
              'export async function cookies(){return {get(){return {value:"en"}}}}';
          else if (args.path === "next/navigation")
            contents = 'export function notFound(){throw Error("not found")}';
          else if (args.path.endsWith("operation-columns"))
            contents = 'export function operationKeys(){return ["id"]}';
          else if (args.path.endsWith("record-back-link"))
            contents =
              'export function recordBackLink(){return {href:"/",label:"Back"}}';
          else {
            const names = [
              "RecordNavigationControls",
              "SiteBillingDisplayCard",
              "SiteManageHeaderButton",
              "SiteDetailTabs",
              "SiteCustomerUsers",
              "SiteConfigurationDetails",
              "ArrowLeft",
              "Card",
              "CardContent",
              "CardHeader",
              "CardTitle",
              "RecordDetails",
              "AuditRecordDetails",
              "CustomerFinancialRecordPage",
            ];
            contents =
              names.map((name) => `export function ${name}(){}`).join("\n") +
              "\nexport default function Link(){}";
          }
          return { loader: "js", contents };
        });
      },
    },
  ],
});
const { default: Page } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
function find(node, name) {
  if (!node || typeof node !== "object") return null;
  if (node.type?.name === name) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const value = find(child, name);
    if (value) return value;
  }
  return null;
}
test("customer billing uses dedicated detail only after scoped access and encoded record read", async () => {
  state.role = "customer_user";
  const page = await Page({
    params: Promise.resolve({ resource: "billing", id: "bill/a" }),
  });
  assert.equal(page.type.name, "CustomerFinancialRecordPage");
  assert.equal(page.props.locale, "en");
  assert.deepEqual(state.access, ["/billing"]);
  assert.ok(
    state.reads.includes(
      "https://api.test/v1/operations/billing/records/bill%2Fa",
    ),
  );
});
test("every staff financial route and customer receipts retain RecordDetails props and navigation", async () => {
  for (const role of [
    "owner",
    "admin",
    "accountant",
    "operator",
    "customer_user",
  ])
    for (const resource of ["billing", "receipts"]) {
      if (role === "customer_user" && resource === "billing") continue;
      state.role = role;
      const page = await Page({
        params: Promise.resolve({ resource, id: "record" }),
      });
      const detail = find(page, "RecordDetails");
      assert.deepEqual(detail.props, {
        resource,
        row: { id: "record", siteName: "Site", period: "2026-10" },
        fields: ["id"],
        columns: [],
      });
      assert.ok(find(page, "RecordNavigationControls"));
    }
});
