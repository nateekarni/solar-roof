import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AuthService} from '../modules/identity/auth.service.js';

const schema=z.object({
 DATABASE_URL:z.string().url().refine(value=>['postgres:','postgresql:'].includes(new URL(value).protocol)),
 USER_CREATE_ENABLED:z.literal('true'),USER_EMAIL:z.string().trim().toLowerCase().email().max(254),
 USER_PASSWORD:z.string().min(16).max(1024),USER_NAME:z.string().trim().min(2).max(200),
 USER_ROLE:z.enum(['admin','owner','school_user']),USER_SCHOOL_ID:z.preprocess(value=>value===''?undefined:value,z.uuid().optional()),
}).superRefine((value,context)=>{
 if((value.USER_ROLE==='school_user')!==Boolean(value.USER_SCHOOL_ID))context.addIssue({code:'custom',path:['USER_SCHOOL_ID'],message:'School scope required only for school_user'});
});
export function parseManualUser(input:Record<string,string|undefined>){
 const result=schema.safeParse(input);
 if(!result.success)throw Error(`Invalid manual user fields: ${[...new Set(result.error.issues.map(issue=>issue.path.join('.')))].join(', ')}`);
 const value=result.data;return {databaseUrl:value.DATABASE_URL,email:value.USER_EMAIL,password:value.USER_PASSWORD,name:value.USER_NAME,role:value.USER_ROLE,schoolId:value.USER_SCHOOL_ID??null};
}
interface UserDatabase {query(sql:string,values?:unknown[]):Promise<{rows:Array<Record<string,unknown>>}>}
// Caller owns the transaction and shared user-provisioning advisory lock.
export async function createManualUser(db:UserDatabase,config:ReturnType<typeof parseManualUser>){
 if(config.schoolId){const school=await db.query("SELECT id FROM schools WHERE id=$1 AND status='active' FOR SHARE",[config.schoolId]);if(school.rows.length!==1)throw Error('Manual user requires an existing active school');}
 const users=await db.query('SELECT id,role,status,school_id,password_hash FROM users WHERE lower(email)=$1 FOR UPDATE',[config.email]);
 const existing=users.rows[0];
 if(users.rows.length>1||existing&&(existing.role!==config.role||existing.school_id!==config.schoolId||existing.status!=='active'||!existing.password_hash))throw Error('Manual user email belongs to an incompatible account; no user changed');
 if(existing)return {id:existing.id,email:config.email,role:config.role,schoolId:config.schoolId,created:false};
 const id=randomUUID();const hash=new AuthService('','').hashPassword(config.password);
 await db.query("INSERT INTO users(id,email,display_name,role,school_id,password_hash,status) VALUES($1,$2,$3,$4,$5,$6,'active')",[id,config.email,config.name,config.role,config.schoolId,hash]);
 await db.query("INSERT INTO audit_events(id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,'manual_user_created','user',$2,$3::jsonb,$4)",[randomUUID(),id,JSON.stringify({role:config.role,schoolId:config.schoolId}),randomUUID()]);
 return {id,email:config.email,role:config.role,schoolId:config.schoolId,created:true};
}
