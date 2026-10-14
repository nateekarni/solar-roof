import {BadRequestException, Body, Controller, Inject, Put, Req, UnauthorizedException} from '@nestjs/common';
import type {Request} from 'express';
import {DatabaseService} from '../../database/database.service.js';
import {normalizeDocumentSignature} from './document-signature-image.js';

@Controller('v1/me')
export class PersonalSignatureController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Put('signature')
  async save(@Req() req: Request & {user?: {id: string}}, @Body() body: unknown) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'image')) {
      throw new BadRequestException('Invalid signature fields');
    }
    const image = (body as {image?: unknown}).image;
    const value = image === null ? null : await normalizeDocumentSignature(image);
    const result = await this.db.query('UPDATE users SET signature_data=$1,updated_at=NOW() WHERE id=$2 RETURNING id', [value, req.user.id]);
    if (!result.rows.length) throw new UnauthorizedException('User not found');
    return {hasSignature: Boolean(value), ...(value ? {signatureDataUri: value} : {})};
  }
}
