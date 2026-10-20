import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { build } = createRequire(import.meta.resolve("tsx"))("esbuild");
globalThis.__accountRoute = { role: "customer_user", paths: [] };
const result = await build({
  entryPoints: [
    fileURLToPath(
      new URL("../app/(app)/settings/account/layout.tsx", import.meta.url),
    ),
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "verified-route-boundary",
      setup(build) {
        build.onResolve(
          { filter: /session-user$|^next\/navigation$/ },
          (args) => ({ path: args.path, namespace: "route" }),
        );
        build.onLoad({ filter: /.*/, namespace: "route" }, (args) => ({
          loader: "js",
          contents: args.path.endsWith("session-user")
            ? "export async function requirePageAccess(path){globalThis.__accountRoute.paths.push(path);return {role:globalThis.__accountRoute.role}}"
            : "export function redirect(path){throw new Error('redirect:'+path)}",
        }));
      },
    },
  ],
});
const { default: Layout } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
test("customer legacy account and security destination redirects before mounting staff account forms", async () => {
  await assert.rejects(
    () => Layout({ children: "staff account controls" }),
    /redirect:\/settings/,
  );
  assert.deepEqual(globalThis.__accountRoute.paths, ["/settings/account"]);
});
test("all staff roles retain the identical account subtree", async () => {
  const children = { staff: "existing subtree" };
  for (const role of ["owner", "admin", "operator", "accountant"]) {
    globalThis.__accountRoute.role = role;
    assert.equal(await Layout({ children }), children);
  }
});

const settingsBundle = await build({
  entryPoints: [
    fileURLToPath(new URL("../app/(app)/settings/page.tsx", import.meta.url)),
  ],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  jsx: "automatic",
  plugins: [
    {
      name: "settings-route-boundary",
      setup(build) {
        build.onResolve(
          {
            filter:
              /session-user-provider$|locale-provider$|auth-store$|customer-account-page$|^next\/navigation$/,
          },
          (args) => ({ path: args.path, namespace: "settings-boundary" }),
        );
        build.onLoad(
          { filter: /.*/, namespace: "settings-boundary" },
          (args) => ({
            loader: "js",
            contents: args.path.endsWith("session-user-provider")
              ? "export function useSessionUser(){return {role:globalThis.__accountRoute.role,displayName:'Customer',email:'customer@example.test'}}"
              : args.path.endsWith("locale-provider")
                ? "export function useLocale(){return 'en'}"
                : args.path.endsWith("auth-store")
                  ? "export function useAuth(){return {clear(){}}}"
                  : args.path.endsWith("customer-account-page")
                    ? "export function CustomerAccountPage(){}"
                    : "export function useRouter(){return {push(){}}}",
          }),
        );
      },
    },
  ],
});
const { default: Settings } = await import(
  `data:text/javascript;base64,${Buffer.from(settingsBundle.outputFiles[0].text).toString("base64")}`
);
test("settings mounts customer composition only for customer_user and keeps staff operations tree", () => {
  globalThis.__accountRoute.role = "customer_user";
  assert.equal(Settings().type.name, "CustomerAccountPage");
  for (const role of ["owner", "admin", "operator", "accountant"]) {
    globalThis.__accountRoute.role = role;
    const element = Settings();
    assert.equal(element.type, "main");
    assert.equal(element.props.className, "content");
    assert.equal(
      element.props.children.props.className,
      "ops-content space-y-6",
    );
  }
});
