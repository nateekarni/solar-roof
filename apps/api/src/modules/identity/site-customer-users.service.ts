import {BadRequestException,ConflictException,ForbiddenException,Inject,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {DatabaseService} from '../../database/database.service.js';
import {InvitationService} from './invitation.service.js';

const editSchema = z.object({
  displayName: z.string().trim().min(2).max(200).optional(),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  status: z.enum(['active', 'disabled']).optional()
}).strict();

@Injectable()
export class SiteCustomerUsersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(InvitationService) private readonly invitations: InvitationService
  ) {}

  private async scope(client: PoolClient | undefined, siteId: string, actorId: string) {
    const query = client ? (text: string, params: unknown[]) => client.query(text, params) : (text: string, params: unknown[]) => this.db.query(text, params);
    const actor = (await query('SELECT role,status FROM users WHERE id=$1 FOR SHARE', [actorId])).rows[0];
    if (actor?.role !== 'owner' || actor.status !== 'active') throw new ForbiddenException('Business manager required');
    const site = (await query("SELECT customer_id FROM sites WHERE id::text=$1 AND status<>'archived' FOR SHARE", [siteId])).rows[0];
    if (!site) throw new NotFoundException('Site not found');
    return site.customer_id as string;
  }

  async list(siteId: string, actorId: string) {
    const customerId = await this.scope(undefined, siteId, actorId);
    return {
      customerId,
      users: (
        await this.db.query(
          `SELECT id, email, display_name AS "displayName", phone, status, (password_hash IS NOT NULL) AS "canActivate", created_at AS "createdAt"
           FROM users
           WHERE customer_id=$1 AND role='customer_user'
             AND EXISTS(SELECT 1 FROM site_account_assignments a WHERE a.user_id=users.id AND a.site_id=$2 AND a.revoked_at IS NULL)
           ORDER BY created_at, id LIMIT 500`,
          [customerId, siteId]
        )
      ).rows,
    };
  }

  async invite(siteId: string, input: { email: string; displayName: string; phone?: string | null }, actorId: string) {
    const customerId = await this.scope(undefined, siteId, actorId);
    return this.invitations.invite(
      { email: input.email, displayName: input.displayName, phone: input.phone ?? null, customerId, siteId, role: 'customer_user' },
      { id: actorId, role: 'owner' }
    );
  }

  async update(siteId: string, userId: string, input: unknown, actorId: string) {
    const parsed = editSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException('Invalid user fields');
    return this.db.transaction(async (client) => {
      const customerId = await this.scope(client, siteId, actorId);
      const user = (
        await client.query(
          'SELECT id, email, display_name, phone, status, role, customer_id, password_hash FROM users WHERE id=$1 FOR UPDATE',
          [userId]
        )
      ).rows[0];
      if (!user || user.role !== 'customer_user' || user.customer_id !== customerId) throw new NotFoundException('Customer user not found');
      if (
        !(
          await client.query(
            'SELECT id FROM site_account_assignments WHERE user_id=$1 AND site_id=$2 AND revoked_at IS NULL FOR UPDATE',
            [userId, siteId]
          )
        ).rows[0]
      ) {
        throw new NotFoundException('Site assignment not found');
      }
      const email = parsed.data.email ?? user.email;
      const status = parsed.data.status ?? user.status;
      const displayName = parsed.data.displayName ?? user.display_name;
      const phone = parsed.data.phone !== undefined ? parsed.data.phone : user.phone;

      if (!user.password_hash && (status === 'active' || email !== user.email)) {
        throw new ConflictException('Invited users must activate through their original email; revoke and invite again to change email');
      }
      if (
        email !== user.email &&
        (await client.query('SELECT id FROM users WHERE lower(email)=$1 AND id<>$2', [email, userId])).rows.length
      ) {
        throw new ConflictException('Email already exists');
      }
      await client.query(
        'UPDATE users SET display_name=$2, email=$3, status=$4, phone=$5, updated_at=now() WHERE id=$1',
        [userId, displayName, email, status, phone]
      );
      if (status === 'disabled' || email !== user.email) {
        await client.query(
          'UPDATE auth_sessions SET revoked_at=now(), refresh_hash=NULL WHERE user_id=$1 AND revoked_at IS NULL',
          [userId]
        );
      }
      if (status === 'disabled') {
        await client.query(
          'UPDATE user_invitations SET revoked_at=now(), updated_at=now() WHERE user_id=$1 AND consumed_at IS NULL',
          [userId]
        );
      }
      await client.query(
        "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,correlation_id) VALUES($1,$2,'site.customer_user.updated','user',$3,$4::jsonb,$5::jsonb,$6)",
        [
          randomUUID(),
          actorId,
          userId,
          JSON.stringify({ email: user.email, displayName: user.display_name, phone: user.phone, status: user.status }),
          JSON.stringify({ email, displayName, phone, status, customerId }),
          randomUUID(),
        ]
      );
      return { id: userId, email, displayName, phone, status };
    });
  }

  async cancelInvite(siteId: string, userId: string, actorId: string) {
    return this.db.transaction(async (client) => {
      const customerId = await this.scope(client, siteId, actorId);
      const user = (
        await client.query(
          'SELECT id, email, display_name, phone, status, role, customer_id, password_hash FROM users WHERE id=$1 FOR UPDATE',
          [userId]
        )
      ).rows[0];
      if (!user || user.role !== 'customer_user' || user.customer_id !== customerId) throw new NotFoundException('Customer user not found');
      if (user.status !== 'invited') throw new ConflictException('User is not in invited state');
      await client.query("UPDATE users SET status='disabled', updated_at=now() WHERE id=$1", [userId]);
      await client.query('UPDATE user_invitations SET revoked_at=now(), updated_at=now() WHERE user_id=$1 AND consumed_at IS NULL', [userId]);
      await client.query(
        "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,before_json,after_json) VALUES($1,$2,'site.customer_user.invite_cancelled','user',$3,$4,$5::jsonb,$6::jsonb)",
        [randomUUID(), actorId, userId, randomUUID(), JSON.stringify({email: user.email, status: user.status, siteId}), JSON.stringify({status: 'disabled', invitationRevoked: true})]
      );
      return { id: userId, status: 'disabled' };
    });
  }

  async remove(siteId: string, userId: string, actorId: string) {
    return this.db.transaction(async (client) => {
      await this.scope(client, siteId, actorId);
      const result = await client.query(
        'UPDATE site_account_assignments SET revoked_at=now(), revoked_by=$3 WHERE user_id=$1 AND site_id=$2 AND revoked_at IS NULL RETURNING id',
        [userId, siteId, actorId]
      );
      if (!result.rows[0]) throw new NotFoundException('Site assignment not found');
      await client.query(
        "INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,before_json,after_json) VALUES($1,$2,'site.customer_user.revoked','site',$3,$4,$5::jsonb,$6::jsonb)",
        [randomUUID(), actorId, siteId, randomUUID(), JSON.stringify({userId, siteId, assignmentStatus: 'active'}), JSON.stringify({assignmentStatus: 'revoked'})]
      );
      return { id: userId, siteId, assignmentStatus: 'revoked' };
    });
  }
}
