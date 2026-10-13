import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { totpCode, matchTotpCounter, encodeBase32, encryptSecret, decryptSecret } from './totp.js';

// RFC 6238 Appendix B SHA1 vectors, independently specified by the RFC.
test('TOTP matches RFC6238 SHA1 vectors including times beyond 2038',()=>{
 const secret=encodeBase32(Buffer.from('12345678901234567890'));
 for(const [seconds,want] of [[59,'94287082'],[1111111109,'07081804'],[1111111111,'14050471'],[1234567890,'89005924'],[2000000000,'69279037'],[20000000000,'65353130']] as const)
  assert.equal(totpCode(secret,Math.floor(seconds/30),8),want);
});
test('TOTP accepts narrow drift and rejects replay and malformed codes',()=>{
 const secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 assert.equal(matchTotpCounter(secret,'287082',59000,-1),1);
 assert.equal(matchTotpCounter(secret,'287082',59000,1),null);
 assert.equal(matchTotpCounter(secret,'287082',180000,-1),null);
 for(const code of ['','28708','2870820','abcdef'])assert.equal(matchTotpCounter(secret,code,59000,-1),null);
});
test('encrypted secrets bind to the user and detect tampering without storing plaintext',()=>{
 const key='ab'.repeat(32),secret='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 const encrypted=encryptSecret(secret,'user-a',key);
 assert.ok(!encrypted.includes(secret));
 assert.equal(decryptSecret(encrypted,'user-a',key),secret);
 assert.throws(()=>decryptSecret(encrypted,'user-b',key));
 assert.throws(()=>decryptSecret(encrypted.replace(/^./,'X'),'user-a',key));
 assert.throws(()=>encryptSecret(secret,'user-a','short'));
});
