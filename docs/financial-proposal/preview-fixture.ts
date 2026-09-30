import {createRequire} from 'node:module';
const {Pool}=createRequire(new URL('./validation/apps/api/package.json',import.meta.url))('pg');
import {randomUUID} from 'node:crypto';
import {AuthService} from './validation/apps/api/src/modules/identity/auth.service.js';
const database=process.env.FINANCIAL_TEST_DATABASE_URL;
if(!database||new URL(database).hostname!=='127.0.0.1'||new URL(database).pathname!=='/solar_financial_v2')throw new Error('Isolated database only');
const db=new Pool({connectionString:database});
try {
 const auth=new AuthService('financial-preview-access-secret-00000000','financial-preview-refresh-secret-0000000');
 await db.query(`INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,'financial-preview@example.test','Financial Preview','owner','active',$2) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash`,[randomUUID(),auth.hashPassword('Local-preview-only-123!')]);
 console.log('Isolated preview account ready');
}finally{await db.end();}
