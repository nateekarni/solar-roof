import test from "node:test";
import assert from "node:assert/strict";
import { loadCustomerHome, readCustomerHome } from "../api/customer-portal-api";
test("relative range request preserves financial decimal strings", async (context) => {
  const calls: string[] = [];
  const data = {
    focusedBill: { subtotal: "9007199254740993.13", tax: "0.07" },
  };
  context.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(
      new URL(url, "http://customer-home.test").pathname +
        new URL(url, "http://customer-home.test").search,
    );
    return Response.json(data);
  });
  const result = await loadCustomerHome("30d");
  assert.deepEqual(calls, ["/v1/customer/portal/home?range=30d"]);
  assert.deepEqual(result, { status: "ready", data });
});
test("home adapter preserves unavailable legacy breakdown fields and authoritative total", async (context) => {
  const data = {
    focusedBill: { subtotal: null, tax: null, billedAmount: "1070.13" },
  };
  context.mock.method(globalThis, "fetch", async () => Response.json(data));
  assert.deepEqual(await loadCustomerHome("7d"), { status: "ready", data });
  assert.deepEqual(await readCustomerHome(Response.json(data)), {
    status: "ready",
    data,
  });
});
test("HTTP, malformed JSON and network failures normalize to unavailable without legacy reads", async (context) => {
  for (const fetcher of [
    async () => new Response("fail", { status: 503 }),
    async () => new Response("not json"),
    async () => {
      throw new Error("offline");
    },
  ]) {
    const mocked = context.mock.method(globalThis, "fetch", fetcher);
    assert.deepEqual(await loadCustomerHome("7d"), {
      status: "unavailable",
    });
    mocked.mock.restore();
  }
});
test("a valid 7-day request includes credentials and forwards cancellation", async (context) => {
  const controller = new AbortController();
  let captured: RequestInit | undefined;
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      assert.equal(
        new URL(url, "http://customer-home.test").pathname +
          new URL(url, "http://customer-home.test").search,
        "/v1/customer/portal/home?range=7d",
      );
      captured = options;
      return new Response("fail", { status: 503 });
    },
  );
  await loadCustomerHome("7d", controller.signal);
  assert.equal(captured?.credentials, "include");
  assert.equal(captured?.signal, controller.signal);
});
