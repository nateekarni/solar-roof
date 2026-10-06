/** Shared destinations for verified roles; matching preserves route segment boundaries. */
export function isBusinessRole(role: string): boolean {
  return role === 'owner' || role === 'school_user';
}
export function canVisitPage(role: string, rawPath: string): boolean {
  if (!['owner','admin','operator','accountant','school_user'].includes(role)) return false;
  const path = rawPath.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/')) return false;
  if (!isBusinessRole(role)) return true;
  if (['/','/settings','/settings/account','/settings/general','/settings/security'].includes(path)) return true;
  if (role === 'owner' && path === '/settings/company') return true;
  if (role === 'school_user' && path === '/production') return true;
  return /^\/(?:contracts|billing|receipts)(?:\/|$)/.test(path)
    || /^\/records\/(?:contracts|billing|invoices|receipts|documents)(?:\/|$)/.test(path);
}
