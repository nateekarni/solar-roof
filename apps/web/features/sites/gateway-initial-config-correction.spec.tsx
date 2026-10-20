import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {GatewayConfigPayload,GatewaySyncState} from '@solar/api-contracts';
import {LocaleProvider} from '../../providers/locale-provider';
import {GatewayInitialConfigCorrection,canCorrectInitialConfig,initialCorrectionDraft,initialCorrectionRequest,isInitialCorrectionConflict} from './gateway-initial-config-correction';

const desired:GatewayConfigPayload={schemaVersion:'1.1',messageType:'config',messageId:'cfg',gatewayId:'GW-1',siteId:'SITE-1',configVersion:1,
 configHash:'a'.repeat(64),issuedAt:'2026-10-20T00:00:00Z',approvedBy:'admin',devices:[]};
const state:GatewaySyncState={gatewayId:'11111111-1111-4111-8111-111111111111',lifecycleState:'configuring',configState:'failed',connectionState:'offline',
 desiredConfigVersion:1,desiredConfigHash:'a'.repeat(64),activeConfigVersion:0,activeConfigHash:null,desiredConfig:desired};

test('initial correction is available only before the first configuration becomes active',()=>{
 assert.equal(canCorrectInitialConfig(state),true);
 assert.equal(canCorrectInitialConfig({...state,configState:'pending_sync'}),true);
 assert.equal(canCorrectInitialConfig({...state,lifecycleState:'active',configState:'applied',activeConfigVersion:1}),false);
 assert.equal(canCorrectInitialConfig({...state,desiredConfig:null}),false);
});
test('correction request carries optimistic base identity and strictly parsed replacement devices',()=>{
 const draft=initialCorrectionDraft(state);
 assert.deepEqual(initialCorrectionRequest(draft,'[]'),{expectedBaseConfigVersion:1,expectedBaseConfigHash:'a'.repeat(64),devices:[]});
 assert.throws(()=>initialCorrectionRequest(draft,'{"not":"devices"}'),/array/i);
 assert.throws(()=>initialCorrectionDraft({...state,desiredConfigHash:null}),/unavailable/i);
});
test('polling cannot advance an open correction draft and a conflict requires an explicit reopen',()=>{
 const opened=initialCorrectionDraft({...state,desiredConfig:{...desired,devices:[]}});
 const polled={...state,desiredConfigVersion:2,desiredConfigHash:'b'.repeat(64),desiredConfig:{...desired,configVersion:2,configHash:'b'.repeat(64),devices:[{deviceId:'new'} as never]}};
 assert.deepEqual(initialCorrectionRequest(opened,opened.devicesJson),{expectedBaseConfigVersion:1,expectedBaseConfigHash:'a'.repeat(64),devices:[]});
 const reopened=initialCorrectionDraft(polled);
 assert.equal(reopened.expectedBaseConfigVersion,2);assert.match(reopened.devicesJson,/new/);
 assert.equal(isInitialCorrectionConflict({status:409}),true);assert.equal(isInitialCorrectionConflict(new Error('409')),false);
});

test('correction UI uses the existing dialog, textarea, alert and button components',()=>{
 const html=renderToStaticMarkup(<LocaleProvider initialLocale="en"><GatewayInitialConfigCorrection gatewayId={state.gatewayId} syncState={state} onCorrect={async()=>{}}/></LocaleProvider>);
 assert.match(html,/Correct initial configuration/);
 assert.doesNotMatch(html,/<textarea/,'closed shadcn dialog content is mounted by the dialog primitive, not a raw control here');
});

