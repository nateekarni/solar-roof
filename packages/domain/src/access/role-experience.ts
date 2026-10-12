/** Shared destinations for verified roles; matching preserves route segment boundaries. */
export function isBusinessRole(role: string): boolean {
  return role === 'owner' || role === 'customer_user';
}
export function canVisitPage(role: string, rawPath: string): boolean {
  if (!['owner','admin','operator','accountant','customer_user'].includes(role)) return false;
  const path = rawPath.split(/[?#]/)[0]!.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/')) return false;
  if(/^\/(?:reports|history|jobs)(?:\/|$)/.test(path)||/^\/records\/(?:reports|history|jobs)(?:\/|$)/.test(path))return false;
  if (role === 'admin' && (/^\/(?:sites|customers|contracts|billing|receipts)(?:\/|$)/.test(path) || /^\/records\/(?:sites|customers|contracts|billing|invoices|receipts|documents)(?:\/|$)/.test(path) || path === '/settings/company')) return false;
  if (path === '/settings/rates') return role === 'owner' || role === 'accountant';
  if (role === 'owner' && /^\/(?:customers|sites)(?:\/|$)/.test(path)) return true;
  if (role === 'owner' && /^\/records\/sites(?:\/|$)/.test(path)) return true;
  if (!isBusinessRole(role)) return true;
  if (['/','/settings','/settings/account','/settings/general','/settings/security'].includes(path)) return true;
  if (role === 'owner' && path === '/settings/company') return true;
  if (role === 'owner' && ['/settings/system','/settings/users','/settings/audit'].includes(path)) return true;
  if (role === 'customer_user' && path === '/production') return true;
  return /^\/(?:contracts|billing|receipts)(?:\/|$)/.test(path)
    || /^\/records\/(?:contracts|billing|invoices|receipts|documents)(?:\/|$)/.test(path);
}
