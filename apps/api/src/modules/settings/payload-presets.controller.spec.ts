import assert from 'node:assert/strict';
import test from 'node:test';
import { PayloadPresetsController } from './payload-presets.controller.js';
import { DEFAULT_PAYLOAD_PROFILES } from '../telemetry/payload-profile.js';
test('invalid executable profile config is rejected before writing',async()=>{let writes=0;const c=new PayloadPresetsController({query:async()=>{writes++;return {rows:[]};}} as any);await assert.rejects(c.create({config:{...DEFAULT_PAYLOAD_PROFILES[0],expression:'code'}}));assert.equal(writes,0);});
test('immutable revision version collision returns conflict',async()=>{const c=new PayloadPresetsController({query:async()=>{throw Object.assign(Error('duplicate'),{code:'23505'});}} as any);await assert.rejects(c.create({config:DEFAULT_PAYLOAD_PROFILES[0]}),e=>(e as any).status===409);});
