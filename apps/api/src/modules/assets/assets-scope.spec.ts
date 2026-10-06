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
test('admin asset collections ignore a legacy school assignment',async()=>{
 const {controller,calls}=fixture();
 await controller.listSchools({user:{role:'admin',schoolId:'school-a'}});
 await controller.listSites({user:{role:'admin',schoolId:'school-a'}});
 assert.deepEqual(calls,[[null,true],[null,true]]);
});
test('asset collection scope keeps school users isolated and legacy staff compatible',async()=>{
 const {controller,calls}=fixture();
 await controller.listSchools({user:{role:'school_user',schoolId:'school-a'}});
 await controller.listSites({user:{role:'school_user'}});
 await controller.listSites({user:{role:'operator',schoolId:'school-a'}});
 await controller.listSchools({user:{role:'accountant',schoolId:'school-a'}});
 assert.deepEqual(calls,[['school-a',true],[null,false],['school-a',true],['school-a',true]]);
});
