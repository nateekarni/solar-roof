import assert from 'node:assert/strict';
import test from 'node:test';
import { SettingsService } from './settings.service.js';
import { settingsDatabase, testCompany } from './company-settings.test-fixtures.js';
test('company settings exposes identity and logo without legacy signer fields', async () => {
  const response = await new SettingsService(settingsDatabase().db).getCompanyProfile();
  assert.equal(response.companyName, 'Issuer');
  assert.equal(response.logoUrl, '');
  for (const key of ['signatoryName', 'signatoryTitle', 'signatureDataUri']) {
    assert.equal(key in response, false, `${key} must not be exposed by company settings`);
  }
});

test('empty company settings does not expose legacy signer defaults', async () => {
  const {id: _id, ...emptyCompany} = testCompany;
  const response = await new SettingsService(settingsDatabase(emptyCompany).db).getCompanyProfile();
  assert.equal(response.companyName, '');
  for (const key of ['signatoryName', 'signatoryTitle', 'signatureDataUri']) assert.equal(key in response, false);
});

test('legacy signer input cannot overwrite stored historical company identity', async () => {
  const fixture = settingsDatabase({...testCompany, signatureDataUri: 'historical signature'});
  const input = {companyName: 'Updated issuer', signatoryName: 'New signer', signatoryTitle: 'New title', signatureDataUri: ''};
  const response = await new SettingsService(fixture.db).updateCompanyProfile(input, 'owner-a');
  assert.equal(response.companyName, 'Updated issuer');
  assert.equal(fixture.state.company.signatoryName, 'Director');
  assert.equal(fixture.state.company.signatoryTitle, 'Owner');
  assert.equal(fixture.state.company.signatureDataUri, 'historical signature');
  for (const key of ['signatoryName', 'signatoryTitle', 'signatureDataUri']) assert.equal(key in response, false);
});

test('company logo upload is persisted, preserved on unrelated edits and removable', async () => {
  const service = new SettingsService(settingsDatabase().db);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  assert.equal((await service.updateCompanyProfile({logoUrl: image}, 'owner-a')).logoUrl, image);
  assert.equal((await service.updateCompanyProfile({companyName: 'Updated'}, 'owner-a')).logoUrl, image);
  assert.equal((await service.updateCompanyProfile({logoUrl: ''}, 'owner-a')).logoUrl, '');
});
