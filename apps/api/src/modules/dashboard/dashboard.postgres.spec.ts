import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { DashboardService } from './dashboard.service.js';
import type { DatabaseService } from '../../database/database.service.js';
const connectionString=process.env.DASHBOARD_TEST_DATABASE_URL;
test('dashboard SQL executes against disposable PostgreSQL for all metric paths', {skip:!connectionString},async()=>{
 const url=new URL(connectionString!);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15432');assert.equal(url.pathname,'/solar_readiness');
 const pool=new Pool({connectionString,options:'-c default_transaction_read_only=on'});
 try {
   const service=new DashboardService({query:(sql:string,values:unknown[])=>pool.query(sql,values)} as unknown as DatabaseService);
   const summary=await service.getSummary({role:'owner'},'2026-09-01','2026-09-30');
   assert.ok(Array.isArray(summary.production));
   for (const metric of ['periodKwh','periodAmount','currentMw','installedMwp','onlineSites']) {
     const result=await service.compare({role:'owner'},metric,[],'2026-09-01','2026-09-30');
     assert.ok(Array.isArray(result));
   }
   const live=await service.getPowerFlow({role:'owner'});assert.ok(Array.isArray(live.sites));
 } finally {await pool.end();}
});
