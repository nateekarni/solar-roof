import assert from 'node:assert/strict';
import test from 'node:test';
import { notificationScope, parseNotificationIds } from './notification-feed.service.js';
import { routeAllowed } from '../../common/auth/route-policy.js';

test('customers never receive technical sources and unassigned customers have empty scope', () => {
 assert.deepEqual(notificationScope({id:'u',role:'school_user'}), {userId:'u',schools:[],alerts:false,workflows:false});
 assert.deepEqual(notificationScope({id:'u',role:'school_user',schoolId:'s'}), {userId:'u',schools:['s'],alerts:false,workflows:false});
 assert.equal(notificationScope({id:'u',role:'owner'}).alerts,false);
 assert.equal(notificationScope({id:'u',role:'operator',schoolId:'s'}).alerts,true);
 assert.throws(()=>notificationScope({role:'admin'}));
});
test('read mutations reject malformed and oversized identities before database access',()=>{
 assert.deepEqual(parseNotificationIds(['alert:a','payment:b','alert:a']),['alert:a','payment:b']);
 for(const ids of [null,{},['unknown:a'],[12],Array(501).fill('alert:a')])assert.throws(()=>parseNotificationIds(ids));
});
test('all verified roles can read and mark their feed but cannot create feed events',()=>{
 for(const role of ['owner','admin','operator','accountant','school_user']){
  assert.equal(routeAllowed(role,'GET','/v1/me/notification-feed'),true);
  assert.equal(routeAllowed(role,'PUT','/v1/me/notification-feed/read'),true);
  assert.equal(routeAllowed(role,'PUT','/v1/me/notification-feed/read-all'),true);
  assert.equal(routeAllowed(role,'POST','/v1/me/notification-feed'),false);
 }
});
