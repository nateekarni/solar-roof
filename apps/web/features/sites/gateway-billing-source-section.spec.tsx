import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SessionUserProvider} from '../../providers/session-user-provider';
import {GatewayBillingSourceSection} from './gateway-billing-source-section';
import type {PayloadReceiveConfig} from './payload-contracts';

const receiveConfig:PayloadReceiveConfig={messagesPath:'',fieldPaths:{},deviceAliases:[]};

test('gateway settings owns the admin-only billing source section',()=>{
 const admin=renderToStaticMarkup(<SessionUserProvider user={{id:'a',email:'admin@example.test',displayName:'Admin',role:'admin'}}><GatewayBillingSourceSection siteId="site-a" locale="th" receiveConfig={receiveConfig}/></SessionUserProvider>);
 assert.match(admin,/กำลังโหลดแหล่งข้อมูลบิล/);
 const owner=renderToStaticMarkup(<SessionUserProvider user={{id:'o',email:'owner@example.test',displayName:'Owner',role:'owner'}}><GatewayBillingSourceSection siteId="site-a" locale="th" receiveConfig={receiveConfig}/></SessionUserProvider>);
 assert.equal(owner,'');
});
