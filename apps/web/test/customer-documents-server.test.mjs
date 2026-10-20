import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
const output = await build({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../features/customer/documents/customer-documents-server-api.ts",
        import.meta.url,
      ),
    ),
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "server-fetch-boundary",
      setup(build) {
        build.onResolve({ filter: /lib\/server-fetch$/ }, () => ({
          path: "server-fetch",
          namespace: "boundary",
        }));
        build.onLoad({ filter: /.*/, namespace: "boundary" }, () => ({
          loader: "js",
          contents: `export const getApiBaseUrl=()=>'http://server.test';export const serverFetch=(url,options)=>globalThis.__customerDocumentsServerFetch(url,options);`,
        }));
      },
    },
  ],
});
const { loadCustomerDocumentsServer } = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);
const data = {
  rows: [{ id: "bill" }],
  idKey: "id",
  columns: [],
  page: { limit: 25, nextCursor: null, hasMore: false },
};
test("server capability HTTP and network failures retain rows and distinguish unavailable permissions", async () => {
  for (const fail of [
    () => new Response("unavailable", { status: 503 }),
    () => {
      throw new Error("offline");
    },
  ]) {
    globalThis.__customerDocumentsServerFetch = async (url) =>
      url.includes("/v1/auth/capabilities") ? fail() : Response.json(data);
    assert.deepEqual(
      await loadCustomerDocumentsServer(new URLSearchParams("search=INV")),
      { initial: data, capabilities: null },
    );
  }
});
test("server successful empty capabilities remain distinct from unavailable permissions", async () => {
  const capabilities = { actions: [], unavailable: {}, operationsActions: [] };
  globalThis.__customerDocumentsServerFetch = async (url) =>
    Response.json(url.includes("/v1/auth/capabilities") ? capabilities : data);
  assert.deepEqual(await loadCustomerDocumentsServer(new URLSearchParams()), {
    initial: data,
    capabilities,
  });
});
