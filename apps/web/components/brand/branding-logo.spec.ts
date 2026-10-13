import assert from 'node:assert/strict';
import test from 'node:test';
import {brandingLogoSrc, subscribeBranding, getBrandingRevision, companyBrandingUpdated} from './branding-logo';

test('a saved branding revision requests a fresh public image URL', () => {
  assert.equal(brandingLogoSrc(0), '/v1/public/branding/logo');
  assert.equal(brandingLogoSrc(123), '/v1/public/branding/logo?revision=123');
});

test('branding updates notify all marks and survive remounts', () => {
  const browser = new EventTarget();
  const values = new Map<string,string>();
  Object.assign(browser, {localStorage: {getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>values.set(key,value)}});
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {configurable:true, value:browser});
  try {
    let first = 0, second = 0;
    const stopFirst = subscribeBranding(() => first++);
    const stopSecond = subscribeBranding(() => second++);
    const before = getBrandingRevision();
    companyBrandingUpdated();
    assert.ok(getBrandingRevision() > before);
    assert.equal(first, 1);
    assert.equal(second, 1);
    const saved = getBrandingRevision();
    stopFirst(); stopSecond();
    const stopRemounted = subscribeBranding(() => {});
    assert.equal(getBrandingRevision(), saved);
    stopRemounted();
    companyBrandingUpdated();
    assert.ok(getBrandingRevision() > saved);
  } finally {
    if(original) Object.defineProperty(globalThis,'window',original);
    else Reflect.deleteProperty(globalThis,'window');
  }
});
