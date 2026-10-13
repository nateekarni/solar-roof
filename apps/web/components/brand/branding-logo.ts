const revisionKey = 'company-branding-revision';
let revision = 0;
const listeners = new Set<() => void>();

export function brandingLogoSrc(value: number): string {
  const path = `${process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, '') ?? ''}/v1/public/branding/logo`;
  return value > 0 ? `${path}?revision=${value}` : path;
}

function savedRevision(): number {
  try {
    const value = Number(window.localStorage.getItem(revisionKey));
    return Number.isSafeInteger(value) && value > 0 ? value : 0;
  } catch { return 0; }
}

function updated() {
  revision = Math.max(Date.now(), revision + 1, savedRevision() + 1);
  try { window.localStorage.setItem(revisionKey, String(revision)); } catch { /* Storage is optional. */ }
  listeners.forEach(listener => listener());
}

function storageUpdated(event: StorageEvent) {
  if (event.key !== revisionKey) return;
  revision = Math.max(revision, savedRevision());
  listeners.forEach(listener => listener());
}

export function getBrandingRevision() { return revision; }

export function subscribeBranding(listener: () => void) {
  if (listeners.size === 0) {
    revision = Math.max(revision, savedRevision());
    window.addEventListener('company-branding-updated', updated);
    window.addEventListener('storage', storageUpdated);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener('company-branding-updated', updated);
      window.removeEventListener('storage', storageUpdated);
    }
  };
}

export function companyBrandingUpdated() {
  // Persist even when no mark is mounted (for example during navigation).
  if (listeners.size === 0) updated();
  window.dispatchEvent(new Event('company-branding-updated'));
}
