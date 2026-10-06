import assert from 'node:assert/strict';
import test from 'node:test';
import {periodDestination} from './period-destination';
test('Changing production period stays on production with the selected date range',()=>{
 assert.equal(periodDestination('/production','start_date=2026-10-01&end_date=2026-10-31'),'/production?start_date=2026-10-01&end_date=2026-10-31');
});
test('Changing home period stays on home',()=>{
 assert.equal(periodDestination('/','month=10&year=2026'),'/?month=10&year=2026');
});
