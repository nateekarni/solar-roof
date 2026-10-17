export type AuditActionBadge = {
  label: string;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
  badgeClass?: string | undefined;
};

export const AUDIT_ACTIONS: Record<string, { th: string; en: string; variant: 'default' | 'destructive' | 'outline' | 'secondary'; badgeClass?: string | undefined }> = {
  'technical.employee.deactivated': {
    th: 'ระงับการใช้งานพนักงาน',
    en: 'Deactivate employee',
    variant: 'destructive',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
  },
  'technical.employee.created': {
    th: 'สร้างบัญชีพนักงาน',
    en: 'Create employee',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'technical.employee.reactivated': {
    th: 'คืนสิทธิ์การใช้งานพนักงาน',
    en: 'Reactivate employee',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'technical.employee.updated': {
    th: 'แก้ไขข้อมูลพนักงาน',
    en: 'Update employee',
    variant: 'outline',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  },
  'technical.position.created': {
    th: 'สร้างตำแหน่งงาน',
    en: 'Create position',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'technical.position.updated': {
    th: 'แก้ไขสิทธิ์ตำแหน่งงาน',
    en: 'Update position',
    variant: 'outline',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  },
  'technical.position.retired': {
    th: 'ยกเลิกตำแหน่งงาน',
    en: 'Retire position',
    variant: 'destructive',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
  },
  'business.employee.deactivated': {
    th: 'ระงับการใช้งานพนักงาน',
    en: 'Deactivate employee',
    variant: 'destructive',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
  },
  'business.employee.created': {
    th: 'สร้างบัญชีพนักงาน',
    en: 'Create employee',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'business.employee.reactivated': {
    th: 'คืนสิทธิ์การใช้งานพนักงาน',
    en: 'Reactivate employee',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'business.employee.updated': {
    th: 'แก้ไขข้อมูลพนักงาน',
    en: 'Update employee',
    variant: 'outline',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  },
  'business.position.created': {
    th: 'สร้างตำแหน่งงาน',
    en: 'Create position',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'business.position.updated': {
    th: 'แก้ไขสิทธิ์ตำแหน่งงาน',
    en: 'Update position',
    variant: 'outline',
    badgeClass: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-900',
  },
  'business.position.retired': {
    th: 'ยกเลิกตำแหน่งงาน',
    en: 'Retire position',
    variant: 'destructive',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
  },
  'user.invited': {
    th: 'เชิญผู้ใช้งานใหม่',
    en: 'Invite user',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'user.activated': {
    th: 'เปิดใช้งานบัญชี',
    en: 'Activate user',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'user.password_reset': {
    th: 'รีเซ็ตรหัสผ่าน',
    en: 'Reset password',
    variant: 'outline',
    badgeClass: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900',
  },
  'user.login': {
    th: 'เข้าสู่ระบบ',
    en: 'Login',
    variant: 'secondary',
    badgeClass: 'bg-muted text-muted-foreground',
  },
  'session.rotated': {
    th: 'หมุนเวียนเซสชันความปลอดภัย',
    en: 'Rotate session',
    variant: 'secondary',
  },
  'session.revoked': {
    th: 'เพิกถอนเซสชัน',
    en: 'Revoke session',
    variant: 'destructive',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
  },
  'site.customer_user.updated': {
    th: 'แก้ไขผู้ใช้ประจำไซต์',
    en: 'Update site user',
    variant: 'outline',
  },
  'site.customer_user.invite_cancelled': {
    th: 'ยกเลิกคำเชิญผู้ใช้ไซต์',
    en: 'Cancel site user invite',
    variant: 'destructive',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
  },
  'site.customer_user.revoked': {
    th: 'ยกเลิกสิทธิ์ผู้ใช้ประจำไซต์',
    en: 'Revoke site user',
    variant: 'destructive',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
  },
  'site.customer_user.seeded': {
    th: 'สร้างผู้ใช้ประจำไซต์ตั้งต้น',
    en: 'Seed site user',
    variant: 'secondary',
  },
  'company.profile.updated': {
    th: 'แก้ไขข้อมูลบริษัท',
    en: 'Update company profile',
    variant: 'outline',
  },
  'company.bank.created': {
    th: 'เพิ่มบัญชีธนาคาร',
    en: 'Add bank account',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
  'company.bank.updated': {
    th: 'แก้ไขบัญชีธนาคาร',
    en: 'Update bank account',
    variant: 'outline',
  },
  'company.bank.deleted': {
    th: 'ลบบัญชีธนาคาร',
    en: 'Delete bank account',
    variant: 'destructive',
    badgeClass: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900',
  },
  'finance.cutover_started': {
    th: 'เริ่มระบบตัดรอบบิลจริง',
    en: 'Start billing cutover',
    variant: 'default',
  },
  'finance.readiness_approved': {
    th: 'อนุมัติความพร้อมทางการเงิน',
    en: 'Approve financial readiness',
    variant: 'default',
    badgeClass: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900',
  },
};

export const AUDIT_ENTITY_TYPES: Record<string, { th: string; en: string }> = {
  employee_permission: { th: 'สิทธิ์พนักงาน', en: 'Employee permission' },
  user: { th: 'ผู้ใช้งาน', en: 'User' },
  site: { th: 'ไซต์งาน', en: 'Site' },
  gateway: { th: 'เกตเวย์', en: 'Gateway' },
  device: { th: 'อุปกรณ์', en: 'Device' },
  auth_session: { th: 'เซสชัน', en: 'Session' },
  settings: { th: 'การตั้งค่าระบบ', en: 'Settings' },
  company_profile: { th: 'ข้อมูลบริษัท', en: 'Company profile' },
  company_bank_account: { th: 'บัญชีธนาคาร', en: 'Bank account' },
  financial_readiness_approval: { th: 'ความพร้อมทางการเงิน', en: 'Financial readiness' },
  billing: { th: 'รอบบิล', en: 'Billing' },
  billing_cycle: { th: 'รอบบิล', en: 'Billing cycle' },
  payment: { th: 'การชำระเงิน', en: 'Payment' },
  contract: { th: 'สัญญา', en: 'Contract' },
  document: { th: 'เอกสาร', en: 'Document' },
};

export function formatAuditAction(action: string, locale: 'th' | 'en' = 'th'): AuditActionBadge {
  const match = AUDIT_ACTIONS[action];
  if (match) {
    return {
      label: match[locale] || match.th,
      variant: match.variant,
      badgeClass: match.badgeClass,
    };
  }

  // Fallback for custom or nested actions: e.g. domain.entity.verb
  const parts = action.split('.');
  const verb = parts[parts.length - 1] || action;
  const isDestructive = ['deactivated', 'deleted', 'revoked', 'retired', 'cancelled'].includes(verb);
  const isSuccess = ['created', 'activated', 'approved', 'invited'].includes(verb);

  // Friendly human readable label
  const readable = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  return {
    label: readable,
    variant: isDestructive ? 'destructive' : isSuccess ? 'default' : 'secondary',
    badgeClass: isDestructive
      ? 'bg-red-500/10 text-red-700 dark:text-red-400'
      : isSuccess
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : undefined,
  };
}

export function formatAuditEntityType(entityType: string, locale: 'th' | 'en' = 'th'): string {
  const match = AUDIT_ENTITY_TYPES[entityType];
  if (match) return match[locale] || match.th;
  return entityType;
}

export function formatAuditActor(actor: string, locale: 'th' | 'en' = 'th'): string {
  if (actor === 'Platform Administrator') {
    return locale === 'th' ? 'ผู้ดูแลระบบแพลตฟอร์ม' : 'Platform Administrator';
  }
  return actor;
}
