import assert from 'node:assert/strict';import test from 'node:test';
import {effectivePageAccess} from './effective-page-access';
test('employee destinations use effective domain view grants instead of broad legacy role access',()=>{
 const authorization={revision:4,permissions:['business.sites.view','technical.gateways.view'],scopes:{business:{mode:'selected' as const,siteIds:['a']},technical:{mode:'selected' as const,siteIds:['b']}}};
 assert.equal(effectivePageAccess({role:'operator',authorization},'/sites'),true);assert.equal(effectivePageAccess({role:'operator',authorization},'/gateways'),true);assert.equal(effectivePageAccess({role:'operator',authorization},'/billing'),false);assert.equal(effectivePageAccess({role:'operator',authorization},'/settings/users'),false);
});
test('customer assignment access remains independent of staff permission grants',()=>{const user={role:'customer_user',authorization:{revision:1,permissions:[],scopes:{business:{mode:'selected' as const,siteIds:[]},technical:{mode:'selected' as const,siteIds:[]}}}};assert.equal(effectivePageAccess(user,'/billing'),true);assert.equal(effectivePageAccess(user,'/gateways'),false);});
