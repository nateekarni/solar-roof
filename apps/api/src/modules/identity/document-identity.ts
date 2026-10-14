import {ConflictException, ForbiddenException} from '@nestjs/common';
import type {PoolClient} from 'pg';

export type DocumentIdentity = {
  userId: string;
  displayName: string;
  position: string;
  signatureDataUri?: string;
};

export class DocumentIdentityService {
  async resolve(client: Pick<PoolClient, 'query'>, userId: string): Promise<DocumentIdentity> {
    const row = (await client.query(`
      SELECT u.id, u.display_name, p.name AS position, u.signature_data
      FROM users u LEFT JOIN employee_positions p ON p.id = u.company_position_id
      WHERE u.id = $1 AND u.status = 'active'
      FOR SHARE OF u
    `, [userId])).rows[0];
    if (!row) throw new ForbiddenException('บัญชีผู้อนุมัติไม่พร้อมใช้งาน');
    if (!row.position?.trim()) {
      throw new ConflictException(`กรุณากำหนดตำแหน่งของ ${row.display_name} ในหน้าพนักงานและสิทธิ์`);
    }
    return {
      userId: row.id,
      displayName: row.display_name,
      position: row.position,
      ...(row.signature_data ? {signatureDataUri: row.signature_data} : {}),
    };
  }
}
