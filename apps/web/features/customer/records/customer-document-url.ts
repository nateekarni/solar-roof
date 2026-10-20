// Only this module creates trusted blob destinations. Persisted blob/data URLs
// never pass directly to an anchor, image or PDF renderer.
const localBlobs = new Set<string>();
export function createCustomerDocumentBlobUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  localBlobs.add(url);
  return url;
}
export function revokeCustomerDocumentBlobUrl(url: string): void {
  localBlobs.delete(url);
  URL.revokeObjectURL(url);
}
export function safeCustomerDocumentUrl(
  value: string,
  origin = typeof window === "undefined" ? undefined : window.location.origin,
  apiOrigin = process.env.NEXT_PUBLIC_API_URL,
): string | null {
  if (localBlobs.has(value)) return value;
  if (!value || /[\\\u0000-\u0020\u007f]/.test(value) || value.startsWith("//"))
    return null;
  try {
    const url = new URL(value, origin);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const approved = new Set<string>();
    if (origin) approved.add(new URL(origin).origin);
    if (apiOrigin) {
      const api = new URL(apiOrigin, origin);
      if (["http:", "https:"].includes(api.protocol)) approved.add(api.origin);
    }
    return approved.has(url.origin) ? url.href : null;
  } catch {
    return null;
  }
}
/** Existing uploads are stored as FileReader data URLs. Decode only the three
 * supported file types, validate their signatures and display a local blob. */
export function customerEvidenceBlob(value: string): Blob | null {
  if (value.length > 14_000_000) return null;
  const match =
    /^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(
      value,
    );
  if (!match || match[2]!.length % 4 !== 0) return null;
  try {
    const bytes = Uint8Array.from(atob(match[2]!), (c) => c.charCodeAt(0));
    if (bytes.length > 10 * 1024 * 1024) return null;
    const mime = match[1]!.toLowerCase();
    const signature =
      mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10]
        : mime === "image/jpeg"
          ? [255, 216, 255]
          : [37, 80, 68, 70, 45];
    if (!signature.every((byte, index) => bytes[index] === byte)) return null;
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}
