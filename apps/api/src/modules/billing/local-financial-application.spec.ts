import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';
import { reviewedActualEnergyDifference } from './local-financial-application.service.js';
test('exact cumulative counter reset requires typed conflict and review',()=>{
 assert.throws(()=>reviewedActualEnergyDifference('10000.0006','10000.0004'),error=>error instanceof ConflictException&&error.getStatus()===409&&/Meter reset requires review/.test(error.message));
 assert.equal(reviewedActualEnergyDifference('10000.0004','10000.0006'),'0.000');
});