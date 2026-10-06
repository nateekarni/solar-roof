import assert from 'node:assert/strict';

type PageSample = {ms:number;user?:number;path?:string;cache?:string;phase?:string;error?:unknown};

export function assertPageBudget(pages:PageSample[]) {
  assert.ok(pages.length,'Critical page samples are required');
  const failures=pages.filter(page=>!Number.isFinite(page.ms)||page.ms<0||page.ms>2000||page.error);
  assert.equal(failures.length,0,`Every critical page sample must be <=2000ms; ${failures.length}/${pages.length} failed: `+
    failures.map(page=>`user=${page.user??'?'} route=${page.path??'?'} cache=${page.cache??'?'} phase=${page.phase??'?'} ready=${page.ms.toFixed(1)}ms${page.error?' page-error=true':''}`).join('; '));
}
