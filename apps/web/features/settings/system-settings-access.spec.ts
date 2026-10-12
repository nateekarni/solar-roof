import assert from 'node:assert/strict';
import test from 'node:test';
import {effectivePageAccess} from '../../lib/effective-page-access';
test('system defaults require technical authority, including staff grants',()=>{
 const scopes={business:{mode:'all' as const,siteIds:[]},technical:{mode:'all' as const,siteIds:[]}};
 assert.equal(effectivePageAccess({role:'owner'},'/settings/system'),false);
 assert.equal(effectivePageAccess({role:'admin'},'/settings/system'),true);
 for(const role of ['operator','accountant']){
  assert.equal(effectivePageAccess({role},'/settings/system'),false);
  assert.equal(effectivePageAccess({role,authorization:{revision:1,scopes,permissions:['business.settings.view']}},'/settings/system'),false);
  assert.equal(effectivePageAccess({role,authorization:{revision:1,scopes,permissions:['technical.settings.view']}},'/settings/system'),true);
 }
});
