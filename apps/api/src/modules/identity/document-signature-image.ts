import {BadRequestException} from '@nestjs/common';
import sharp from 'sharp';

export async function normalizeDocumentSignature(input: unknown): Promise<string> {
  try {
    if (typeof input !== 'string' || input.length > 350_000) throw new Error();
    const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(input);
    if (!match) throw new Error();
    const bytes = Buffer.from(match[2]!, 'base64');
    if (!bytes.length || bytes.length > 256 * 1024 || bytes.toString('base64') !== match[2]) throw new Error();
    const image = sharp(bytes, {limitInputPixels: 1600 * 800, failOn: 'warning'});
    const meta = await image.metadata();
    if (meta.format !== match[1] || !['png', 'jpeg'].includes(meta.format ?? '') || (meta.pages ?? 1) !== 1) throw new Error();
    if (meta.format === 'png') {
      // libvips decodes only APNG's first frame, so metadata.pages cannot detect it.
      for (let offset = 8; offset + 12 <= bytes.length;) {
        const length = bytes.readUInt32BE(offset);
        if (length > bytes.length - offset - 12) throw new Error();
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') throw new Error();
        offset += length + 12;
      }
    }
    // Decode pixels as well as metadata so truncated image data cannot reach documents.
    await image.stats();
    return `data:image/${meta.format};base64,${bytes.toString('base64')}`;
  } catch {
    throw new BadRequestException('ลายเซ็นต้องเป็นไฟล์ PNG หรือ JPEG ภาพเดียว ขนาดไม่เกิน 256 KiB และ 1,280,000 พิกเซล');
  }
}
