import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetsController } from './assets.controller.js';
import type { DatabaseService } from '../../database/database.service.js';
import type { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';
function fixture(){
 const calls:unknown[][]=[];
 const db={query:async(_sql:string,params:unknown[])=>{calls.push(params);return {rows:[]};}};
 return {calls,controller:new AssetsController(db as unknown as DatabaseService,{} as MqttIngestionService)};
}
test('admin has no business asset collection scope',async()=>{
 const {controller,calls}=fixture();
 await controller.listCustomers({user:{role:'admin',customerId:'customer-a'}});
 await controller.listSites({user:{role:'admin',customerId:'customer-a'}});
 assert.deepEqual(calls,[[[]],[[]]]);
});
test('asset collection scopes fail closed without a single assignment or explicit employee grant',async()=>{
 const {controller,calls}=fixture();
 await controller.listCustomers({user:{role:'customer_user',customerId:'customer-a'}});
 await controller.listSites({user:{role:'customer_user'}});
 await controller.listSites({user:{role:'operator',customerId:'customer-a'}});
 await controller.listCustomers({user:{role:'accountant',customerId:'customer-a'}});
 assert.deepEqual(calls,[[[]],[[]],[[]],[[]]]);
});
