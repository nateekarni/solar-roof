# ประเมิน OCR หลักฐานการชำระเงินภายในระบบ

สถานะ: เก็บเป็นประวัติการศึกษา ผู้ใช้ยกเลิก OCR แล้วเมื่อ 9 ตุลาคม 2026 ไม่อยู่ในขอบเขต implementation ให้ใช้ flow แนบหลักฐานอย่างง่ายในแบบระบบฉบับล่าสุดแทน

วันที่ศึกษา: 9 ตุลาคม 2026 — ข้อกำหนด Q28–Q29: แนบรูปแล้วอ่านข้อมูลเติมแบบฟอร์ม ลูกค้าตรวจแก้ก่อนส่ง เจ้าหน้าที่ตรวจรายการโอนจริงอีกครั้ง

## ข้อเสนอ

ทำภายในระบบได้ในเชิงเทคนิค แนะนำเริ่ม DEMO ด้วย OCR บน CPU แยก worker ประมวลผลผ่านคิวครั้งละหนึ่งงาน ไม่ซื้อ GPU ล่วงหน้า เปรียบเทียบ Tesseract กับโมเดลภาษาไทยของ PaddleOCR บนหลักฐานจริงก่อนเลือกใช้ production ข้อสรุปนี้เป็นข้อเสนอทางสถาปัตยกรรม ไม่ใช่ผล benchmark

เครื่องปัจจุบันเป็น DEMO ตามคำตอบผู้ใช้; production จะจัดตามจำนวนลูกค้าและขยายภายหลัง Comment ใน `infra/docker/docker-compose.staging.yml` กล่าวถึง pilot 2 vCPU / 4 GiB แต่ยังไม่มีหลักฐานว่าเป็นสเปกเครื่องจริงปัจจุบัน และผล idle ใน `docs/deployment/verification.md` ไม่รับรอง peak load ต้องวัดการใช้ทรัพยากรจริงก่อนแบ่ง RAM ให้ OCR

## ตัวเลือกที่ตรวจสอบจากแหล่งหลัก

| ตัวเลือก | ข้อเท็จจริงและผลต่อการเลือก |
| --- | --- |
| Tesseract + `tha+eng` จาก tessdata_fast | มีภาษาไทย/อังกฤษ; fast ใช้โมเดล integer และเครือข่ายเล็กกว่า best เหมาะเป็น baseline CPU ที่ติดตั้งและดูแลง่าย ไม่รับรองความแม่นยำกับสลิปธนาคาร [ภาษา](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html), [fast](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-tessdata_fast.html) |
| Tesseract + tessdata_best | เอกสารระบุ best ช้ากว่าและให้ผลดีกว่าบนชุดประเมินของ Google; fast/best ต้องใช้ LSTM (`--oem 1`) จึงควรลอง best เมื่อ fast อ่านไม่ดี แทนการสันนิษฐานว่าจะแม่นกับสลิปเสมอ [ชุดโมเดล](https://tesseract-ocr.github.io/tessdoc/Data-Files.html) |
| PaddleOCR detector + `th_PP-OCRv5_mobile_rec` | โมเดลนี้รองรับไทยและอังกฤษโดยเฉพาะ ต้องเลือกให้ชัดเจน ไม่ใช้ default v5 recognizer แล้วถือว่ารองรับไทย โมเดล recognizer อย่างเดียวไม่ใช่ pipeline ทั้งภาพ ยังต้องมี detector และการแยก field เอกสารรายงาน 82.68% บนภาพข้อความไทย 4,261 ภาพ ซึ่งไม่ใช่ความถูกต้องของยอดเงินบนสลิป [เอกสารโมเดลภาษา](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html) |

Tesseract และ PaddleOCR repositories ใช้ Apache-2.0; ต้องเก็บ license/notice และตรวจ license ของ model artifact, runtime และ dependency ที่ pin จริงด้วยก่อนแจกจ่าย image [Tesseract LICENSE](https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE), [PaddleOCR LICENSE](https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE)

PaddleOCR มีการกำหนด device CPU และ `cpu_threads`; ค่า threads ในเอกสารเป็น 10 จึงต้องตั้งเองสำหรับเครื่อง DEMO ขนาดเล็ก [OCR pipeline](https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/OCR.html) ส่วน Tesseract รองรับ `OMP_THREAD_LIMIT=1` และเอกสารเตือน overhead เมื่อ threads เกินจำนวน core [FAQ](https://tesseract-ocr.github.io/tessdoc/FAQ.html)

## ทรัพยากรและขอบเขต DEMO

ค่าต่อไปนี้เป็นงบทดลองที่เสนอ ไม่ใช่ minimum specification ของโมเดลหรือผลวัด:

- worker concurrency = 1, เริ่ม CPU cap 0.5–1 vCPU และ inference threads = 1; งานหน้าเว็บ/API ไม่รอ OCR ใน request เดียว
- ทดลอง RAM budget 512 MiB–1 GiB สำหรับ Tesseract และ 1–2 GiB สำหรับ PaddleOCR เฉพาะเมื่อเครื่องมี headroom จริง หากไม่พอให้ worker แยกเครื่อง/เพิ่ม DEMO RAM; ห้ามสรุปว่าตัวเลขนี้เพียงพอก่อนวัด peak RSS และ cold start
- ขนาด model file ไม่เท่ากับ RAM รวม: ยังมี runtime, detector, tensor/cache, decode ภาพ และ PDF rendering; ไม่มี RAM/speed ของ pipeline สลิปบนเครื่องนี้ที่ยืนยันแล้ว
- จำกัดจำนวน pixel/ไฟล์/หน้าและเวลาแต่ละ job ให้สอดคล้องกับผลทดสอบ มี timeout และ retries จำกัด; OCR ล้มเหลวต้องกรอกเองและส่งหลักฐานได้
- pin version และ checksum โมเดลไว้ใน image/volume ล่วงหน้า ไม่ download โมเดลระหว่างรับคำขอลูกค้า; runtime ประมวลผลไฟล์ในระบบ ไม่ส่งรูปออกไปภายนอก

การหมุนภาพ ล้าง noise และแก้ skew อาจช่วย แต่ preprocessing ต้องทดสอบกับภาพจริง ไม่ปรับจนตัวเลขหาย [แนวทางคุณภาพ Tesseract](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html)

## Flow และข้อมูลที่เก็บ

Upload → queued → processing → extracted/failed → ลูกค้าตรวจแก้ → ส่งหลักฐาน → รอตรวจเจ้าหน้าที่ แสดงภาพคู่ยอด วันเวลา ธนาคาร ผู้โอน และเลขอ้างอิง; ช่องอ่านไม่ได้เป็นค่าว่าง ช่องไม่แน่ใจต้องเน้นให้ตรวจ อย่าใส่ค่าจากยอดบิลแทนผลอ่านโดยเงียบ ๆ

เก็บ raw OCR, engine/model version, confidence/ตำแหน่งข้อความเมื่อมี, ค่าที่เสนอ และค่าที่ผู้ใช้ยืนยันแยกกัน การเปลี่ยนรูปต้อง invalidate ผลเดิม และผล job เก่าห้ามเขียนทับค่าที่ผู้ใช้แก้แล้ว จำกัดสิทธิ์ตามไซต์; ข้อความในภาพเป็นข้อมูล ไม่ใช่คำสั่งระบบ

OCR อ่านสิ่งที่ปรากฏในรูป ไม่พิสูจน์ว่าโอนจริงและไม่อนุมัติชำระอัตโนมัติ คงขั้นตรวจแยกรายการและประวัติการอนุมัติตามแผนระบบ

## ความคุ้มค่าและการขยาย production

ยังไม่มีจำนวนหลักฐาน/เดือน ราคา infrastructure หรือข้อมูลเวลาประมวลผล จึงไม่สามารถสรุปต้นทุนบาทต่อรูปหรือจำนวนลูกค้าที่รองรับได้โดยไม่สร้างตัวเลขขึ้นเอง

ให้ `N` = หลักฐานต่อเดือน, `F` = ค่าเครื่อง OCR เพิ่มต่อเดือน, `O` = ค่า maintenance ต่อเดือน, `v` = ค่า compute/storage ต่อรูป, `h` = ค่าเวลาคนตรวจแก้ต่อรูป: ต้นทุน local = `F + O + N(v + h)` เทียบทางเลือกภายนอก `N(p + h_external) + O_external` โดย `p` เป็นราคาจริงที่ขอภายหลัง และคิดข้อจำกัดข้อมูลแยกจากต้นทุน

สำหรับเทียบ local กับกรอกเอง ถ้าประหยัดเวลาได้ `s` นาที/หลักฐาน และต้นทุนแรงงาน `w` บาท/นาที จุดคุ้มทุนโดยประมาณ `N = (F + O) / (s*w - v)` ใช้ได้เมื่อส่วนหารเป็นบวกและรวมต้นทุนพัฒนาแบบเฉลี่ยตามช่วงเวลาที่เลือกแล้ว ต้องวัดเวลาตรวจแก้จริงด้วย เพราะ OCR ที่ผิดบ่อยอาจไม่ประหยัดเวลา

เมื่อทราบเวลาเฉลี่ยงาน `t` วินาที และมี worker `k` ตัว throughput เชิงทฤษฎีคือ `k*3600/t` งาน/ชั่วโมง ก่อนคิด burst, retry และ headroom ใช้ queue depth, p95 เวลารอ/ประมวลผล, CPU/RAM และเวลาแก้ของคนตัดสินขยาย: เพิ่ม RAM/แยก CPU worker ก่อน เพิ่ม worker เมื่อโหลดพิสูจน์ว่าจำเป็น และพิจารณา GPU เฉพาะเมื่อ benchmark/ต้นทุนแสดงประโยชน์

## การพิสูจน์ก่อนเลือก engine

ยังไม่มีชุดสลิปจริงให้ทดสอบ และการศึกษานี้ไม่ได้ติดตั้ง engine/download โมเดลหรือรัน benchmark ขั้นถัดไปคือรวบรวมหลักฐานที่ได้รับอนุญาตและปกปิดข้อมูลส่วนตัวตามเหมาะสม ครอบคลุมแต่ละธนาคาร screenshot/รูปถ่าย ภาษาไทย/อังกฤษ มุมเอียง ภาพเบลอและอัดซ้ำ จัด ground truth แยกชุดพัฒนา/ชุดตรวจรับ

เปรียบเทียบทั้งสาม config ด้วย exact-match ราย field โดยเฉพาะยอด/วันเวลา/เลขอ้างอิง, อัตราต้องแก้เอง, p50/p95 processing และ queue latency, peak RSS, cold start และผลต่อ API/telemetry ภายใต้ burst ห้ามใช้ค่าเฉลี่ยความแม่นยำข้อความแทนความถูกต้องยอดเงิน ตั้งเป้าหมายตรวจรับร่วมกับทีมหลังเห็น baseline; ฟอร์มกรอกเองและการตรวจเจ้าหน้าที่ยังคงใช้ได้เสมอ
