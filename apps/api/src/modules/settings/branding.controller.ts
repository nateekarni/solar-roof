import { Controller, Get, Headers, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Public } from '../identity/public.decorator.js';
import { SettingsService } from './settings.service.js';
import { decodeCompanyImage, type CompanyImage } from './company-image.js';

@Controller()
export class BrandingController {
  constructor(@Inject(SettingsService) private readonly settings: SettingsService) {}

  @Public()
  @Get('v1/public/branding/logo')
  async logo(@Headers('if-none-match') ifNoneMatch: string | undefined, @Res() response: Response) {
    const profile = await this.settings.getCompanyProfile();
    let image: CompanyImage | null = null;
    try { image = decodeCompanyImage(profile.logoUrl ?? '', 'Logo'); } catch { /* Existing invalid/legacy values use the bundled mark. */ }
    const bytes = image?.bytes ?? await readFile(new URL('../../../../web/public/brand/solar-roof-mark.png', import.meta.url));
    const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`;
    response.setHeader('Content-Type', image?.mimeType ?? 'image/png');
    response.setHeader('ETag', etag);
    response.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    if (ifNoneMatch?.split(',').some(value => value.trim().replace(/^W\//, '') === etag || value.trim() === '*')) {
      response.status(304).end();
      return;
    }
    response.send(bytes);
  }
}
