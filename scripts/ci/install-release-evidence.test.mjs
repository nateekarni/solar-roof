import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installEvidence} from './install-release-evidence.mjs';

test('release evidence installs atomically and malformed input cannot replace the previous file',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'solar-release-evidence-'));
  try{
    await installEvidence('{"version":1}',directory);
    for(const value of ['[1]','null','{',' '.repeat(65537)])await assert.rejects(installEvidence(value,directory));
    assert.deepEqual(JSON.parse(await readFile(join(directory,'evidence.json'),'utf8')),{version:1});
    await installEvidence('{}',directory);
    assert.deepEqual(JSON.parse(await readFile(join(directory,'evidence.json'),'utf8')),{});
  }finally{await unlink(join(directory,'evidence.json')).catch(()=>{});await rmdir(directory);}
});
