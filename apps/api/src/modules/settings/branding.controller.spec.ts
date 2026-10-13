import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { BrandingController } from './branding.controller.js';
import { SettingsService } from './settings.service.js';
import { settingsDatabase, testCompany } from './company-settings.test-fixtures.js';
import { JwtAuthGuard } from '../identity/jwt.guard.js';
import { PlatformAccessGuard } from '../../common/auth/platform-access.guard.js';
import { RolesGuard } from '../../common/roles.guard.js';
import { RequestOriginGuard } from '../../common/auth/request-origin.guard.js';

async function serve(logoUrl:string,work:(url:string)=>Promise<void>) {
  const f=settingsDatabase({...testCompany,logoUrl});
  @Module({controllers:[BrandingController],providers:[{provide:SettingsService,useValue:new SettingsService(f.db)}]})
  class TestModule {}
  const app=await NestFactory.create(TestModule,{logger:false});
  const reflector=new Reflector();
  app.useGlobalGuards(new RequestOriginGuard(),new JwtAuthGuard({} as any,reflector,f.db,{} as any,{} as any),new RolesGuard(reflector),new PlatformAccessGuard(f.db,reflector));
  await app.listen(0,'127.0.0.1');
  try{await work(await app.getUrl());}finally{await app.close();}
}
test('public logo returns only configured image bytes without authentication and supports ETag revalidation',async()=>{
  const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
  await serve(`data:image/png;base64,${bytes.toString('base64')}`,async url=>{
    const response=await fetch(`${url}/v1/public/branding/logo`,{headers:{Origin:'https://another.example'}});
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
    assert.equal(response.headers.get('cache-control'),'public, max-age=300, must-revalidate');
    const etag=`"${createHash('sha256').update(bytes).digest('hex')}"`;assert.equal(response.headers.get('etag'),etag);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    const cached=await fetch(`${url}/v1/public/branding/logo`,{headers:{'If-None-Match':etag}});
    assert.equal(cached.status,304);assert.equal(await cached.text(),'');
    const head=await fetch(`${url}/v1/public/branding/logo`,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
    const mutation=await fetch(`${url}/v1/public/branding/logo`,{method:'POST',headers:{Origin:'https://another.example'}});assert.equal(mutation.status,404);
  });
});
test('missing, legacy and invalid configured logos serve bundled fallback bytes',async()=>{
  const bytes=await readFile(new URL('../../../../web/public/brand/solar-roof-mark.png',import.meta.url));
  for(const value of ['', '/brand/solar-roof-mark.png','data:image/png;base64,AA=='])await serve(value,async url=>{
    const response=await fetch(`${url}/v1/public/branding/logo`);assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
  });
});
