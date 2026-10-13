import test from 'node:test';import assert from 'node:assert/strict';import {apiErrorMessage} from './api-error-message';
test('account verification errors explain the input to correct instead of requesting login',()=>{
 assert.equal(apiErrorMessage(401,'Current password is incorrect','th'),'รหัสผ่านปัจจุบันไม่ถูกต้อง');
 assert.equal(apiErrorMessage(401,'Invalid second factor','th'),'รหัสยืนยันไม่ถูกต้องหรือถูกใช้แล้ว กรุณาใช้รหัสใหม่');
 assert.equal(apiErrorMessage(429,'Too many second-factor attempts; retry in 5 minutes','th'),'ลองรหัสยืนยันเกินจำนวนที่กำหนด กรุณารอ 5 นาทีแล้วลองอีกครั้ง');
 assert.equal(apiErrorMessage(401,'Unauthorized','th'),'กรุณาเข้าสู่ระบบอีกครั้ง');
 assert.match(apiErrorMessage(401,'Invalid or expired reset link','th'),/ลิงก์.*หมดอายุ/);
 assert.match(apiErrorMessage(401,'Valid second factor is required','th'),/รหัสยืนยัน/);
});
test('API validation and revocation messages use the selected language without exposing English validation text in Thai',()=>{assert.doesNotMatch(apiErrorMessage(400,'Invalid topic contract','th'),/[A-Za-z]/);assert.match(apiErrorMessage(403,'Forbidden','en'),/permissions/);assert.match(apiErrorMessage(409,'Stale revision','th'),/โหลดข้อมูลล่าสุด/);assert.equal(apiErrorMessage(400,'กรุณายืนยันข้อมูล','th'),'กรุณายืนยันข้อมูล');});

test('known business validation explains the specific next step instead of generic reload advice',()=>{
 assert.match(apiErrorMessage(409,'Impact changed; preview again','en'),/preview/i);
 assert.match(apiErrorMessage(409,'Confirm future rates replacement','th'),/อัตรา.*อนาคต/);
 assert.match(apiErrorMessage(409,'Customer already exists','en'),/existing customer/i);
 assert.match(apiErrorMessage(400,'Recipients required','th'),/ผู้รับ/);
 assert.match(apiErrorMessage(409,'Confirmed accounting tax configuration required','en'),/tax/i);
});
test('branding API rejection explains image correction in either language',()=>{
 assert.match(apiErrorMessage(400,'Company logo must be a PNG/JPEG image up to 1 MB','en'),/PNG\/JPEG.*1 MB/);
 assert.match(apiErrorMessage(400,'Signatory image must be a PNG/JPEG image up to 1 MB','th'),/PNG\/JPEG.*1 MB/);
 assert.match(apiErrorMessage(400,'Logo must be a PNG/JPEG image up to 1 MB','en'),/PNG\/JPEG.*1 MB/);
 assert.match(apiErrorMessage(400,'Signature must be a PNG/JPEG image up to 1 MB','th'),/PNG\/JPEG.*1 MB/);
});
