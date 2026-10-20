import assert from "node:assert/strict";
import test from "node:test";
import { posix, win32 } from "node:path";
import {
  assertExternalScreenshotDirectory,
  allowOwnedFixtureRequest,
  withFixtureResources,
} from "./platform/customer-portal-fixture-guards.mjs";

test("screenshot containment rejects the repo, descendants and dot-dot-prefixed descendants while allowing real external targets", () => {
  for (const [paths, repo, outside, crossDrive] of [
    [posix, "/workspace/solar-roof", "/workspace/screenshots", null],
    [
      win32,
      "D:\\Dev\\solar-roof",
      "D:\\Dev\\screenshots",
      "C:\\Users\\natee\\screenshots",
    ],
  ]) {
    for (const suffix of [
      "",
      "screenshots",
      "..customer-screenshots",
      "..customer-screenshots/nested",
    ])
      assert.throws(
        () =>
          assertExternalScreenshotDirectory(
            paths.join(repo, suffix),
            repo,
            paths,
          ),
        /outside the repository/,
      );
    assert.equal(
      assertExternalScreenshotDirectory(outside, repo, paths),
      paths.resolve(outside),
    );
    assert.equal(
      assertExternalScreenshotDirectory(paths.dirname(repo), repo, paths),
      paths.resolve(paths.dirname(repo)),
    );
    if (crossDrive)
      assert.equal(
        assertExternalScreenshotDirectory(crossDrive, repo, paths),
        paths.resolve(crossDrive),
      );
  }
});

test("network allowlist permits the exact fixture/download origin and aborts every other origin", async () => {
  const origin = "http://localhost:32201",
    unexpected = [],
    aborted = [];
  for (const url of [origin + "/", origin + "/evidence/previous.bin"]) {
    assert.equal(
      await allowOwnedFixtureRequest(
        {
          request: () => ({ url: () => url }),
          abort: () => {
            throw new Error("Owned request was aborted");
          },
        },
        origin,
        unexpected,
      ),
      true,
    );
  }
  for (const url of [
    "https://example.test/asset",
    "http://localhost:32202/file",
    "http://127.0.0.1:32201/file",
    "http://localhost:32201.example.test/file",
    "http://localhost:32201@example.test/file",
    "data:text/plain,not-network",
    "not a URL",
  ]) {
    assert.equal(
      await allowOwnedFixtureRequest(
        {
          request: () => ({ url: () => url }),
          abort: async (reason) => aborted.push({ url, reason }),
        },
        origin,
        unexpected,
      ),
      false,
    );
  }
  assert.equal(unexpected.length, 7);
  assert.deepEqual(
    aborted.map((item) => item.url),
    unexpected,
  );
  assert.ok(aborted.every((item) => item.reason === "blockedbyclient"));
});

test("partial fixture acquisition closes every acquired resource even when one close rejects", async () => {
  for (const failure of [
    "listener",
    "listen",
    "browser",
    "context",
    "page",
    "route",
    "navigation",
  ]) {
    const acquired = [],
      closed = [];
    await assert.rejects(
      withFixtureResources(async (own) => {
        for (const stage of [
          "listener",
          "listen",
          "browser",
          "context",
          "page",
          "route",
          "navigation",
        ]) {
          if (["browser", "context", "page", "listener"].includes(stage)) {
            acquired.push(stage);
            own(async () => {
              closed.push(stage);
              if (stage === "context") throw new Error("context close failed");
            });
          }
          if (stage === failure) throw new Error(`setup ${failure} failed`);
        }
        return {};
      }),
      (error) => {
        const setupError = error.cause ?? error;
        assert.equal(setupError.message, `setup ${failure} failed`);
        return true;
      },
    );
    assert.deepEqual(closed, acquired.toReversed(), failure);
  }
});

test("successful fixture cleanup is idempotent and attempts every remaining closer before reporting errors", async () => {
  const closed = [];
  const fixture = await withFixtureResources(async (own) => {
    own(async () => {
      closed.push("browser");
    });
    own(async () => {
      closed.push("listener");
      throw new Error("listener close failed");
    });
    own(async () => {
      closed.push("page");
    });
    return { ready: true };
  });
  assert.equal(fixture.ready, true);
  await assert.rejects(fixture.close(), /Fixture cleanup failed/);
  await assert.rejects(fixture.close(), /Fixture cleanup failed/);
  assert.deepEqual(closed, ["page", "listener", "browser"]);
});

test("dependent resources close sequentially in reverse acquisition order and failures do not skip remaining closers", async () => {
  const events = [],
    closed = new Set();
  const contextFailure = new Error("context close failed after disposal");
  const listenerFailure = new Error("listener close failed after disposal");
  const fixture = await withFixtureResources(async (own) => {
    for (const [resource, dependency] of [
      ["listener", "browser"],
      ["browser", "context"],
      ["context", "page"],
      ["page", null],
    ]) {
      own(async () => {
        events.push(`start ${resource}`);
        await Promise.resolve();
        if (dependency)
          assert.ok(
            closed.has(dependency),
            `${dependency} must finish before ${resource}`,
          );
        closed.add(resource);
        events.push(`end ${resource}`);
        if (resource === "context") throw contextFailure;
        if (resource === "listener") throw listenerFailure;
      });
    }
    return {};
  });
  const closing = fixture.close();
  assert.equal(
    fixture.close(),
    closing,
    "concurrent close calls share one disposal",
  );
  await assert.rejects(closing, (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [contextFailure, listenerFailure]);
    return true;
  });
  assert.deepEqual(events, [
    "start page",
    "end page",
    "start context",
    "end context",
    "start browser",
    "end browser",
    "start listener",
    "end listener",
  ]);
  await assert.rejects(fixture.close(), /Fixture cleanup failed/);
  assert.equal(events.length, 8, "completed cleanup is not repeated");
});

test("mounted fixture intercepts an unowned loopback alias before it reaches the download listener", async () => {
  const { customerFixture, checkSurface } =
    await import("./platform/customer-portal-fixture.mjs");
  const fixture = await customerFixture();
  try {
    await checkSurface(fixture, "/");
    const unowned = new URL("/fixture-escape", fixture.origin);
    unowned.hostname = "127.0.0.1";
    assert.equal(
      await fixture.page.evaluate(async (url) => {
        try {
          await fetch(url, { mode: "no-cors" });
          return "escaped";
        } catch {
          return "blocked";
        }
      }, unowned.href),
      "blocked",
    );
    assert.deepEqual(fixture.state.unexpected, [unowned.href]);
    assert.deepEqual(fixture.state.errors, []);
  } finally {
    await fixture.close();
  }
});
