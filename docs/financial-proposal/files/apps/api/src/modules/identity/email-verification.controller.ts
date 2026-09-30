import { BadRequestException, Body, Controller, Get, Inject, Post, Req, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomInt } from 'node:crypto';
import nodemailer from 'nodemailer';
import { DatabaseService } from '../../database/database.service.js';

type SignedRequest = { user: { id: string } };
export const emailCodeHash = (userId: string, email: string, code: string) =>
  createHash('sha256').update(`${userId}\0${email}\0${code}`).digest('hex');

@Controller('v1/me/email-verification')
export class EmailVerificationController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async status(@Req() req: SignedRequest) {
    const result = await this.db.query(`SELECT email, (email_verified_at IS NOT NULL AND verified_email=email) AS verified FROM users WHERE id=$1 AND status='active'`, [req.user.id]);
    if (!result.rows[0]) throw new BadRequestException('Active account required');
    return result.rows[0];
  }

  @Post('request')
  async request(@Req() req: SignedRequest) {
    if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new ServiceUnavailableException('Configure SMTP before email verification');
    const code = String(randomInt(10000000, 100000000));
    const email = await this.db.transaction(async client => {
      const user = (await client.query(`SELECT email FROM users WHERE id=$1 AND status='active' FOR UPDATE`, [req.user.id])).rows[0];
      if (!user) throw new BadRequestException('Active account required');
      const recent = await client.query(`SELECT 1 FROM email_verification_challenges WHERE user_id=$1 AND requested_at>now()-interval '1 minute'`, [req.user.id]);
      if (recent.rows.length) throw new BadRequestException('Wait one minute before requesting another code');
      await client.query(`INSERT INTO email_verification_challenges(user_id,email,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes') ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,code_hash=excluded.code_hash,expires_at=excluded.expires_at,requested_at=now(),attempts=0`, [req.user.id,user.email,emailCodeHash(req.user.id,user.email,code)]);
      return String(user.email);
    });
    try {
      const transport = nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT || 587),secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER ? {auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}} : {}),connectionTimeout:10000,socketTimeout:20000});
      const result = await transport.sendMail({from:process.env.SMTP_FROM,to:email,subject:'ยืนยันอีเมล Solar Platform',text:`รหัสยืนยันอีเมล: ${code}\nรหัสนี้มีอายุ 15 นาที ใช้ในหน้าบัญชีที่คุณเข้าสู่ระบบอยู่เท่านั้น`});
      if (!result.accepted.some((value:unknown) => String(value).toLowerCase()===email.toLowerCase())) throw new Error('Recipient not accepted');
    } catch {
      throw new ServiceUnavailableException('Verification email was not accepted; retry after one minute');
    }
    return {accepted:true};
  }

  @Post('confirm')
  async confirm(@Req() req: SignedRequest, @Body() body: {code?:string}) {
    if (typeof body.code!=='string' || !/^\d{8}$/.test(body.code)) throw new BadRequestException('Enter the eight-digit code');
    // Persist failed attempt counters before returning an error.
    const verified = await this.db.transaction(async client => {
      const user = (await client.query(`SELECT email FROM users WHERE id=$1 AND status='active' FOR UPDATE`, [req.user.id])).rows[0];
      if (!user) return false;
      const challenge = (await client.query(`UPDATE email_verification_challenges SET attempts=attempts+1 WHERE user_id=$1 AND email=$2 AND expires_at>now() AND attempts<5 RETURNING code_hash`,[req.user.id,user.email])).rows[0];
      if (!challenge || challenge.code_hash!==emailCodeHash(req.user.id,user.email,body.code!)) return false;
      await client.query(`UPDATE users SET verified_email=email,email_verified_at=now() WHERE id=$1`,[req.user.id]);
      await client.query(`DELETE FROM email_verification_challenges WHERE user_id=$1`,[req.user.id]);
      return true;
    });
    if (!verified) throw new BadRequestException('Invalid, expired or exhausted code; request another code');
    return {verified:true};
  }
}
