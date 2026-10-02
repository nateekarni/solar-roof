import assert from 'node:assert/strict';
import test from 'node:test';
import {formatPower} from './power-format';

test('power retains small measured values, direction and missing state across units',()=>{
  assert.deepEqual(formatPower(1200,'en'),{value:'1.2',unit:'kW',state:'measured'});
  assert.deepEqual(formatPower(null,'en'),{value:'No data',unit:'',state:'missing'});
  assert.deepEqual(formatPower(Number.NaN,'th'),{value:'ไม่มีข้อมูล',unit:'',state:'missing'});
  assert.deepEqual(formatPower(0,'en'),{value:'0',unit:'W',state:'measured'});
  assert.deepEqual(formatPower(999,'en'),{value:'999',unit:'W',state:'measured'});
  assert.deepEqual(formatPower(1000,'en'),{value:'1',unit:'kW',state:'measured'});
  assert.deepEqual(formatPower(1000000,'en'),{value:'1',unit:'MW',state:'measured'});
  assert.deepEqual(formatPower(-1200,'en'),{value:'-1.2',unit:'kW',state:'measured'});
  assert.deepEqual(formatPower(0.00001,'en'),{value:'<0.001',unit:'W',state:'measured'});
  assert.deepEqual(formatPower(-0.00001,'en'),{value:'>-0.001',unit:'W',state:'measured'});
  assert.equal(formatPower(1234.5678,'en').value,'1.235');
});
