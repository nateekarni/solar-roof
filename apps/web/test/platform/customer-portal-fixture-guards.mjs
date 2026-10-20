import assert from "node:assert/strict";
import { resolve, relative, isAbsolute, sep } from "node:path";

export function assertExternalScreenshotDirectory(
  target,
  repo,
  paths = { resolve, relative, isAbsolute, sep },
) {
  const destination = paths.resolve(target);
  const within = paths.relative(paths.resolve(repo), destination);
  assert.ok(
    paths.isAbsolute(within) ||
      within === ".." ||
      within.startsWith(".." + paths.sep),
    "Customer screenshots must stay outside the repository",
  );
  return destination;
}

export async function allowOwnedFixtureRequest(route, origin, unexpected) {
  const url = route.request().url();
  try {
    if (new URL(url).origin === origin) return true;
  } catch {
    /* Invalid URLs are denied just like unowned origins. */
  }
  unexpected.push(url);
  await route.abort("blockedbyclient");
  return false;
}

// Register a closer immediately after each resource is acquired, before any
// following setup can fail. Release children before parents, exactly once, and
// attempt every remaining closer even when an earlier disposal fails.
export async function withFixtureResources(setup) {
  const disposers = [];
  let closePromise;
  const own = (disposer) => disposers.push(disposer);
  const close = () =>
    (closePromise ??= (async () => {
      const failures = [];
      for (const dispose of disposers.toReversed()) {
        try {
          await dispose();
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length)
        throw new AggregateError(failures, "Fixture cleanup failed");
    })());
  let complete = false,
    setupFailure;
  try {
    const fixture = await setup(own);
    complete = true;
    return { ...fixture, close };
  } catch (error) {
    setupFailure = error;
    throw error;
  } finally {
    if (!complete) {
      try {
        await close();
      } catch (error) {
        throw new AggregateError(
          [setupFailure, error],
          "Fixture setup and cleanup failed",
          { cause: setupFailure },
        );
      }
    }
  }
}
