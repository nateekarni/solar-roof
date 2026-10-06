import {mkdtemp,readFile,rm,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// Download.path() refers to the browser filesystem and throws over a remote
// connection. saveAs() transfers the actual artifact to this test process.
export async function readDownloadedFile(download) {
  const directory=await mkdtemp(join(tmpdir(),'solar-ci-download-'));
  const path=join(directory,'artifact');
  try {
    await download.saveAs(path);
    return await readFile(path);
  } finally {
    await rm(path,{force:true});
    await rmdir(directory);
  }
}
