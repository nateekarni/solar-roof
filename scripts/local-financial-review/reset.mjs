import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {assertTarget} from './guard.mjs';
import {resetReview} from './reset-operation.mjs';
assertTarget(process.env.DATABASE_URL,'solar_financial_flow_review');
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));const {Pool}=require('pg');
const result=await resetReview({pool:new Pool({connectionString:process.env.DATABASE_URL}),apply:process.argv.includes('--apply'),inspect:names=>JSON.parse(execFileSync('docker',['volume','inspect',...names],{encoding:'utf8'})),remove:()=>execFileSync('docker',['compose','-f','scripts/local-financial-review/compose.yml','-p','solar-financial-flow-review','down','--volumes'],{stdio:'inherit'})});
console.log(JSON.stringify(result));
