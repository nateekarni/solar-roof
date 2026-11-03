import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import * as preview from './original-document-preview';
const content=(props:any)=>(preview as any).OriginalPdfContent(props);
for(const th of [true,false])test(`verified PDF iframe, download and print share one blob URL in ${th?'TH':'EN'}`,()=>{
 const html=renderToStaticMarkup(content({url:'blob:original',error:false,number:'PPA-1',th}));
 assert.match(html,/download="PPA-1.pdf"/);assert.match(html,/src="blob:original"/);
 assert.equal((html.match(/href="blob:original"/g)||[]).length,2);assert.doesNotMatch(html,/HTML|\.html/);
});
test('loading and integrity failure expose no export, print or send control',()=>{
 for(const error of [false,true]){
  const html=renderToStaticMarkup(content({url:'',error,number:'INV-1',th:false,onSend:()=>{}}));
  assert.match(html,error?/role="alert"/:/role="status"/);assert.doesNotMatch(html,/<a|<iframe|<button/);
 }
});
test('absent contract recipient leaves the verified PDF usable with actionable send explanation',()=>{
 const html=renderToStaticMarkup(content({url:'blob:original',error:false,number:'PPA-1',th:false,deliveryUnavailable:true}));
 assert.match(html,/Download PDF/);assert.match(html,/recipient/i);assert.doesNotMatch(html,/Send original/);
});
test('verified statement viewer exposes its version-linked production form slot',()=>{
 const html=renderToStaticMarkup(content({url:'blob:original',error:false,number:'INV-1',th:false,attachments:[{kind:'production_form',status:'awaiting_file',documentId:'11111111-1111-4111-8111-111111111111',documentRevision:2,templateVersion:'sarabun-a4-v12'}]}));
 assert.match(html,/Production form attachment/);
 assert.match(html,/Awaiting supplied form/);
 assert.match(html,/Revision 2/);
 assert.match(html,/sarabun-a4-v12/);
});
