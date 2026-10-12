import { assertRetiredExports } from './retired-exports.mjs';
// This policy is independent of HISTORY_RESTORE_ENABLED.
await assertRetiredExports([['GET','/v1/history/options'],['POST','/v1/history/restore']]);
console.log('PASS: retired history endpoints and report UI deny every role');
