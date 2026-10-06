import assert from 'node:assert/strict';
import test from 'node:test';
import * as transport from '../../apps/web/test/platform/browser-transport.mjs';

test('launches locally with existing IPv4 and headless options by default', async () => {
  const browser = {};
  const chromium = {
    launch: async options => {
      assert.deepEqual(options, {headless:true,args:['--host-resolver-rules=MAP localhost 127.0.0.1']});
      return browser;
    },
    connect: () => assert.fail('Default mode must not connect remotely'),
  };
  assert.equal(await transport.openFixtureBrowser(chromium, {}), browser);
});

test('preserves an explicit local Chromium executable', async () => {
  const browser = {};
  assert.equal(await transport.openFixtureBrowser({launch: async options => {
    assert.equal(options.executablePath, '/opt/chromium');
    return browser;
  }}, {PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:'/opt/chromium'}), browser);
});

test('connects only to the explicit CI browser endpoint', async () => {
  const browser = {};
  assert.equal(await transport.openFixtureBrowser({
    launch: () => assert.fail('Remote mode must not launch locally'),
    connect: async (endpoint, options) => {
      assert.equal(endpoint, 'ws://127.0.0.1:13999/');
      assert.deepEqual(options, {headers:{'x-playwright-launch-options':JSON.stringify({args:['--host-resolver-rules=MAP localhost 127.0.0.1']})}});
      return browser;
    },
  }, {CI_BROWSER_WS_ENDPOINT:'ws://127.0.0.1:13999/',PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:'/ignored'}), browser);
});

test('propagates remote connection failure without a local fallback', async () => {
  const failure = new Error('Browser server unavailable');
  await assert.rejects(transport.openFixtureBrowser({
    launch: () => assert.fail('A remote failure must not launch locally'),
    connect: async () => { throw failure; },
  }, {CI_BROWSER_WS_ENDPOINT:'ws://127.0.0.1:13999/'}), error => error === failure);
});

for (const endpoint of ['', 'ws://production.example:13999/', 'ws://localhost:13999/', 'ws://127.0.0.1:14000/', 'wss://127.0.0.1:13999/', 'ws://127.0.0.1:13999', 'ws://user@127.0.0.1:13999/', 'ws://127.0.0.1:13999/?token=secret', 'ws://127.0.0.1:13999/#fragment', 'ws://127.0.0.1:13999/path', ' ws://127.0.0.1:13999/']) {
  test(`rejects a non-designated endpoint: ${JSON.stringify(endpoint)}`, async () => {
    await assert.rejects(transport.openFixtureBrowser({
      launch: () => assert.fail('Invalid configuration must not launch'),
      connect: () => assert.fail('Invalid configuration must not connect'),
    }, {CI_BROWSER_WS_ENDPOINT:endpoint}), /CI_BROWSER_WS_ENDPOINT/);
  });
}
