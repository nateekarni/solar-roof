# Private repository บน Coolify

สำหรับระบบนี้แนะนำ **GitHub App สำหรับอ่าน Compose จาก Git + image digest ที่ผ่าน GitHub Actions** เพื่อไม่ build บนเครื่อง pilot 2 vCPU/4 GiB GitHub App ควบคุมสิทธิ์ repository ส่วน credential ของ private GHCR ควบคุมสิทธิ์อ่าน image เป็นคนละส่วนกัน ตาม [Coolify GitHub overview](https://coolify.io/docs/applications/sources/github/overview)

## GitHub App

1. Coolify → Sources → Add ตั้งชื่อ เช่น `solar-roof-github` ถ้าเป็นบัญชีส่วนตัวให้ Organization ว่าง
2. เลือก Automated Installation ให้ Coolify URL เป็น public HTTPS ที่ GitHub เข้าถึงได้ ใช้ base URL ไม่เติม `/webhooks`
3. Register Now → ตั้งชื่อ GitHub App ที่ไม่ซ้ำ → Create GitHub App
4. กลับ Coolify → Install Repositories on GitHub → Only select repositories → เลือก `nateekarni/solar-roof` → Install
5. Project/Environment → New → Private Repository (with GitHub App) เลือก server และ App → เลือก repository → Load Repository
6. Branch `main`, Build Pack `Docker Compose`, Base Directory `/`, Compose Location `/infra/docker/docker-compose.web.yml`
7. Domain ของ web `https://solar.fowir.com:3000` พร้อม Environment Variables ตาม [คู่มือ web-first](coolify-web-first-deployment-th.md) ใช้ digests รุ่นที่ verify ผ่าน
8. Deploy และดู Logs ว่า clone repository/commit ถูกต้อง หากเคยมี Resource เดิมให้เปลี่ยน Git Source ใน Resource เดิมเพื่อรักษาข้อมูล ห้ามสร้าง Resource ใหม่แล้วคิดว่า volumes จะย้ายตาม

เครื่อง pilot ยังไม่ต้องเปิด preview deployment หากไม่ได้ทดสอบ PR บนเครื่องนี้ ขั้นตอนอิง [เอกสาร GitHub App ของ Coolify](https://coolify.io/docs/applications/sources/github/app)

## Private GHCR images

App ที่ clone repository ได้ไม่ได้แปลว่า Docker pull private image ได้ ให้สร้าง GitHub classic PAT มี `read:packages` และบัญชีเจ้าของ token ต้องมีสิทธิ์อ่าน packages เหล่านี้ หากองค์กรใช้ SSO ต้อง authorize token ตามนโยบายองค์กร

SSH เข้า deployment server **ด้วย user ที่ Coolify ใช้รัน Docker** แล้วรัน:

```sh
read -r -s -p 'GHCR read token: ' REGISTRY_TOKEN
echo
printf '%s' "$REGISTRY_TOKEN" | docker login ghcr.io --username nateekarni --password-stdin
unset REGISTRY_TOKEN
docker pull ghcr.io/nateekarni/solar-roof/api@sha256:DIGEST_จริงจาก_CI
```

ทำทุกเครื่องที่ต้อง pull image แล้วทดสอบ API/Web/Worker/Postgres image ของรุ่นเดียวกัน Coolify ใช้ Docker credential ของ server user นั้น รายละเอียดอิง [Docker registries](https://coolify.io/docs/applications/builds/docker-registries) และ [GitHub GHCR authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

## ทางเลือก Deploy Key

หากติดตั้ง GitHub App ไม่ได้ ใช้ SSH deploy key แบบ read-only ของ repository นี้: สร้าง key ใน Coolify → GitHub repository Settings → Deploy keys → Add deploy key → ใส่ public key → ไม่เลือก Allow write access แล้วเลือก Private Repository with Deploy Key ใน Coolify ยังต้องตั้ง GHCR credential แยกและ webhook เองหากต้องการ auto deploy ดู [Deploy keys](https://coolify.io/docs/applications/sources/deploy-keys)
