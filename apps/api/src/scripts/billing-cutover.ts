import 'reflect-metadata';
import {DatabaseService} from '../database/database.service.js';
import {FinancialReadinessService} from '../modules/financial-readiness/financial-readiness.service.js';
import {FinancialApplicationService} from '../modules/billing/financial-application.service.js';
import {parseCutoverArguments,runBillingCutover} from './billing-cutover-runner.js';

// Deliberately instantiate only business services: no Nest bootstrap or timer.
let db:DatabaseService|undefined;
try {
 const input=parseCutoverArguments(process.argv.slice(2));
 db=new DatabaseService();const readiness=new FinancialReadinessService(db);
 console.log(JSON.stringify(await runBillingCutover(input,db,readiness,new FinancialApplicationService(db,readiness))));
} catch(error) {
 const response=(error as {getResponse?:()=>unknown})?.getResponse?.() as {code?:unknown;missing?:unknown}|undefined;
 console.error(JSON.stringify({code:response?.code==='FINANCIAL_NOT_READY'?'FINANCIAL_NOT_READY':'CUTOVER_FAILED',...(Array.isArray(response?.missing)?{missing:response.missing}:{})}));
 process.exitCode=1;
} finally {await db?.pool.end();}
