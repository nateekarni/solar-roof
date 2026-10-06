import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { AuthService } from '../../src/modules/identity/auth.service.js';
import { assertIsolatedDatabase } from './fixtures.js';
import { DatabaseService } from '../../src/database/database.service.js';
import { OperationsService } from '../../src/modules/dashboard/operations.service.js';
import { mkdir, writeFile } from 'node:fs/promises';

test('operations HTTP pages are bounded, stable, scoped, searchable beyond old audit cap and summarize the same filters', async () => {
  const db = new Pool({ connectionString: assertIsolatedDatabase(process.env.READINESS_DATABASE_URL!) });
  const base = process.env.READINESS_API_URL!, origin = process.env.READINESS_WEB_URL!;
  const school = randomUUID(), other = randomUUID(), site = randomUUID(), otherSite = randomUUID(), user = randomUUID();
  const email = `operations-${user}@example.test`, password = 'Operations-fixture-password-123!';
  const auth = new AuthService('readiness-test-access-secret-000000000000', 'readiness-test-refresh-secret-000000000000');
  await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'Q1 A',$1::text,'fixture'),($2::uuid,'Q1 B',$2::text,'fixture')", [school, other]);
  await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Q1 A',0.1),($3,$4,'Q1 B',0.1)", [site, school, otherSite, other]);
  await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id) VALUES($1,$2,'Q1 actor','accountant','active',$3,$4)", [user, email, auth.hashPassword(password), school]);
  await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) SELECT gen_random_uuid(),$1,date '2026-09-01'-n*interval '1 month',date '2026-09-30'-n*interval '1 month',now(),'pending_verification','complete',100,110,10,1,10 FROM generate_series(1,1001) n", [site]);
  await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) VALUES(gen_random_uuid(),$1,'2026-09-01','2026-09-30',now(),'paid','complete',100,110,10,1,10)", [otherSite]);
  await db.query("INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,correlation_id,occurred_at) SELECT gen_random_uuid(),$1,CASE WHEN n=501 THEN 'Q1-old-search' ELSE 'Q1-event' END,'fixture',$1,gen_random_uuid(),now()-(n/10)*interval '1 minute' FROM generate_series(1,501) n", [user]);
  await db.query("INSERT INTO documents(id,site_id,document_type,document_number,amount,issue_date) SELECT gen_random_uuid(),$1,'invoice',gen_random_uuid()::text,10,CASE WHEN n<=15 THEN date '2026-09-30' ELSE NULL END FROM generate_series(1,30) n",[site]);
  try {
    const login = await fetch(base + '/v1/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(login.status, 200);
    const token = (await login.json()).accessToken;
    const get = (path: string) => fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });
    const first = await (await get('/v1/operations/billing')).json();
    assert.equal(first.rows.length, 25);
    assert.equal(first.page.hasMore, true);
    const original = new Set((await db.query('SELECT id FROM billing_cycles WHERE site_id=$1', [site])).rows.map(row => row.id));
    await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) VALUES(gen_random_uuid(),$1,'2026-10-01','2026-10-31',now(),'pending_verification','complete',100,110,10,1,10)", [site]);
    let page = first;
    const seen = new Set<string>();
    do {
      for (const row of page.rows) { assert.equal(row.siteId, site); assert.equal(seen.has(row.id), false); seen.add(row.id); }
      if (!page.page.nextCursor) break;
      page = await (await get('/v1/operations/billing?cursor=' + encodeURIComponent(page.page.nextCursor))).json();
      assert.ok(page.rows.length <= 25);
    } while (true);
    assert.ok([...original].every(id => seen.has(id)));
    assert.equal((await get('/v1/operations/billing?limit=101')).status, 400);
    assert.equal((await get('/v1/operations/billing?sort=amount%3BDROP%20TABLE%20users')).status, 400);
    assert.equal((await get('/v1/operations/billing?cursor=garbage')).status, 400);
    const malformed=JSON.parse(Buffer.from(first.page.nextCursor,'base64url').toString());
    malformed.value='not-a-date';
    assert.equal((await get('/v1/operations/billing?cursor='+Buffer.from(JSON.stringify(malformed)).toString('base64url'))).status,400);
    assert.equal((await get('/v1/operations/documents?cursor=' + encodeURIComponent(first.page.nextCursor))).status, 400);
    assert.equal((await get('/v1/operations/billing?search=no-match&cursor=' + encodeURIComponent(first.page.nextCursor))).status, 400);
    await db.query("UPDATE users SET role='admin' WHERE id=$1",[user]);
    const audit = await (await get('/v1/operations/audit')).json();
    assert.equal(audit.rows.length, 25); assert.equal(audit.page.hasMore, true);
    const old = await (await get('/v1/operations/audit?search=Q1-old-search')).json();
    assert.equal(old.rows.length, 1); assert.equal(old.rows[0].action, 'Q1-old-search');
    for(const resource of ['audit','documents']) {
      const expected=resource==='audit'?501:30;
      const seenIds=new Set<string>();let cursor='';
      do {const response=await get(`/v1/operations/${resource}?limit=25${cursor?'&cursor='+cursor:''}`);const part=await response.json();assert.equal(response.status,200,JSON.stringify(part));for(const row of part.rows){assert.equal(seenIds.has(row.id),false);seenIds.add(row.id);}cursor=part.page.nextCursor??'';}while(cursor);
      assert.ok(seenIds.size>=expected,`${resource} walks all equal-date ties`);
    }
    await db.query("UPDATE users SET role='accountant' WHERE id=$1",[user]);
    assert.equal((await (await get('/v1/operations/billing?from=2026-10-01&to=2026-10-31')).json()).rows.length,1);
    assert.equal((await (await get('/v1/operations/billing/summary?from=2026-10-01&to=2026-10-31')).json())[0].value,1);
    const exported=await get('/v1/operations/billing/export?search=Q1 A');
    assert.equal(exported.headers.get('X-Export-Scope'),'all-matching-rows');assert.equal(exported.headers.get('X-Export-Truncated'),'false');assert.equal((await exported.text()).split('\r\n').length,1003);
    const summary = await (await get('/v1/operations/billing/summary?search=no-match')).json();
    assert.equal(summary[0].value, 0); assert.equal(summary[2].value, 0);
    const allSummary = await (await get('/v1/operations/billing/summary')).json();
    assert.equal(allSummary[0].value, 1002); assert.equal(allSummary[2].value, 10020);
    // Count actual SQL statements and result rows using the production database
    // adapter against the same private fixture, then explain that exact SQL.
    const previousDatabaseUrl=process.env.DATABASE_URL;
    process.env.DATABASE_URL=process.env.READINESS_DATABASE_URL;
    const database=new DatabaseService();
    process.env.DATABASE_URL=previousDatabaseUrl;
    const originalQuery=database.query.bind(database);
    const statements:{sql:string;params:unknown[];returned:number}[]=[];
    database.query=async (sql:string,params:unknown[]=[])=>{const result=await originalQuery(sql,params);statements.push({sql,params:[...params],returned:result.rows.length});return result;};
    try {
      const service=new OperationsService(database),principal={id:user,role:'accountant',schoolId:school};
      await service.summary('billing',principal);
      assert.equal(statements.length,1);assert.equal(statements[0]!.returned,1);assert.match(statements[0]!.sql,/SELECT count\(\*\)/);
      statements.length=0;
      const bounded=await service.list('billing',principal);
      assert.equal(bounded.rows.length,25);assert.equal(statements.length,1);assert.equal(statements[0]!.returned,26);
      const exact=statements[0]!;
      const explain=await db.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+exact.sql,exact.params);
      assert.equal(explain.rows[0]['QUERY PLAN'][0].Plan['Actual Rows'],26);
      assert.equal(explain.rows[0]['QUERY PLAN'][0].Plan['Node Type'],'Limit');
      await mkdir('../../test/artifacts',{recursive:true});
      await writeFile('../../test/artifacts/q1-operation-explain.json',JSON.stringify({fixtureBillingRows:1002,returnedRows:26,responseRows:25,summaryStatements:1,summaryReturnedRows:1,sql:exact.sql,plan:explain.rows[0]['QUERY PLAN'],limits:'Fixture demonstrates bounded result transfer only; no production capacity claim.'},null,2));
    } finally {await database.onModuleDestroy();}
    await db.query('UPDATE users SET school_id=$1 WHERE id=$2', [other, user]);
    assert.equal((await get('/v1/operations/billing?cursor=' + encodeURIComponent(first.page.nextCursor))).status, 400);
    const changed = await (await get('/v1/operations/billing')).json();
    assert.equal(changed.rows.length, 1); assert.equal(changed.rows[0].siteId, otherSite);
    for(const role of ['operator','school_user']) {
      await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,user]);
      for(const encoded of ['%75sers','%61udit'])for(const suffix of ['','/summary','/export'])assert.equal((await get(`/v1/operations/${encoded}${suffix}`)).status,403,`${role} encoded ${encoded}${suffix} retains service authorization`);
    }
  } finally {
    await db.query('DELETE FROM audit_events WHERE actor_id=$1', [user]);
    await db.query('DELETE FROM billing_cycles WHERE site_id=ANY($1::uuid[])', [[site, otherSite]]);
    await db.query('DELETE FROM documents WHERE site_id=$1',[site]);
    await db.query('DELETE FROM auth_sessions WHERE user_id=$1', [user]);
    await db.query('DELETE FROM users WHERE id=$1', [user]);
    await db.query('DELETE FROM sites WHERE id=ANY($1::uuid[])', [[site, otherSite]]);
    await db.query('DELETE FROM schools WHERE id=ANY($1::uuid[])', [[school, other]]);
    await db.end();
  }
});
