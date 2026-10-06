import assert from 'node:assert/strict';
import {test} from 'node:test';
import {access,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readDownloadedFile} from '../../apps/web/test/platform/download-reading.mjs';

test('remote download transfer preserves CSV and compressed binary bytes and cleans local files',async()=>{
  for(const expected of [Buffer.from('site,meter\nSchool,meter-1\n'),gzipSync('12345678901234567890.123456789\n')]) {
    let saved;
    const actual=await readDownloadedFile({path(){throw new Error('Remote filesystem unavailable');},async saveAs(path){saved=path;await writeFile(path,expected);}});
    assert.deepEqual(actual,expected);
    if(expected[0]===31)assert.equal(gunzipSync(actual).toString(),'12345678901234567890.123456789\n');
    await assert.rejects(access(dirname(saved)),{code:'ENOENT'});
  }
});
test('failed remote transfer preserves failure and removes partial local artifact',async()=>{
  let saved;
  const failure=new Error('Transfer failed');
  await assert.rejects(readDownloadedFile({async saveAs(path){saved=path;await writeFile(path,'partial');throw failure;}}),error=>error===failure);
  await assert.rejects(access(dirname(saved)),{code:'ENOENT'});
});
