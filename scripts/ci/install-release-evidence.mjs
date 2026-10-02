import {mkdir,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export async function installEvidence(text,directory){
  if(Buffer.byteLength(text)>65536)throw Error('Release evidence exceeds limit');
  let value;
  try{value=JSON.parse(text);}catch{throw Error('Invalid release evidence JSON');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Release evidence must be an object');
  await mkdir(directory,{recursive:true});
  const temporary=join(directory,'evidence.json.tmp');
  await writeFile(temporary,JSON.stringify(value),{mode:0o644});
  await rename(temporary,join(directory,'evidence.json'));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{await installEvidence(process.env.PLATFORM_RELEASE_EVIDENCE_JSON||'{}','/var/lib/solar-release');}
  catch{console.error('Could not install release evidence; check JSON shape and size');process.exitCode=1;}
}
