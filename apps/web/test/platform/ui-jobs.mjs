import { assertRetiredExports } from './retired-exports.mjs';
await assertRetiredExports([
 ['POST','/v1/reports'],['GET','/v1/reports/:id/download'],
 ['GET','/v1/jobs'],['GET','/v1/jobs/:id'],['GET','/v1/jobs/:id/download'],
 ['POST','/v1/jobs/:id/retry'],['POST','/v1/jobs/:id/cancel'],
 ['GET','/v1/operations/reports'],
]);
console.log('PASS: retired reports and jobs deny every role without mutating persisted jobs');
