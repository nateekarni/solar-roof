import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAuditAction,
  formatAuditEntityType,
  formatAuditActor,
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from './audit-wording';

test('formatAuditAction maps technical employee actions to human-friendly Thai badges', () => {
  const deact = formatAuditAction('technical.employee.deactivated', 'th');
  assert.equal(deact.label, 'ระงับการใช้งานพนักงาน');
  assert.equal(deact.variant, 'destructive');

  const created = formatAuditAction('technical.employee.created', 'th');
  assert.equal(created.label, 'สร้างบัญชีพนักงาน');
  assert.equal(created.variant, 'default');

  const reactivated = formatAuditAction('technical.employee.reactivated', 'th');
  assert.equal(reactivated.label, 'คืนสิทธิ์การใช้งานพนักงาน');
  assert.equal(reactivated.variant, 'default');

  const updated = formatAuditAction('technical.employee.updated', 'th');
  assert.equal(updated.label, 'แก้ไขข้อมูลพนักงาน');
  assert.equal(updated.variant, 'outline');
});

test('formatAuditAction maps business, user, and session actions properly', () => {
  const login = formatAuditAction('user.login', 'th');
  assert.equal(login.label, 'เข้าสู่ระบบ');

  const invite = formatAuditAction('user.invited', 'th');
  assert.equal(invite.label, 'เชิญผู้ใช้งานใหม่');

  const reset = formatAuditAction('user.password_reset', 'th');
  assert.equal(reset.label, 'รีเซ็ตรหัสผ่าน');

  const bank = formatAuditAction('company.bank.created', 'th');
  assert.equal(bank.label, 'เพิ่มบัญชีธนาคาร');
});

test('formatAuditAction handles unknown actions gracefully with formatted text', () => {
  const custom = formatAuditAction('custom.security.revoked', 'th');
  assert.equal(custom.label, 'Custom Security Revoked');
  assert.equal(custom.variant, 'destructive');
});

test('formatAuditEntityType maps raw entities to clear Thai labels', () => {
  assert.equal(formatAuditEntityType('employee_permission', 'th'), 'สิทธิ์พนักงาน');
  assert.equal(formatAuditEntityType('user', 'th'), 'ผู้ใช้งาน');
  assert.equal(formatAuditEntityType('site', 'th'), 'ไซต์งาน');
  assert.equal(formatAuditEntityType('billing_cycle', 'th'), 'รอบบิล');
  assert.equal(formatAuditEntityType('company_profile', 'th'), 'ข้อมูลบริษัท');
  assert.equal(formatAuditEntityType('unknown_entity', 'th'), 'unknown_entity');
});

test('formatAuditActor formats Platform Administrator to Thai when locale is th', () => {
  assert.equal(formatAuditActor('Platform Administrator', 'th'), 'ผู้ดูแลระบบแพลตฟอร์ม');
  assert.equal(formatAuditActor('Platform Administrator', 'en'), 'Platform Administrator');
  assert.equal(formatAuditActor('Somchai Prasert', 'th'), 'Somchai Prasert');
});
