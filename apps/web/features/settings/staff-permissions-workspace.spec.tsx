import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import * as workspace from './staff-permissions-workspace';
import * as model from './staff-permissions-model';
test('site scope table filters rows without losing selected sites outside the search',()=>{
 assert.equal(typeof workspace.SiteScopeTable,'function');
 const html=renderToStaticMarkup(<workspace.SiteScopeTable sites={[{id:'a',name:'Alpha'},{id:'b',name:'Beta'}]} scope={{mode:'selected',siteIds:['b']}} search=" BETA " onSearch={()=>{}} onChange={()=>{}}/>);
 assert.match(html,/<table/);assert.match(html,/Beta/);assert.doesNotMatch(html,/>Alpha</);assert.match(html,/checked=""/);
});
test('dirty staff drafts compare scope membership and inherited rules semantically',()=>{
 assert.equal(typeof model.staffDraftChanged,'function');
 const initial={positionId:'p',overrides:{'business.sites.view':true},scope:{mode:'selected' as const,siteIds:['a','b']}};
 assert.equal(model.staffDraftChanged(initial,{...initial,scope:{mode:'selected',siteIds:['b','a']}}),false);
 assert.equal(model.staffDraftChanged(initial,{...initial,overrides:{'business.sites.view':false}}),true);
 assert.equal(model.staffDraftChanged(initial,{...initial,scope:{mode:'all',siteIds:['a','b']}}),true);
});
test('invitation dismissal blocks in-flight requests and honors unsaved-work confirmation',()=>{
 assert.equal(typeof model.canDismissStaffDialog,'function');let prompts=0;
 const decline=()=>{prompts++;return false;};
 assert.equal(model.canDismissStaffDialog(true,true,decline),false);assert.equal(prompts,0);
 assert.equal(model.canDismissStaffDialog(false,true,decline),false);assert.equal(prompts,1);
 assert.equal(model.canDismissStaffDialog(false,true,()=>true),true);
 assert.equal(model.canDismissStaffDialog(false,false,decline),true);assert.equal(prompts,1);
});
test('staff status labels localize every employee lifecycle state',()=>{
 assert.equal(typeof model.staffStatusLabel,'function');
 assert.equal(model.staffStatusLabel('active','th'),'ใช้งาน');
 assert.equal(model.staffStatusLabel('inactive','th'),'ยกเลิกแล้ว');
 assert.equal(model.staffStatusLabel('pending','th'),'รอยืนยัน');
 assert.equal(model.staffStatusLabel('invited','th'),'เชิญแล้ว');
 assert.equal(model.staffStatusLabel('cancelled','th'),'ยกเลิกแล้ว');
 assert.equal(model.staffStatusLabel('expired','th'),'คำเชิญหมดอายุ');
 assert.equal(model.staffStatusLabel('inactive','en'),'Inactive');
 assert.equal(model.staffStatusLabel('cancelled','en'),'Cancelled');
 assert.equal(model.staffStatusLabel('expired','en'),'Expired');
 assert.equal(model.staffStatusLabel('new-status','en'),'new-status');
});

test('staff position filters include canonical manager assignments without grants',()=>{
 const manager={displayName:'Owner',email:'owner@example.test',status:'active',companyPositionId:'director',grant:null};
 assert.deepEqual(model.filterEmployees([manager],'','all','director'),[manager]);
 assert.deepEqual(model.filterEmployees([manager],'','all','unassigned'),[]);
 assert.deepEqual(model.filterPositions([{id:'director',name:'Director'}],[manager],'','assigned'),[{id:'director',name:'Director'}]);
});
