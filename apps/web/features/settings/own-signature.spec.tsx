import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {OwnSignatureCard, readSignatureFile, saveOwnSignature} from './own-signature';
import {authStore} from '../../stores/auth-store';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium, type Route} from '@playwright/test';

const profile = {displayName: 'สมชาย', companyPosition: 'กรรมการบริษัท', hasSignature: false};
const user = {id: 'current-user', email: 'person@example.test', displayName: 'สมชาย', role: 'owner' as const};
const signature = 'data:image/png;base64,aW1hZ2U=';

test('hydration excludes stored signature bytes even when storage rewrites are unavailable', () => {
  const descriptors = ['window', 'document', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  const stored = new Map([['solar-auth-user', JSON.stringify({...user, signatureDataUri: signature, signature_data: signature})], ['solar-access-token', 'stored-token']]);
  let failWrites = true;
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {if (failWrites) throw new Error('Storage disabled'); stored.set(key, value);},
    removeItem: (key: string) => stored.delete(key),
  };
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {}});
  Object.defineProperty(globalThis, 'document', {configurable: true, value: {cookie: ''}});
  Object.defineProperty(globalThis, 'localStorage', {configurable: true, value: storage});
  try {
    assert.equal(authStore.getState().user?.id, user.id);
    assert.equal(authStore.getState().accessToken, 'stored-token');
    assert.equal('signatureDataUri' in authStore.getState().user!, false);
    failWrites = false;
    const fullUser = {...user, signatureDataUri: signature, signature_data: signature};
    authStore.setAuth(fullUser, 'stored-token');
    const fullProfile = {...profile, hasSignature: true, signatureDataUri: signature};
    authStore.updateDocumentIdentity(user.id, fullProfile);
    const persisted = JSON.parse(stored.get('solar-auth-user')!);
    assert.equal(persisted.companyPosition, 'กรรมการบริษัท');
    assert.equal(persisted.hasSignature, true);
    assert.equal('signatureDataUri' in persisted, false);
    assert.equal('signature_data' in persisted, false);
    assert.equal(stored.get('solar-access-token'), 'stored-token');
  } finally {
    authStore.clear();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test('file reading accepts the size boundary and exposes reader failures without uploading', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  let outcome: 'load' | 'error' | 'abort' = 'load';
  class Reader {
    result = signature;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    readAsDataURL() {this[`on${outcome}`]?.();}
  }
  Object.defineProperty(globalThis, 'FileReader', {configurable: true, value: Reader});
  try {
    assert.equal(await readSignatureFile(new File([new Uint8Array(256*1024)], 'signature.png', {type: 'image/png'}), 'en'), signature);
    for (const failure of ['error', 'abort'] as const) {
      outcome = failure;
      await assert.rejects(readSignatureFile(new File(['image'], 'signature.jpg', {type: 'image/jpeg'}), 'en'), /Unable to read signature/);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'FileReader', descriptor);
    else Reflect.deleteProperty(globalThis, 'FileReader');
  }
});

test('document identity shows actual position and future document purpose without a synthetic user label', () => {
  const html = renderToStaticMarkup(<OwnSignatureCard profile={profile} busy={false} onChoose={()=>{}} onRemove={()=>{}}/>);
  assert.match(html, /ตำแหน่ง.*กรรมการบริษัท/s);
  assert.match(html, /เอกสารในอนาคต/);
  assert.doesNotMatch(html, /user-[0-9a-f-]+/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>ลบลายเซ็น/);
});

test('a saved signature has a readable preview, replacement action and fallback position', () => {
  const html = renderToStaticMarkup(<OwnSignatureCard profile={{...profile, companyPosition: null, hasSignature: true, signatureDataUri: signature}} busy={false} locale="en" onChoose={()=>{}} onRemove={()=>{}}/>);
  assert.match(html, /Position not assigned/);
  assert.match(html, /alt="My signature"/);
  assert.match(html, /Replace signature/);
  assert.match(html, /accept="image\/png,image\/jpeg"/);
  assert.match(html, /<button[^>]*>Remove signature/);
});

test('signature mutations disable every action and announce progress and errors', () => {
  const html = renderToStaticMarkup(<OwnSignatureCard profile={{...profile, hasSignature: true, signatureDataUri: signature}} busy locale="en" error="Could not save" onChoose={()=>{}} onRemove={()=>{}}/>);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /<input[^>]*disabled=""/);
  assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2);
  assert.match(html, /role="status"[^>]*>Saving/);
  assert.match(html, /role="alert"[^>]*>Could not save/);
});

test('invalid signature files are rejected before accessing a reader', async () => {
  for (const file of [new File(['svg'], 'signature.svg', {type: 'image/svg+xml'}), new File([new Uint8Array(256*1024+1)], 'large.png', {type: 'image/png'}), new File([], 'empty.png', {type: 'image/png'})]) {
    await assert.rejects(readSignatureFile(file, 'en'), /PNG or JPEG.*256 KiB/);
  }
});

test('auth snapshots and document identity refresh never retain signature bytes', () => {
  const fullUser = {...user, signatureDataUri: signature, signature_data: signature};
  authStore.setAuth(fullUser, 'existing-token');
  assert.equal('signatureDataUri' in authStore.getState().user!, false);
  assert.equal('signature_data' in authStore.getState().user!, false);
  const fullProfile = {...profile, hasSignature: true, signatureDataUri: signature};
  authStore.updateDocumentIdentity(user.id, fullProfile);
  assert.equal(authStore.getState().user?.companyPosition, 'กรรมการบริษัท');
  assert.equal(authStore.getState().user?.hasSignature, true);
  assert.equal('signatureDataUri' in authStore.getState().user!, false);
  assert.equal(authStore.getState().accessToken, 'existing-token');
  authStore.updateDocumentIdentity('another-user', {companyPosition: 'Wrong position', hasSignature: false});
  assert.equal(authStore.getState().user?.hasSignature, true);
  authStore.clear();
});

test('upload and remove use the authenticated API and clear the omitted preview after removal', async () => {
  const originalFetch = globalThis.fetch;
  const requests: {url: string; method: string | undefined; body: unknown}[] = [];
  globalThis.fetch = async (url, options) => {
    requests.push({url: String(url), method: options?.method, body: JSON.parse(String(options?.body))});
    return Response.json(requests.length === 1 ? {hasSignature: true, signatureDataUri: signature} : {hasSignature: false});
  };
  try {
    authStore.setAuth(user, 'existing-token');
    const uploaded = await saveOwnSignature(profile, signature, user.id);
    assert.equal(uploaded.signatureDataUri, signature);
    assert.equal(authStore.getState().user?.hasSignature, true);
    assert.equal('signatureDataUri' in authStore.getState().user!, false);
    const removed = await saveOwnSignature(uploaded, null, user.id);
    assert.equal(removed.signatureDataUri, undefined);
    assert.equal(removed.hasSignature, false);
    assert.equal(authStore.getState().user?.hasSignature, false);
    assert.deepEqual(requests.map(({url, method, body}) => ({path: new URL(url, 'http://localhost').pathname, method, body})), [
      {path: '/v1/me/signature', method: 'PUT', body: {image: signature}},
      {path: '/v1/me/signature', method: 'PUT', body: {image: null}},
    ]);
  } finally { globalThis.fetch = originalFetch; authStore.clear(); }
});

test('a failed save preserves the previous signature and a response cannot refresh a different session', async () => {
  const originalFetch = globalThis.fetch;
  try {
    authStore.setAuth({...user, hasSignature: true}, 'existing-token');
    globalThis.fetch = async () => Response.json({message: 'Request failed'}, {status: 500});
    await assert.rejects(saveOwnSignature({...profile, hasSignature: true, signatureDataUri: signature}, null, user.id));
    assert.equal(authStore.getState().user?.hasSignature, true);
    globalThis.fetch = async () => {
      authStore.setAuth({...user, id: 'new-user', hasSignature: false}, 'new-token');
      return Response.json({hasSignature: true, signatureDataUri: signature});
    };
    await saveOwnSignature(profile, signature, user.id);
    assert.equal(authStore.getState().user?.id, 'new-user');
    assert.equal(authStore.getState().user?.hasSignature, false);
    assert.equal(authStore.getState().accessToken, 'new-token');
  } finally {globalThis.fetch = originalFetch; authStore.clear();}
});

// Real React lifecycle and FileReader; only the external API responses are delayed.
// Browser plugin not available. Use the existing Playwright dependency and Edge
// on Windows, or the normal Playwright Chromium installation on other platforms.
for (const mutation of ['remove', 'replace'] as const) {
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
      `, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'tsx'},
      bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
      tsconfig: fileURLToPath(new URL('../../tsconfig.ui-tests.json', import.meta.url)),
      define: {'process.env.NEXT_PUBLIC_API_URL': '""', 'process.env.API_INTERNAL_URL': '""', 'process.env.NODE_ENV': '"test"'},
    });
    const browser = await chromium.launch(process.platform === 'win32' ? {channel: 'msedge', headless: true} : {headless: true});
    try {
      const page = await browser.newPage();
      let readCount = 0;
      let resolveRead!: (route: Route) => void;
      const pendingRead = new Promise<Route>(resolve => {resolveRead = resolve;});
      const oldProfile = {...profile, hasSignature: true, signatureDataUri: signature};
      const nextSignature = 'data:image/png;base64,bmV3';
      const errors: string[] = [];
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
      const identity = () => page.evaluate<{hasSignature: boolean}>('window.identity()');
      assert.equal((await identity()).hasSignature, mutation === 'replace');
      const response = page.waitForResponse('http://signature.test/v1/me/profile');
      await delayedRead.fulfill({json: oldProfile});
      await (await response).finished();
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      assert.equal((await identity()).hasSignature, mutation === 'replace');
      if (mutation === 'remove') assert.equal(await page.getByRole('img', {name: 'My signature'}).count(), 0);
      else assert.equal(await page.getByRole('img', {name: 'My signature'}).getAttribute('src'), nextSignature);
      assert.deepEqual(errors, []);
    } finally {await browser.close();}
  });
}
