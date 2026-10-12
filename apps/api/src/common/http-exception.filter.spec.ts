import test from 'node:test';import assert from 'node:assert/strict';
import {ConflictException,type ArgumentsHost} from '@nestjs/common';import {AllExceptionsFilter} from './http-exception.filter.js';
test('future tariff conflict retains reviewable impact and upload errors return413',()=>{
 let status=0,body:Record<string,unknown>={};const response={status:(value:number)=>{status=value;return response;},json:(value:Record<string,unknown>)=>{body=value;}};
 const host={switchToHttp:()=>({getResponse:()=>response,getRequest:()=>({url:'/v1/billing-cycles/b/rate'})})} as unknown as ArgumentsHost;
 new AllExceptionsFilter().catch(new ConflictException({code:'FUTURE_RATE_REPLACEMENT_REQUIRED',message:'Confirm',futureRates:[{rate:'3.7'}],documents:[{documentNumber:'INV001'}],effectiveDate:'2026-10-01',secret:'private'}),host);
 assert.equal(status,409);assert.deepEqual(body.futureRates,[{rate:'3.7'}]);assert.deepEqual(body.documents,[{documentNumber:'INV001'}]);assert.equal(body.secret,undefined);
 new AllExceptionsFilter().catch(Object.assign(new Error('entity too large'),{type:'entity.too.large'}),host);assert.equal(status,413);
});
