import test from 'node:test';
import assert from 'node:assert/strict';
import {assertReviewTarget} from './guard.mjs';
import * as guard from './guard.mjs';
test('generic seed entrypoints reject production and unknown databases before Docker operations',()=>{
 assert.equal(typeof guard.assertLocalSeedTarget,'function');
 for(const url of ['postgresql://u:p@production:5432/solar_platform','postgresql://u:p@127.0.0.1:5432/production'])assert.throws(()=>guard.assertLocalSeedTarget(url,{NODE_ENV:'development'}));
 assert.throws(()=>guard.assertLocalSeedTarget('postgresql://u:p@127.0.0.1:15449/solar_financial_flow_review',{NODE_ENV:'production'}));
});
test('seed rejects production environments and remote Docker daemons',()=>{
 assert.equal(typeof guard.assertLocalDockerEvidence,'function');
 const evidence={endpoint:'npipe:////./pipe/docker_engine',container:{State:{Running:true},Config:{Labels:{'com.docker.compose.project':'solar-dashboard-review','com.docker.compose.service':'postgres'},Env:['POSTGRES_DB=solar_dashboard_review']},NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'127.0.0.1',HostPort:'15439'}]}}}};
 assert.doesNotThrow(()=>guard.assertLocalDockerEvidence(evidence,'review',{NODE_ENV:'development'}));
 for(const env of [{NODE_ENV:'production'},{NODE_ENV:'staging'},{NODE_ENV:'development',DOCKER_HOST:'tcp://remote:2375'}])assert.throws(()=>guard.assertLocalDockerEvidence(evidence,'review',env));
 assert.throws(()=>guard.assertLocalDockerEvidence({...evidence,endpoint:'ssh://remote'},'review',{NODE_ENV:'development'}));
 assert.throws(()=>guard.assertLocalDockerEvidence({...evidence,container:{...evidence.container,NetworkSettings:{Ports:{'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'15439'}]}}}},'review',{NODE_ENV:'development'}));
});
test('only the dedicated loopback review database is writable',()=>{
 assert.doesNotThrow(()=>assertReviewTarget('postgresql://review:local@127.0.0.1:15439/solar_dashboard_review','solar_dashboard_review'));
 for(const url of ['postgresql://u:p@production:5432/solar_dashboard_review','postgresql://u:p@127.0.0.1:5432/solar_platform','postgresql://u:p@localhost:15439/solar_dashboard_review'])assert.throws(()=>assertReviewTarget(url,'solar_dashboard_review'));
 assert.throws(()=>assertReviewTarget('postgresql://u:p@127.0.0.1:15439/solar_dashboard_review','production'));
 assert.throws(()=>assertReviewTarget('postgresql://u:p@127.0.0.1:15439/solar_dashboard_review?host=production','solar_dashboard_review'));
});
