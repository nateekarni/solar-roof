import assert from 'node:assert/strict';

// Fixture ownership must be checked by the caller before opening a browser.
export async function openFixtureBrowser(chromium, environment) {
  const endpoint = environment.CI_BROWSER_WS_ENDPOINT;
  if (endpoint !== undefined) {
    assert.equal(endpoint, 'ws://127.0.0.1:13999/', 'CI_BROWSER_WS_ENDPOINT must be ws://127.0.0.1:13999/');
    return chromium.connect(endpoint, {headers:{'x-playwright-launch-options':JSON.stringify({args:['--host-resolver-rules=MAP localhost 127.0.0.1']})}});
  }
  return chromium.launch({headless:true,args:['--host-resolver-rules=MAP localhost 127.0.0.1'],...(environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:environment.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
}
