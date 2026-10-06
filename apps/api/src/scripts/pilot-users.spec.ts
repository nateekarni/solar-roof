import assert from 'node:assert/strict';
import test from 'node:test';
import {parsePilotUsersConfig, seedPilotUsers} from './pilot-users.js';

const input={DATABASE_URL:'postgresql://test:test@localhost/test',PILOT_USERS_ENABLED:'true',PILOT_SCHOOL_ID:'a049f5de-54fb-48e8-a8f7-7bbfb4d4e608',PILOT_ADMIN_EMAIL:' Admin@example.test ',PILOT_ADMIN_PASSWORD:'admin-strong-password',PILOT_OWNER_EMAIL:'owner@example.test',PILOT_OWNER_PASSWORD:'owner-strong-password',PILOT_SCHOOL_EMAIL:'school@example.test',PILOT_SCHOOL_PASSWORD:'school-strong-password'};
test('pilot account configuration requires opt-in, three distinct emails, strong passwords and explicit school',()=>{
 const config=parsePilotUsersConfig(input);
 assert.deepEqual(config.users.map(u=>[u.email,u.role]),[['admin@example.test','admin'],['owner@example.test','owner'],['school@example.test','school_user']]);
 for(const patch of [{PILOT_USERS_ENABLED:'false'},{PILOT_OWNER_EMAIL:input.PILOT_SCHOOL_EMAIL},{PILOT_SCHOOL_ID:''},{PILOT_ADMIN_PASSWORD:'short-secret'}]) {
  assert.throws(()=>parsePilotUsersConfig({...input,...patch}),error=>!String(error).includes('short-secret'));
 }
});
test('existing compatible accounts keep their passwords; incompatible role aborts without updates',async()=>{
 const config=parsePilotUsersConfig(input);
 const existing=config.users.map((u,i)=>({id:String(i),role:u.role,status:'active',school_id:u.role==='school_user'?config.schoolId:null,password_hash:'preserved'}));
 const queries:string[]=[];
 const db={query:async(sql:string,values?:unknown[])=>{
  queries.push(sql);
  if(sql.includes('FROM schools'))return {rows:[{id:config.schoolId}]};
  if(sql.includes('FROM users'))return {rows:[existing[config.users.findIndex(u=>u.email===values?.[0])]!]};
  return {rows:[]};
 }};
 const results=await seedPilotUsers(db,config);
 assert.equal(results.every(u=>u.created===false),true);
 assert.equal(queries.some(sql=>/^(INSERT|UPDATE)\b/.test(sql)),false);
 existing[1]!.role='admin';
 await assert.rejects(()=>seedPilotUsers(db,config),/incompatible/);
});
test('missing school fails before creating accounts and new passwords use the normal hasher',async()=>{
 const config=parsePilotUsersConfig(input);
 const queries:Array<{sql:string;values:unknown[]|undefined}> = [];
 let schoolExists=false;
 const db={query:async(sql:string,values?:unknown[])=>{
  queries.push({sql,values});
  return {rows:sql.includes('FROM schools')&&schoolExists?[{id:config.schoolId}]:[]};
 }};
 await assert.rejects(()=>seedPilotUsers(db,config),/active school/);
 assert.equal(queries.some(q=>q.sql.includes('INSERT')),false);
 schoolExists=true;
 const result=await seedPilotUsers(db,config);
 assert.equal(result.filter(u=>u.created).length,3);
 const inserts=queries.filter(q=>q.sql.includes('INSERT INTO users'));
 assert.equal(inserts.length,3);
 assert.equal(inserts.every(q=>String(q.values?.[5]).startsWith('scrypt:')),true);
 assert.equal(inserts[2]!.values?.[4],config.schoolId);
});
