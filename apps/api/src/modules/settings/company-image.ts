import { BadRequestException } from '@nestjs/common';

export interface CompanyImage {
  bytes: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  dataUri: string;
}

/** Empty means removal. Legacy paths are readable by consumers, never writable. */
export function decodeCompanyImage(value: string, purpose: string): CompanyImage | null {
  if (value === '') return null;
  const invalid = () => new BadRequestException(`${purpose} must be a PNG/JPEG image up to 1 MB`);
  if (typeof value !== 'string') throw invalid();
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2]!.length > 1_398_104 || match[2]!.length % 4 !== 0) throw invalid();
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length > 1_048_576 || bytes.toString('base64') !== match[2]) throw invalid();
  const signature = match[1] === 'png' ? Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]) : Buffer.from([0xff,0xd8,0xff]);
  if (!bytes.subarray(0, signature.length).equals(signature)) throw invalid();
  const mimeType = match[1] === 'png' ? 'image/png' : 'image/jpeg';
  return { bytes, mimeType, dataUri: `data:${mimeType};base64,${bytes.toString('base64')}` };
}
