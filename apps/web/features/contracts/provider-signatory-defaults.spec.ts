import assert from 'node:assert/strict';
import test from 'node:test';
import { providerSignatoryPatch } from './provider-signatory-defaults.js';
const defaults={signatoryName:'Default provider',signatoryTitle:'Director'};
test('provider defaults fill untouched fields without overwriting edits or deliberate blanks',()=>{
 assert.deepEqual(providerSignatoryPatch(defaults,{signerName:'',signerTitle:''},new Set()),{signerName:'Default provider',signerTitle:'Director'});
 assert.deepEqual(providerSignatoryPatch(defaults,{signerName:'Custom name',signerTitle:''},new Set(['signerName'])),{signerTitle:'Director'});
 assert.deepEqual(providerSignatoryPatch(defaults,{signerName:'',signerTitle:'Custom title'},new Set(['signerName','signerTitle'])),{});
});
