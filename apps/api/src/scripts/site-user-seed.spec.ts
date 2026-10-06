import assert from 'node:assert/strict';
import test from 'node:test';
import {parseSiteUserSeed,seedSchoolUserForSite} from './site-user-seed.js';
const input={DATABASE_URL:'postgresql://test:test@localhost/test',SITE_USER_SEED_ENABLED:'true',SITE_USER_SEED_SITE_ID:'a049f5de-54fb-48e8-a8f7-7bbfb4d4e608',SITE_USER_SEED_EMAIL:'school@example.invalid',SITE_USER_SEED_PASSWORD:'strong-school-password',SITE_USER_SEED_NAME:'School Test'};
test('site seed requires explicit opt-in and a valid site; errors never echo secrets',()=>{
 assert.equal(parseSiteUserSeed(input).email,'school@example.invalid');
 for(const patch of [{SITE_USER_SEED_ENABLED:'false'},{SITE_USER_SEED_SITE_ID:''},{SITE_USER_SEED_PASSWORD:'short-secret'}])assert.throws(()=>parseSiteUserSeed({...input,...patch}),e=>!String(e).includes('short-secret'));
});
test('site determines school and existing account passwords are preserved; other school/role rejected',async()=>{
 let existing:any={id:'user',school_id:'school',role:'school_user',status:'active',password_hash:'scrypt:original'};let inserts=0;
 const db:any={query:async(sql:string)=>{if(sql.includes('FROM sites'))return {rows:[{school_id:'school'}]};if(sql.includes('FROM users'))return {rows:[existing]};inserts++;return {rows:[]};}};
 const config=parseSiteUserSeed(input);
 assert.equal((await seedSchoolUserForSite(db,config)).created,false);assert.equal(inserts,0);
 existing={...existing,school_id:'other'};await assert.rejects(()=>seedSchoolUserForSite(db,config),/incompatible/);
 existing={...existing,school_id:'school',role:'admin'};await assert.rejects(()=>seedSchoolUserForSite(db,config),/incompatible/);
 assert.equal(inserts,0);
});
