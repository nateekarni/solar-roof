import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerAuthRateLimits} from './auth-rate-limits.js';
test('status reads do not consume mutations and factor/reset limits are independent from shared login/refresh',async()=>{
 const app=express();registerAuthRateLimits(app);app.use((_req,res)=>res.status(200).end());
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}`;
 const request=(path:string,method='POST')=>fetch(base+'/v1/auth/'+path,{method});
 for(let i=0;i<12;i++)assert.equal((await request('two-factor',i%2?'HEAD':'GET')).status,200);
 for(let i=0;i<10;i++)assert.equal((await request(i%2?'refresh':'login')).status,200);
 assert.equal((await request('login')).status,429);
 for(let i=0;i<10;i++)assert.equal((await request('two-factor/enroll')).status,200);
 assert.equal((await request('two-factor/enroll')).status,429);
 assert.equal((await request('two-factor','GET')).status,200);
 for(let i=0;i<10;i++)assert.equal((await request('password-reset/request')).status,200);
 assert.equal((await request('password-reset/request')).status,429);
 }finally{await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
