import test from 'node:test';import assert from 'node:assert/strict';
import {ConflictException,ServiceUnavailableException,type ArgumentsHost} from '@nestjs/common';import {AllExceptionsFilter} from './http-exception.filter.js';
test('position duplicate conflicts expose only the reusable display identity',()=>{
 let body:Record<string,unknown>={};const response={status:()=>response,json:(value:Record<string,unknown>)=>{body=value;}};
 const host={switchToHttp:()=>({getResponse:()=>response,getRequest:()=>({url:'/v1/team/employees'})})} as unknown as ArgumentsHost;
 const position={id:'00000000-0000-0000-0000-000000000003',name:'Finance',rules:{secret:true},signature:'private'};
 new AllExceptionsFilter().catch(new ConflictException({code:'POSITION_NAME_EXISTS',message:'Review existing preset',position,secret:'private'}),host);
 assert.equal(body.code,'POSITION_NAME_EXISTS');assert.deepEqual(body.position,{id:position.id,name:'Finance'});assert.equal(body.secret,undefined);
});
test('future tariff conflict retains reviewable impact and upload errors return413',()=>{
 let status=0,body:Record<string,unknown>={};const response={status:(value:number)=>{status=value;return response;},json:(value:Record<string,unknown>)=>{body=value;}};
 const host={switchToHttp:()=>({getResponse:()=>response,getRequest:()=>({url:'/v1/billing-cycles/b/rate'})})} as unknown as ArgumentsHost;
 new AllExceptionsFilter().catch(new ConflictException({code:'FUTURE_RATE_REPLACEMENT_REQUIRED',message:'Confirm',futureRates:[{rate:'3.7'}],documents:[{documentNumber:'INV001'}],effectiveDate:'2026-10-01',secret:'private'}),host);
 assert.equal(status,409);assert.deepEqual(body.futureRates,[{rate:'3.7'}]);assert.deepEqual(body.documents,[{documentNumber:'INV001'}]);assert.equal(body.secret,undefined);
 new AllExceptionsFilter().catch(Object.assign(new Error('entity too large'),{type:'entity.too.large'}),host);assert.equal(status,413);
});

test('finance failures retain safe prerequisites and action context while excluding SMTP values',()=>{
 let body:Record<string,unknown>={};const response={status:()=>response,json:(value:Record<string,unknown>)=>{body=value;}};
 const host={switchToHttp:()=>({getResponse:()=>response,getRequest:()=>({url:'/v1/billing-cycles'})})} as unknown as ArgumentsHost;
 const siteId='6af5c988-1d48-4f6f-b8a7-d48d9bfc6129';
 new AllExceptionsFilter().catch(new ServiceUnavailableException({code:'FINANCIAL_NOT_READY',message:'Not ready',missing:['approval.confirmation','site.tax','environment.smtp','smtp-password','environment.password','site.tax',{}],context:{siteId,periodStart:'2026-09-01',periodEnd:'2026-09-30',SMTP_HOST:'private-smtp',SMTP_PASSWORD:'private-password'},secret:'private-secret'}),host);
 assert.equal(body.statusCode,503);assert.deepEqual(body.missing,['approval.confirmation','site.tax','environment.smtp']);
 assert.deepEqual(body.context,{siteId,periodStart:'2026-09-01',periodEnd:'2026-09-30'});
 assert.ok(!JSON.stringify(body).includes('private-'));
 new AllExceptionsFilter().catch(new ConflictException({code:'OTHER',message:'Conflict',missing:['approval.confirmation'],context:{siteId},secret:'private-secret'}),host);
 assert.equal(body.missing,undefined);assert.equal(body.context,undefined);
});
