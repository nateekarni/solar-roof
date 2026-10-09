import assert from 'node:assert/strict';
import test from 'node:test';
import { organizationOptionIndex, selectOrganizationText, organizationSitePayload, filterOrganizations, organizationDocumentComplete, contractOrganizationDefaults } from './organization-selection';
const customer={id:'customer-a',name:'Acme Solar',code:'ORG-ACME',legalName:'Acme Limited',taxId:'1234567890123',taxBranch:'00000',taxAddress:'Bangkok',contactName:'Contact',phone:'020001111',documentEmail:'billing@example.com'};
test('organization search matches name or code without hiding the selected identity',()=>{
 assert.deepEqual(filterOrganizations([customer],'org-ac'),[customer]);
 assert.deepEqual(filterOrganizations([customer],'SOLAR'),[customer]);
 assert.deepEqual(filterOrganizations([customer],'missing'),[]);
});
test('typing a different customer drops the selected ID and creates a draft only',()=>{
 const result=selectOrganizationText([customer],'New customer','ORG-NEW');
 assert.deepEqual(organizationSitePayload(result),{newOrganization:{name:'New customer',code:'ORG-NEW'}});
 assert.deepEqual(organizationSitePayload(selectOrganizationText([customer],' acme solar ','ORG-NEW')),{schoolId:'customer-a'});
 assert.equal(organizationSitePayload(null),null);
});
test('an ambiguous display name requires selecting the exact organization row',()=>{
 const result=selectOrganizationText([customer,{...customer,id:'customer-b',code:'ORG-B'}],'Acme Solar','ORG-NEW');
 assert.equal(result?.kind,'new'); // API rejects name collisions; never chooses a different customer silently.
});
test('document completeness requires legal name, tax ID and billing address while site save accepts an incomplete draft',()=>{
 assert.equal(organizationDocumentComplete(customer),true);
 assert.equal(organizationDocumentComplete({...customer,taxId:''}),false);
 assert.deepEqual(organizationSitePayload({kind:'new',organization:{name:'Setup only',code:'ORG-SETUP'}}),{newOrganization:{name:'Setup only',code:'ORG-SETUP'}});
});
test('contract defaults are copied as editable values and do not modify saved snapshots',()=>{
 const saved={companyName:'Old legal name',taxId:'9999999999999',taxAddress:'Old address'};
 const defaults=contractOrganizationDefaults(customer);
 assert.deepEqual(defaults,{companyName:'Acme Limited',taxId:'1234567890123',branch:'00000',taxAddress:'Bangkok',billingPhone:'020001111',billingEmail:'billing@example.com'});
 defaults.companyName='Contract override';
 assert.equal(customer.legalName,'Acme Limited'); assert.equal(saved.companyName,'Old legal name');
});


test('keyboard organization selection starts at first or last row and wraps without skipping an option',()=>{
 assert.equal(organizationOptionIndex(-1,3,'down'),0);
 assert.equal(organizationOptionIndex(-1,3,'up'),2);
 assert.equal(organizationOptionIndex(2,3,'down'),0);
 assert.equal(organizationOptionIndex(0,3,'up'),2);
 assert.equal(organizationOptionIndex(-1,0,'down'),-1);
});
test('new customer defaults to a blank code for server allocation and retains manually entered case',()=>{assert.deepEqual(organizationSitePayload(selectOrganizationText([],'New customer')),{newOrganization:{name:'New customer',code:''}});assert.deepEqual(organizationSitePayload(selectOrganizationText([],'New customer','Org-Custom')),{newOrganization:{name:'New customer',code:'Org-Custom'}});});
