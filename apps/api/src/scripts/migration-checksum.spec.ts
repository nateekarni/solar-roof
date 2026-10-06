import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {migrationChecksum,matchesMigrationChecksum} from './migration-checksum.js';
test('migration checksum tolerates only LF/CRLF checkout differences without accepting changed SQL',()=>{
 const lf='CREATE TABLE x(id int);\n',crlf=lf.replaceAll('\n','\r\n');
 assert.equal(migrationChecksum(lf),migrationChecksum(crlf));
 assert.ok(matchesMigrationChecksum(createHash('sha256').update(crlf).digest('hex'),lf));
 assert.ok(matchesMigrationChecksum(createHash('sha256').update(lf).digest('hex'),crlf));
 assert.equal(matchesMigrationChecksum(migrationChecksum(lf),'CREATE TABLE x(id text);\n'),false);
});
