import {
  createCustomerDocumentBlobUrl,
  revokeCustomerDocumentBlobUrl,
  safeCustomerDocumentUrl,
} from "../records/customer-document-url";
import QRCode from "qrcode";

const MAX_QR_BYTES = 4 * 1024 * 1024;
const MAX_QR_SIDE = 4096;
export interface ResolvedCustomerQr {
  url: string;
  dispose: () => void;
}

export function renderPromptPayQrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#111111", light: "#ffffff" },
  });
}
function boundedJpegDimensions(bytes: Uint8Array): boolean {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 255) return false;
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218 || marker === undefined) return false;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    const length = bytes[offset]! * 256 + bytes[offset + 1]!;
    if (length < 2 || offset + length > bytes.length) return false;
    if (
      [
        192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
      ].includes(marker)
    ) {
      if (length < 8) return false;
      const height = bytes[offset + 3]! * 256 + bytes[offset + 4]!;
      const width = bytes[offset + 5]! * 256 + bytes[offset + 6]!;
      return (
        width > 0 && height > 0 && width <= MAX_QR_SIDE && height <= MAX_QR_SIDE
      );
    }
    offset += length;
  }
  return false;
}

/** Settings stores FileReader PNG/JPEG data. This gate bounds decoding and
 * checks the declared format; the resolver also requires a real image decode. */
export function customerQrImageBlob(value: string): Blob | null {
  if (value.length > Math.ceil(MAX_QR_BYTES / 3) * 4 + 64) return null;
  const match =
    /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2]!.length % 4 !== 0) return null;
  try {
    const decoded = atob(match[2]!);
    if (decoded.length > MAX_QR_BYTES || btoa(decoded) !== match[2])
      return null;
    const bytes = Uint8Array.from(decoded, (character) =>
      character.charCodeAt(0),
    );
    const png = match[1] === "image/png";
    const signature = png ? [137, 80, 78, 71, 13, 10, 26, 10] : [255, 216, 255];
    if (!signature.every((byte, index) => bytes[index] === byte)) return null;
    if (png) {
      if (
        bytes.length < 45 ||
        ![0, 0, 0, 13, 73, 72, 68, 82].every(
          (byte, index) => bytes[index + 8] === byte,
        )
      )
        return null;
      const header = new DataView(bytes.buffer);
      const width = header.getUint32(16),
        height = header.getUint32(20);
      if (!width || !height || width > MAX_QR_SIDE || height > MAX_QR_SIDE)
        return null;
      if (
        ![0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130].every(
          (byte, index) => bytes[bytes.length - 12 + index] === byte,
        )
      )
        return null;
    } else if (
      bytes.length < 6 ||
      bytes[bytes.length - 2] !== 255 ||
      bytes[bytes.length - 1] !== 217 ||
      !boundedJpegDimensions(bytes)
    )
      return null;
    return new Blob([bytes], { type: match[1]! });
  } catch {
    return null;
  }
}

export async function resolveCustomerQrImage(
  value: string,
  origin?: string,
  apiOrigin?: string,
): Promise<ResolvedCustomerQr | null> {
  if (!value.startsWith("data:")) {
    const url = safeCustomerDocumentUrl(value, origin, apiOrigin);
    return url && /^https?:/.test(url) ? { url, dispose: () => {} } : null;
  }
  const blob = customerQrImageBlob(value);
  if (!blob || typeof createImageBitmap !== "function") return null;
  try {
    const image = await createImageBitmap(blob);
    const valid =
      image.width > 0 &&
      image.height > 0 &&
      image.width <= MAX_QR_SIDE &&
      image.height <= MAX_QR_SIDE;
    image.close();
    if (!valid) return null;
    const url = createCustomerDocumentBlobUrl(blob);
    let disposed = false;
    return {
      url,
      dispose: () => {
        if (!disposed) {
          disposed = true;
          revokeCustomerDocumentBlobUrl(url);
        }
      },
    };
  } catch {
    return null;
  }
}
