import test from 'node:test';
import assert from 'node:assert/strict';
import {resetReview} from './reset-operation.mjs';
const labels=volume=>({Name:`solar-financial-flow-review_${volume}`,Labels:{'com.docker.compose.project':'solar-financial-flow-review','com.docker.compose.volume':volume}});
function fixture(){const events=[];return {connectionString:'postgresql://127.0.0.1:15449/solar_financial_flow_review',events,pool:{query:async sql=>({rows:[sql.includes('current_database')?{name:'solar_financial_flow_review'}:sql.includes('count(*)')?{count:6}:{correlation_id:'solar-financial-flow-review-v1'}]}),end:async()=>{events.push('close');if(events.filter(x=>x==='close').length>1)throw Error('Called end twice');}},inspect:()=>['financial-postgres','financial-storage'].map(labels),remove:()=>events.push('remove')};}
test('actual reset operation dry run verifies without deletion and closes once',async()=>{const f=fixture();const result=await resetReview({...f,apply:false});assert.equal(result.apply,false);assert.deepEqual(f.events,['close']);});
test('apply closes once before destructive operation',async()=>{const f=fixture();await resetReview({...f,apply:true});assert.deepEqual(f.events,['close','remove']);});
test('verification failure closes once and never removes',async()=>{const f=fixture();f.inspect=()=>[labels('unrelated')];await assert.rejects(resetReview({...f,apply:true}));assert.deepEqual(f.events,['close']);});

