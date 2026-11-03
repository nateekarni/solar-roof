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
    const result = await this.db.query(`WITH prior AS MATERIALIZED (
      SELECT u.id,(u.signature_data IS NOT NULL) AS has_signature,u.customer_id,
        coalesce((SELECT jsonb_agg(a.site_id ORDER BY a.site_id) FROM site_account_assignments a WHERE a.user_id=u.id AND a.revoked_at IS NULL),'[]'::jsonb) AS site_ids
      FROM users u WHERE u.id=$2
    ), updated AS (
      UPDATE users SET signature_data=$1,updated_at=NOW() WHERE id=$2 RETURNING id,(signature_data IS NOT NULL) AS has_signature
    ), audited AS (
      INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,correlation_id)
      SELECT gen_random_uuid(),updated.id,'user.settings.signature_updated','user',updated.id,
        jsonb_build_object('hasSignature',prior.has_signature,'customerId',prior.customer_id,'siteIds',prior.site_ids),
        jsonb_build_object('hasSignature',updated.has_signature,'customerId',prior.customer_id,'siteIds',prior.site_ids),gen_random_uuid()
      FROM updated JOIN prior ON prior.id=updated.id
    ) SELECT id FROM updated`, [value, req.user.id]);
    if (!result.rows.length) throw new UnauthorizedException('User not found');
    return {hasSignature: Boolean(value), ...(value ? {signatureDataUri: value} : {})};
  }
}
