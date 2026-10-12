import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PaymentHistory} from './payment-history';
test('unverified transfer history shows unknown amount instead of bill or zero',()=>{
 const html=renderToStaticMarkup(<PaymentHistory locale="en" payments={[{id:'evidence',amount:null,status:'pending_verification'}]}/>);
 assert.match(html,/Awaiting amount verification/);assert.doesNotMatch(html,/฿0\.00|Rejection applies to all/);
});
