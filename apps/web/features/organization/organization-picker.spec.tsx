import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrganizationPicker } from './organization-picker';
import { OrganizationIdentityFields } from './organization-edit-dialog';
test('selected existing organization shows its code read-only and warns when tax identity is incomplete',()=>{
 const organization={id:'a',name:'Customer',code:'ORG-A'};
 const html=renderToStaticMarkup(<OrganizationPicker organizations={[organization]} value={{kind:'existing',organization}} onChange={()=>{}} onRecordUpdated={()=>{}} locale="en" canEdit />);
 assert.match(html,/role="combobox"/); assert.match(html,/value="ORG-A"/); assert.match(html,/readOnly/); assert.match(html,/Incomplete document identity/);
});
test('new organization code stays editable before saving the site',()=>{
 const html=renderToStaticMarkup(<OrganizationPicker organizations={[]} value={{kind:'new',organization:{name:'New',code:'ORG-NEW'}}} onChange={()=>{}} onRecordUpdated={()=>{}} locale="en" canEdit />);
 assert.match(html,/value="ORG-NEW"/); assert.doesNotMatch(html,/readOnly/); assert.match(html,/Created when the site is saved/);
});
test('master identity editor exposes separate display, legal, tax and contact fields',()=>{
 const html=renderToStaticMarkup(<OrganizationIdentityFields value={{name:'Customer',code:'ORG-A'}} onChange={()=>{}} locale="en" />);
 for(const label of ['Display name','Organization code','Legal name','Tax ID','Tax branch','Billing address','Contact name','Phone','Document email'])assert.match(html,new RegExp(label));
 assert.equal((html.match(/<input/g)??[]).length,8); assert.equal((html.match(/<textarea/g)??[]).length,1);
});

