export function apiErrorMessage(status:number,message:unknown,locale:'th'|'en'){
 const text=Array.isArray(message)?message.join(' · '):typeof message==='string'?message:'';
 if(status===400&&/^(Logo|Signature|Company logo|Signatory image) must be a PNG\/JPEG image up to 1 MB$/.test(text))return locale==='th'?'เลือกภาพ PNG/JPEG ขนาดไม่เกิน 1 MB แล้วลองบันทึกอีกครั้ง':'Choose a PNG/JPEG image up to 1 MB and save again.';
 const business:Record<string,readonly [string,string]>={
  'Impact changed; preview again':['ข้อมูลอัตราค่าไฟเปลี่ยนแล้ว กรุณากลับไปตรวจผลกระทบใหม่ก่อนยืนยัน','Rates have changed. Go back and preview the impact again before confirming.'],
  'Confirm future rates replacement':['กรุณาตรวจสอบและยืนยันการแทนที่อัตราค่าไฟที่กำหนดไว้ในอนาคต','Review and confirm replacement of the scheduled future rates.'],
  'Confirm replacement of scheduled future site tariffs':['กรุณาตรวจสอบและยืนยันการแทนที่อัตราค่าไฟที่กำหนดไว้ในอนาคต','Review and confirm replacement of the scheduled future rates.'],
  'Customer already exists':['มีลูกค้ารายนี้แล้ว กรุณาเลือกลูกค้าที่มีอยู่','This customer already exists. Select the existing customer.'],
  'Site already exists':['รหัสไซต์งานนี้ถูกใช้แล้ว กรุณาใช้รหัสอื่นหรือเปิดไซต์งานเดิม','This site code is already in use. Choose another code or open the existing site.'],
  'Device serial number already exists':['หมายเลขเครื่องนี้ถูกใช้แล้ว กรุณาตรวจสอบอุปกรณ์เดิมหรือแก้หมายเลข','This serial number is already in use. Check the existing device or correct the serial number.'],
  'Customer name is required':['กรุณาระบุชื่อลูกค้า','Enter the customer name.'],
  'Name required':['กรุณาระบุชื่อก่อนบันทึก','Enter a name before saving.'],
  'Recipients required':['กรุณาเลือกผู้รับเอกสารอย่างน้อยหนึ่งคน','Select at least one document recipient.'],
  'Verified active assigned recipients required':['กรุณาเลือกผู้รับที่เปิดใช้งาน ยืนยันอีเมลแล้ว และได้รับสิทธิ์ในไซต์งานนี้','Choose active recipients with verified email and access to this site.'],
  'Confirmed accounting tax configuration required':['กรุณาให้ฝ่ายบัญชียืนยันการตั้งค่าภาษีของไซต์งานก่อนสร้างใบวางบิล','Ask accounting to confirm this site’s tax settings before creating a bill.'],
  'Tax exceeds 100 percent':['อัตราภาษีต้องไม่เกิน 100% กรุณาตรวจสอบค่าที่กรอก','Tax cannot exceed 100%. Check the entered rate.'],
  'Select sites':['กรุณาเลือกไซต์งานอย่างน้อยหนึ่งไซต์','Select at least one site.'],
  'Reason required':['กรุณาระบุเหตุผลในการเปลี่ยนแปลง','Enter a reason for the change.'],
  'Selection, date and reason required':['กรุณาระบุขอบเขต วันที่มีผล และเหตุผลให้ครบ','Choose the scope, a valid effective date, and a reason.'],
  'Reminder start and positive interval required':['กรุณาระบุวันเริ่มทวงชำระและระยะห่างระหว่างการแจ้งเตือนที่มากกว่า 0 วัน','Enter the reminder start day and an interval greater than zero days.'],
 };
 if((status===400||status===409)&&business[text])return business[text]![locale==='th'?0:1];
 if(status===403)return locale==='th'?'สิทธิ์ของคุณเปลี่ยนแล้ว กรุณาเลือกการดำเนินการที่ยังอนุญาต':'Your permissions have changed. Choose an action you are still allowed to perform.';
 if(status===409)return locale==='th'?'ข้อมูลถูกเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง':'This information has changed. Reload the latest data before saving again.';
 if(status===0)return locale==='th'?'ไม่สามารถเชื่อมต่อได้ กรุณาตรวจสอบอินเทอร์เน็ตและลองอีกครั้ง':'Unable to connect. Check your internet connection and try again.';
 if(status>=500)return locale==='th'?'ระบบไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองอีกครั้ง':'The service is temporarily unavailable. Please try again.';
 if(locale==='en'){
  const known:Record<string,string>={
   'Current password is incorrect':'Your current password is incorrect. Check it and try again.',
   'Invalid second factor':'This verification code is invalid or already used. Enter a new code.',
   'Valid second factor is required':'Enter a verification code or an unused recovery code.',
   'Invalid or expired reset link':'This reset link is invalid or expired. Request a new link.',
   'Pending enrollment is missing or expired':'This setup has expired. Start verification setup again.',
   'Too many second-factor attempts; retry in 5 minutes':'Too many attempts. Wait 5 minutes and try again.',
   'Too many authentication requests, please try again in 1 minute':'Too many requests. Wait 1 minute and try again.',
  };
  if(known[text])return known[text];
  if(status===401)return 'Your session has expired. Sign in again.';
  if(status===404)return 'This item is unavailable. Return to the list and refresh it.';
  if(status===429)return 'Too many requests. Wait a moment and try again.';
  return 'The request could not be completed. Check the information and try again.';
 }
 if(/[ก-๙]/.test(text)&&!/[A-Za-z]{3,}/.test(text))return text;
 if(status===401&&text==='Current password is incorrect')return 'รหัสผ่านปัจจุบันไม่ถูกต้อง';
 if(status===401&&text==='Invalid second factor')return 'รหัสยืนยันไม่ถูกต้องหรือถูกใช้แล้ว กรุณาใช้รหัสใหม่';
 if(status===401&&text==='Valid second factor is required')return 'กรุณาใช้รหัสยืนยันสองขั้นตอนหรือรหัสกู้คืนที่ยังไม่ได้ใช้';
 if(status===401&&text==='Invalid or expired reset link')return 'ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง ถูกใช้แล้ว หรือหมดอายุ กรุณาขอลิงก์ใหม่';
 if(status===400&&text==='Pending enrollment is missing or expired')return 'การตั้งค่ายืนยันตัวตนหมดอายุ กรุณาเริ่มตั้งค่าใหม่';
 if(status===429&&text==='Too many second-factor attempts; retry in 5 minutes')return 'ลองรหัสยืนยันเกินจำนวนที่กำหนด กรุณารอ 5 นาทีแล้วลองอีกครั้ง';
 if(status===429&&text==='Too many authentication requests, please try again in 1 minute')return 'ส่งคำขอยืนยันตัวตนถี่เกินไป กรุณารอ 1 นาทีแล้วลองอีกครั้ง';
 if(status===401)return 'กรุณาเข้าสู่ระบบอีกครั้ง';
 if(status===404)return 'ไม่พบข้อมูลที่ต้องการ หรือคุณไม่มีสิทธิ์เข้าถึงข้อมูลนี้';
 if(status>=500)return 'ระบบไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองอีกครั้ง';
 if(/confirm|preview/i.test(text))return 'กรุณาตรวจสอบตัวอย่างและยืนยันการเปลี่ยนแปลงก่อนบันทึก';
 if(/cadence|interval/i.test(text))return 'กรุณาตรวจสอบรอบรับข้อมูลให้อยู่ในช่วงที่กำหนด';
 if(/topic|gateway.*identity/i.test(text))return 'กรุณาตรวจสอบหัวข้อรับข้อมูลให้ตรงกับรหัสไซต์งานและเกตเวย์';
 if(/pair|source|field|register/i.test(text))return 'กรุณาตรวจสอบอุปกรณ์ รายการข้อมูล และแหล่งข้อมูลให้ตรงกับการตั้งค่า';
 return 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบข้อมูลและลองอีกครั้ง';
}
