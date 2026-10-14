import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {openFixtureBrowser} from './browser-transport.mjs';

const profile = {displayName: 'สมชาย', companyPosition: 'กรรมการบริษัท', hasSignature: false};
const user = {id: 'current-user', email: 'person@example.test', displayName: 'สมชาย', role: 'owner'};
const signature = 'data:image/png;base64,aW1hZ2U=';

// Real React lifecycle and FileReader; only the external API responses are delayed.
// Run after browser provisioning. The shared transport prefers the CI browser
// endpoint and supports PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH for local Windows.
for (const mutation of ['remove', 'replace']) {
  test(`a profile GET begun before signature ${mutation} cannot overwrite the later PUT`, async () => {
    const require = createRequire(import.meta.url);
    const {build} = createRequire(require.resolve('tsx'))('esbuild');
    const bundle = await build({
      stdin: {contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {OwnSignature} from './own-signature';
        import {authStore} from '../../stores/auth-store';
        import {LocaleProvider,useSetLocale} from '../../providers/locale-provider';
        authStore.setAuth(${JSON.stringify(user)}, 'test-token');
        window.identity = () => authStore.getState().user;
        function Account() {
          const setLocale = useSetLocale();
          return <><button onClick={() => void setLocale('en')}>English</button><OwnSignature/></>;
        }
        createRoot(document.getElementById('root')).render(<LocaleProvider initialLocale="th"><Account/></LocaleProvider>);
      `, resolveDir: fileURLToPath(new URL('../../features/settings/', import.meta.url)), loader: 'tsx'},
      bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
      tsconfig: fileURLToPath(new URL('../../tsconfig.ui-tests.json', import.meta.url)),
      define: {'process.env.NEXT_PUBLIC_API_URL': '""', 'process.env.API_INTERNAL_URL': '""', 'process.env.NODE_ENV': '"test"'},
    });
    const browser = await openFixtureBrowser(chromium, process.env);
    try {
      const page = await browser.newPage();
      let readCount = 0;
      let resolveRead;
      const pendingRead = new Promise(resolve => {resolveRead = resolve;});
      const oldProfile = {...profile, hasSignature: true, signatureDataUri: signature};
      const nextSignature = 'data:image/png;base64,bmV3';
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://signature.test/**', async route => {
        const request = route.request();
        if (request.url().endsWith('/v1/me/profile')) {
          if (++readCount === 1) await route.fulfill({json: oldProfile});
          else resolveRead(route);
        } else if (request.url().endsWith('/v1/me/signature')) {
          assert.equal(request.method(), 'PUT');
          const body = request.postDataJSON();
          assert.equal(mutation === 'remove' ? body.image === null : typeof body.image === 'string', true);
          await route.fulfill({json: mutation === 'remove' ? {hasSignature: false} : {hasSignature: true, signatureDataUri: nextSignature}});
        } else if (request.url().endsWith('/v1/me/preferences')) await route.fulfill({json: {preferredLanguage: 'en'}});
        else await route.fulfill({contentType: 'text/html', body: '<!doctype html><html><title>Signature lifecycle test</title><div id="root"></div></html>'});
      });
      await page.goto('http://signature.test/');
      await page.addScriptTag({content: bundle.outputFiles[0].text});
      await page.getByRole('button', {name: 'ลบลายเซ็น', exact: true}).waitFor();
      await page.getByRole('button', {name: 'English', exact: true}).click();
      const delayedRead = await pendingRead;
      if (mutation === 'remove') await page.getByRole('button', {name: 'Remove signature', exact: true}).click();
      else await page.getByLabel('Upload signature', {exact: true}).setInputFiles({name: 'replacement.png', mimeType: 'image/png', buffer: Buffer.from('new image')});
      await page.getByRole('status').filter({hasText: 'Signature updated'}).waitFor();
      const identity = () => page.evaluate('window.identity()');
      assert.equal((await identity()).hasSignature, mutation === 'replace');
      const response = page.waitForResponse('http://signature.test/v1/me/profile');
      await delayedRead.fulfill({json: oldProfile});
      await (await response).finished();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      assert.equal((await identity()).hasSignature, mutation === 'replace');
      if (mutation === 'remove') assert.equal(await page.getByRole('img', {name: 'My signature'}).count(), 0);
      else assert.equal(await page.getByRole('img', {name: 'My signature'}).getAttribute('src'), nextSignature);
      assert.deepEqual(errors, []);
    } finally {await browser.close();}
  });
}
