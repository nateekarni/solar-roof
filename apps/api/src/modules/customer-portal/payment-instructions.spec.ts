import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { DashboardService } from '../dashboard/dashboard.service.js';
import { SettingsService, type CompanyBankAccount } from '../settings/settings.service.js';
import { CustomerPortalService } from './customer-portal.service.js';

const customer = {id: 'customer-user', role: 'customer_user'};
const bank: CompanyBankAccount = {
  id: 'default-bank', bankName: 'Example Bank', bankCode: 'EX', accountName: 'Solar Roof',
  accountNumber: '123-4-56789-0', branchName: 'Head Office', promptpayId: '0100000000000',
  qrCodeUrl: '/assets/qr.png', isDefault: true, isConfigured: true,
  createdAt: '2026-01-01', updatedAt: '2026-01-02',
};

function service(accounts: CompanyBankAccount[]) {
  // Keep the real SettingsService read mapping; replace only the external database.
  const db = {query: async () => ({rows: accounts})} as unknown as DatabaseService;
  return new CustomerPortalService(db, {} as DashboardService, new SettingsService(db));
}

test('payment instructions expose only display fields from the configured default', async () => {
  const value = await service([
    {...bank, id: 'other', isDefault: false, accountNumber: 'private-other'},
    {...bank, id: 'unconfigured', isConfigured: false, accountNumber: 'private-unconfigured'},
    bank,
  ]).paymentInstructions(customer);
  assert.deepEqual(value, {
    available: true, bankName: 'Example Bank', bankCode: 'EX', accountName: 'Solar Roof',
    accountNumber: '123-4-56789-0', branchName: 'Head Office', promptpayId: '0100000000000',
    qrCodeUrl: '/assets/qr.png',
  });
});

test('payment instructions are unavailable without a configured default', async () => {
  for (const accounts of [[], [{...bank, isDefault: false}], [{...bank, isConfigured: false}]]) {
    assert.deepEqual(await service(accounts).paymentInstructions(customer), {available: false});
  }
});

test('payment instructions reject missing identity and non-customer principals', async () => {
  for (const user of [undefined, {role: 'customer_user'}, ...['owner','admin','operator','accountant'].map(role => ({id: 'staff', role}))]) {
    await assert.rejects(() => service([bank]).paymentInstructions(user), ForbiddenException);
  }
});
