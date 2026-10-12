import assert from 'node:assert/strict';import test from 'node:test';import {createHmac} from 'node:crypto';import {AuthService} from './auth.service.js';
const access='access-secret-access-secret-access-secret',refresh='refresh-secret-refresh-secret-refresh-secret';
function oldToken(secret:string,type:string){const body=Buffer.from(JSON.stringify({sub:'user',email:'customer@example.invalid',role:'school_user',schoolId:'customer-id',sid:'session',typ:type,exp:Math.floor(Date.now()/1000)+300})).toString('base64url');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');}
test('signed legacy customer sessions retain identical scope without exposing old claims',()=>{
 const auth=new AuthService(access,refresh);
 for(const result of [auth.verifyAccessToken(oldToken(access,'access')),auth.verifyRefreshToken(oldToken(refresh,'refresh'))]){assert.equal(result.role,'customer_user');assert.equal(result.customerId,'customer-id');assert.equal('schoolId' in result,false);}
 assert.throws(()=>auth.verifyAccessToken(oldToken(refresh,'access')),/Invalid token/);
 const tokens=auth.issueTokens({id:'user',email:'customer@example.invalid',role:'customer_user',customerId:'customer-id'},'session');
 const claims=JSON.parse(Buffer.from(tokens.accessToken.split('.')[0]!,'base64url').toString());assert.equal(claims.role,'customer_user');assert.equal(claims.customerId,'customer-id');assert.equal('schoolId' in claims,false);
});
