# 2. Login Security Hardening, API Reverse Proxy and Cloudflare Tunnel

## Status
Accepted

## Context
ในการทดสอบเข้าใช้งานระบบจากเครือข่ายภายนอก (Public Internet) พบข้อบกพร่องด้านความปลอดภัยและการทำงาน 2 ประการ:
1. การ Submit ฟอร์มเข้าสู่ระบบโดยไม่มีคุณสมบัติ `method="POST"` ส่งผลให้เบราว์เซอร์ใช้ Native GET Request ส่งพารามิเตอร์รหัสผ่านไปบน URL Address Bar (`?email=...&password=...`) เมื่อ JavaScript กำลัง Hydrate หรือมี Error
2. โค้ดหน้า Login เดิมมี Fallback ไปยัง `http://localhost:3001` ซึ่งถูกเบราว์เซอร์ภายนอกบล็อกด้วยนโยบาย Mixed Content (HTTPS -> HTTP) และชี้ไปผิดเครื่อง
3. เครื่องมือ Tunnel เดิม (Localtunnel) มีหน้า Interstitial Banner แจ้งเตือนรหัสผ่าน ทำให้เบราว์เซอร์มือถือโหลด JS Chunks ไม่สมบูรณ์จน React ไม่ Hydrate

## Decision
1. **Form Security Hardening**:
   - กำหนด `method="POST"` และ `action=""` ในแท็ก `<form>` เพื่อป้องกัน Native Form จากการส่งข้อมูลผ่าน Query String โดยเด็ดขาด
   - เพิ่ม Explicit Event Prevention `onSubmit={(e) => { e.preventDefault(); handleSubmit(onSubmit)(e); }}`
   - เพิ่ม URL Query Sanitizer ในหน้า Login เพื่อตรวจสอบและลบพารามิเตอร์ `?email=` หรือ `?password=` ออกจาก Address Bar และ History ทันทีที่โหลดหน้าเว็บ
2. **Next.js App Router API Reverse Proxy**:
   - สร้าง Proxy Route Handler ที่ `apps/web/app/v1/[...path]/route.ts` ทำหน้าที่ forward ทุก request `/v1/*` ไปยัง Backend API ภายใน
   - ปรับการเรียก API ใน Client ทั้งหมดให้ใช้ Relative Path (`/v1/...`) ส่งผลให้ไม่ต้องเปิดพอร์ต 3001 ออกภายนอก และขจัดปัญหา CORS / Mixed Content 100%
   - ใช้ `window.location.replace("/")` หลังล็อกอินสำเร็จ เพื่อให้เบราว์เซอร์ซิงก์ Cookie (`access_token`, `refresh_token`, `locale`) อย่างสมบูรณ์ก่อนเข้าสู่หน้า Dashboard
3. **Cloudflare Tunnel (`cloudflared`) Adoption**:
   - เปลี่ยนจาก Localtunnel มาเป็น Cloudflare Quick Tunnel (`*.trycloudflare.com`) ซึ่งเป็น HTTPS ตรง ปราศจากหน้า Interstitial หรือ Tunnel Password ทำให้ Asset ทั้งหมดโหลดได้รวดเร็วและปลอดภัย
4. **Server Component API Base URL Resolution**:
   - ปรับปรุง `getApiBaseUrl()` ใน `apps/web/lib/server-fetch.ts` ให้ตรวจสอบ Non-empty trimmed string ป้องกันปัญหา Nullish Coalescing (`??`) ปล่อยให้สตริงว่าง `""` จาก `next.config.mjs` ผ่านไป จนทำให้ Node.js Server Component `fetch()` เกิด `ERR_INVALID_URL`
   - กำหนด Fallback ไปยัง `http://localhost:3001` อย่างปลอดภัยเมื่อรันใน Local Development
5. **API Express Trust Proxy**:
   - เปิดใช้งาน `expressApp.set("trust proxy", 1)` ใน `apps/api/src/main.ts` เพื่อให้ Express รองรับ Header `X-Forwarded-For` จาก Reverse Proxy และ Cloudflare Tunnel ได้ถูกต้อง
   - ปิด Error Validation Header ใน `express-rate-limit` (`validate: { xForwardedForHeader: false }`) เพื่อป้องกันการ throw ข้อผิดพลาดระหว่างตรวจสอบความถี่การล็อกอิน

## Consequences
- ข้อมูลรหัสผ่านของผู้ใช้ได้รับการปกป้อง ไม่รั่วไหลไปยัง URL, Browser History, Referrer Headers หรือ Server Access Logs
- สถาปัตยกรรมการส่งออกพอร์ตภายนอกมีความเรียบง่ายและปลอดภัยสูง โดย Expose เฉพาะพอร์ต 3000 ผ่าน SSL Tunnel
- รองรับการเข้าใช้งานจากอุปกรณ์มือถือและเครือข่ายภายนอกได้ทันทีโดยไม่มีหน้าต่างเตือนรบกวน
- Next.js Server Components บนหน้า Dashboard และหน้ารายงานทั้งหมดสามารถดึงข้อมูลผ่าน Server-to-Server ไปยัง API ได้อย่างราบรื่นโดยไม่เกิดข้อผิดพลาด URL หรือ Proxy Error
