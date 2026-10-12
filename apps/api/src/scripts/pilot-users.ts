import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {AuthService} from '../modules/identity/auth.service.js';

const email=z.string().trim().toLowerCase().email();
const password=z.string().min(16);
const schema=z.object({
 DATABASE_URL:z.string().url().refine(value=>['postgres:','postgresql:'].includes(new URL(value).protocol)),
 PILOT_USERS_ENABLED:z.literal('true'), PILOT_CUSTOMER_ID:z.uuid(),
 PILOT_ADMIN_EMAIL:email,PILOT_ADMIN_PASSWORD:password,
 PILOT_OWNER_EMAIL:email,PILOT_OWNER_PASSWORD:password,
 PILOT_CUSTOMER_EMAIL:email,PILOT_CUSTOMER_PASSWORD:password,
}).superRefine((value,context)=>{
 if(new Set([value.PILOT_ADMIN_EMAIL,value.PILOT_OWNER_EMAIL,value.PILOT_CUSTOMER_EMAIL]).size!==3)context.addIssue({code:'custom',path:['PILOT_ADMIN_EMAIL'],message:'Three distinct email addresses required'});
});
export function parsePilotUsersConfig(input:Record<string,string|undefined>) {
 const result=schema.safeParse(input);
 if(!result.success)throw Error(`Invalid pilot user fields: ${[...new Set(result.error.issues.map(issue=>issue.path.join('.')))].join(', ')}`);
 const value=result.data;
 return {databaseUrl:value.DATABASE_URL,customerId:value.PILOT_CUSTOMER_ID,users:[
  {email:value.PILOT_ADMIN_EMAIL,password:value.PILOT_ADMIN_PASSWORD,role:'admin' as const,name:'Pilot Admin'},
  {email:value.PILOT_OWNER_EMAIL,password:value.PILOT_OWNER_PASSWORD,role:'owner' as const,name:'Pilot Owner'},
  {email:value.PILOT_CUSTOMER_EMAIL,password:value.PILOT_CUSTOMER_PASSWORD,role:'customer_user' as const,name:'Pilot Customer User'},
 ]};
}

interface SeedDatabase {query(sql:string,values?:unknown[]):Promise<{rows:Array<Record<string,unknown>>}>}
// Caller owns a transaction and the shared user-provisioning advisory lock.
export async function seedPilotUsers(db:SeedDatabase,config:ReturnType<typeof parsePilotUsersConfig>) {
 const customer=await db.query("SELECT id FROM customers WHERE id=$1 AND status='active' FOR SHARE",[config.customerId]);
 if(customer.rows.length!==1)throw Error('PILOT_CUSTOMER_ID must refer to an existing active customer');
 const checked=[];
 for(const user of config.users) {
  const customerId=user.role==='customer_user'?config.customerId:null;
  const found=await db.query('SELECT id,role,status,customer_id,password_hash FROM users WHERE lower(email)=$1 FOR UPDATE',[user.email]);
  const existing=found.rows[0];
  if(found.rows.length>1 || existing&&(existing.role!==user.role||existing.customer_id!==customerId||existing.status!=='active'||!existing.password_hash))throw Error(`Pilot ${user.role} email belongs to an incompatible account; no accounts changed`);
  checked.push({user,customerId,existing});
 }
 const auth=new AuthService('','');
 const results=[];
 for(const {user,customerId,existing} of checked) {
  const id=existing?.id as string|undefined ?? randomUUID();
  if(!existing)await db.query("INSERT INTO users(id,email,display_name,role,customer_id,password_hash,status) VALUES($1,$2,$3,$4,$5,$6,'active')",[id,user.email,user.name,user.role,customerId,auth.hashPassword(user.password)]);
  results.push({id,email:user.email,role:user.role,customerId,created:!existing});
 }
 const actorId=results.find(user=>user.role==='admin')!.id;
 for(const user of results.filter(user=>user.created))await db.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,correlation_id) VALUES($1,$2,'pilot_seed_user','user',$3,$4::jsonb,$5)",[randomUUID(),actorId,user.id,JSON.stringify({role:user.role,customerId:user.customerId}),randomUUID()]);
 return results;
}
