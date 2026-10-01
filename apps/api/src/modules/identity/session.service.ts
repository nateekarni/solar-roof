import {Inject, Injectable} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../../database/database.service.js';

@Injectable()
export class SessionService {
  constructor(@Inject(DatabaseService) private readonly db:DatabaseService) {}

  async create(userId:string):Promise<{sid:string}> {
    const sid=randomUUID();
    await this.db.query('INSERT INTO auth_sessions(sid,user_id) VALUES($1,$2)',[sid,userId]);
    return {sid};
  }

  async initialize(sid:string,userId:string,refreshHash:string,expiresAt:Date):Promise<void> {
    const result=await this.db.query(`UPDATE auth_sessions SET refresh_hash=$3,expires_at=$4
      WHERE sid=$1 AND user_id=$2 AND refresh_hash IS NULL AND revoked_at IS NULL
      AND $4::timestamptz > now()
      AND EXISTS(SELECT 1 FROM users WHERE id=$2 AND status='active')`,[sid,userId,refreshHash,expiresAt]);
    if(result.rowCount!==1)throw new Error('Session initialization failed');
  }

  async rotate(sid:string,oldHash:string,newHash:string):Promise<boolean> {
    return this.db.transaction(async client=>{
      // PostgreSQL rechecks this predicate after waiting for a competing UPDATE.
      // The losing request audits replay without revoking the winner.
      const result=await client.query(`UPDATE auth_sessions SET refresh_hash=$3
        WHERE sid=$1 AND refresh_hash=$2 AND revoked_at IS NULL AND expires_at>now()
        AND EXISTS(SELECT 1 FROM users WHERE id=auth_sessions.user_id AND status='active')
        RETURNING user_id`,[sid,oldHash,newHash]);
      const session=result.rows[0] ?? (await client.query('SELECT user_id FROM auth_sessions WHERE sid=$1',[sid])).rows[0];
      if(session)await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id)
        VALUES($1,$2,$3,'auth_session',$4::uuid,$4::text)`,[randomUUID(),session.user_id,result.rowCount===1?'session.rotated':'session.refresh_rejected',sid]);
      return result.rowCount===1;
    });
  }

  async revoke(sid:string):Promise<void> {
    await this.db.transaction(async client=>{
      const result=await client.query('UPDATE auth_sessions SET revoked_at=now(),refresh_hash=NULL WHERE sid=$1 AND revoked_at IS NULL RETURNING user_id',[sid]);
      if(result.rows[0])await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id)
        VALUES($1,$2,'session.revoked','auth_session',$3::uuid,$3::text)`,[randomUUID(),result.rows[0].user_id,sid]);
    });
  }

  async isActive(sid:string,userId:string):Promise<boolean> {
    const result=await this.db.query(`SELECT 1 FROM auth_sessions WHERE sid=$1 AND user_id=$2
      AND refresh_hash IS NOT NULL AND revoked_at IS NULL AND expires_at>now()`,[sid,userId]);
    return result.rowCount===1;
  }
}