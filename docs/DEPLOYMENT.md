# Deployment — Vercel 3 โปรเจค จาก Git repo เดียว

> repo นี้เป็น monorepo (npm workspaces + Turborepo) — **Git repo เดียว** แต่ deploy เป็น **3 Vercel projects** ที่ชี้ไปคนละ Root Directory
> ทุก project ใช้ framework preset **Next.js**, Node.js **24.x**, region **sin1 (Singapore)**

## 1. สรุป: ต้องสร้างอะไรบ้าง

| # | Vercel project | Root Directory | หน้าที่ | Domain | Local port |
|---|---|---|---|---|---|
| 1 | `cvc-web` | `apps/web` | หน้าเว็บ + LINE LIFF (`/liff`) + `proxy.ts` (edge gate ส่งต่อ `/api/*` → api, `/api/agent/*` → agent) | **custom domain** เช่น `kol.convertcake.com` | 3000 |
| 2 | `cvc-api` | `apps/api` | System backend: auth (guest / LINE), ผู้ใช้, ประวัติ, saved results, personas, upload token, LINE webhook/push, cron ของ `app` | ไม่ต้องมี custom domain (ใช้ `cvc-api.vercel.app`) | 3001 |
| 3 | `cvc-agent` | `apps/agent` | AI backend: pipeline (Upstash Workflow บน QStash + Mastra; workflow endpoint `/api/workflow/kol-match`), progress, results, rescore, chatbot, cron ของ `analysis/kol` | ไม่ต้องมี custom domain (ใช้ `cvc-agent.vercel.app`) | 3002 |

**บริการภายนอกที่ต้องสร้าง/เชื่อม (ครั้งเดียว ใช้ร่วมกัน):**

| บริการ | จำนวน | เชื่อมกับ project | หมายเหตุ |
|---|---|---|---|
| Supabase project | 1 (+1 สำหรับ staging/preview ถ้าต้องการ) | api, agent (และ web ใช้แค่ URL + publishable key) | Postgres + Auth (anonymous + LINE) |
| Upstash Redis (Vercel Marketplace) | 1 | api, agent | rate limit, dedupe, budget, lock |
| Upstash QStash / Workflow (Upstash Console หรือ Vercel Marketplace "Upstash QStash/Workflow") | 1 | **agent เท่านั้น** | คิวงานวิเคราะห์: `POST /api/agent/runs` แค่ใส่งานเข้าคิว แล้ว QStash เรียก `/api/workflow/kol-match` ทีละ step (retry + flow control) ไม่มี request ไหนรอ pipeline จนจบ |
| Vercel Blob store แบบ **private** | 1 (`cvc-private`) | api, agent | `uploads/` (รูป/เสียงที่ผู้ใช้อัปโหลด), `raw/` |
| Vercel Blob store แบบ **public** | 1 (`cvc-creator-media`) | agent | `creator-media/avatars/*`, `creator-media/covers/*` (รูปโปรไฟล์/ปกคลิปของครีเอเตอร์ที่ระบบดึงมาเก็บ) |
| LINE Login channel + LIFF app | 1 (+1 LIFF สำหรับ staging) | web (LIFF ID), api (channel ID/secret) | Endpoint URL = `https://<domain>/liff` |
| LINE Messaging API channel (OA) | 1 (option) | api | push แจ้งผลเสร็จ + webhook follow/unfollow |
| OpenAI API key | 1 | agent | gpt-6.1-sol, gpt-6-luna, gpt-transcribe, text-embedding-3-large |
| ScrapeCreators / Apify / Firecrawl | 1 ต่อเจ้า | agent | ไม่ใส่ key = โหมดตัวอย่าง (ข้อมูลสมมติ) |

ทำไมแยก 3 project (ไม่ใช่ 1): ดู SYSTEM_DESIGN.md ADR-001 / ADR-008 — แยก secret (web ไม่มี DB/LLM key), แยก `maxDuration`/memory (agent ต้อง 800 s ต่อ step), deploy อิสระ, และ Vercel ข้าม build ของ project ที่ไม่เปลี่ยนให้อัตโนมัติ
**ลำดับ deploy เมื่อ request schema กว้างขึ้น:** เพราะ deploy อิสระ release ที่แก้ `packages/schemas` ให้รับค่าที่ agent เวอร์ชันเก่าปฏิเสธ หรือเพิ่ม route ใหม่ของ agent (เช่น `campaign.objective` / `nCreators` เป็น `null` ได้ = ให้ระบบเลือก และ `POST /api/agent/assist`) ต้อง promote `cvc-agent` ก่อน รอจน Ready แล้วจึงให้ `cvc-web` ขึ้น production (promote เอง หรือพัก auto-deploy ของ `cvc-web` ไว้ใน release นั้น) · ถ้า web ใหม่ขึ้นก่อน ทุก run ที่ใช้ค่าเริ่มต้น "ระบบเลือกให้" จะได้ `400 invalid_request` จาก agent เก่า และแถบช่วยกรอกได้ `404` · ระหว่างที่ web ใหม่ยัง live อย่า rollback `cvc-agent` ตัวเดียว · ทางกลับกันปลอดภัย (web เก่าส่งค่าที่ระบุชัดเสมอ)
ทำไมใช้คิว (ไม่รันใน request): ดู SYSTEM_DESIGN.md ADR-003 — pipeline ใช้เวลาหลายนาที ถ้ารันใน request เดียวจะชน timeout จึงให้ QStash เรียกทีละ step โดยแต่ละ step เป็น HTTP call แยกที่มีเวลาจำกัด (800 s), retry และ flow control ของตัวเอง

## 2. ลำดับการตั้งค่าครั้งแรก

ทำตามลำดับนี้ เพราะ web ต้องรู้ URL ของ api/agent และ api/agent ต้องรู้ชื่อ project กันและกัน (OIDC)

### 2.1 เตรียม Git และ Supabase

1. push repo ขึ้น GitHub (repo เดียว)
2. สร้าง Supabase project (region Singapore `ap-southeast-1`)
   - Authentication → Sign In / Providers → เปิด **Allow anonymous sign-ins**
   - Project Settings → JWT Keys → ใช้ **asymmetric signing keys** (ES256/RS256) เพื่อให้ api/agent ตรวจ JWT ผ่าน JWKS ได้
   - Project Settings → API Keys → จด **publishable key** (`sb_publishable_…`) และ **secret key** (`sb_secret_…`)
3. รัน migrations (`supabase/migrations/*`) — เลือกวิธีใดวิธีหนึ่ง:

```bash
npx supabase link --project-ref <project-ref>
```

```bash
npx supabase db push
```

4. ตั้งรหัสผ่านให้ DB role ของแต่ละ service (SQL Editor):

```sql
alter role svc_api   password '<random-1>';
alter role svc_agent password '<random-2>';
```

5. connection string (Supavisor **transaction pooler**, port 6543):
   - `API_DATABASE_URL = postgres://svc_api.<project-ref>:<random-1>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
   - `AGENT_DATABASE_URL = postgres://svc_agent.<project-ref>:<random-2>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`
   - (host จริงดูได้ที่ Connect → Transaction pooler)

### 2.2 สร้าง Vercel project ทั้ง 3 (Add New → Project → Import repo เดิม 3 ครั้ง)

ทำซ้ำ 3 รอบ เปลี่ยนแค่ชื่อและ Root Directory:

| ช่อง | cvc-agent | cvc-api | cvc-web |
|---|---|---|---|
| Project Name | `cvc-agent` | `cvc-api` | `cvc-web` |
| Root Directory | `apps/agent` | `apps/api` | `apps/web` |
| Framework Preset | Next.js | Next.js | Next.js |
| Build / Install command | ค่า default (Vercel ติดตั้ง workspaces ที่ root จาก `package-lock.json` เอง) | default | default |
| Include files outside Root Directory | **เปิด** (default) — ต้องใช้ `packages/*` | เปิด | เปิด |

หลังสร้างแล้วในแต่ละ project:

- Settings → General → **Node.js Version 24.x**
- Settings → Git → เปิด **Skip deployments when there are no changes** (ข้าม build ถ้า app และ packages ที่มันใช้ไม่เปลี่ยน)
- region ถูกกำหนดใน `apps/*/vercel.json` (`"regions": ["sin1"]`) อยู่แล้ว — ตรวจที่ Settings → Functions ว่าเป็น Singapore
- cron ถูกกำหนดใน `apps/api/vercel.json` และ `apps/agent/vercel.json` อยู่แล้ว

แนะนำให้สร้างตามลำดับ **agent → api → web** แล้ว deploy ครั้งแรกให้ผ่านก่อน (ไม่มี key ก็ build ได้ ระบบจะเข้าโหมดตัวอย่าง)

### 2.3 เชื่อม storage (Vercel → Storage)

1. **Upstash for Redis** (Marketplace) → Connect กับ `cvc-api` และ `cvc-agent`
   - Marketplace อาจตั้งชื่อตัวแปรเป็น `KV_REST_API_URL` / `KV_REST_API_TOKEN` — โค้ดอ่านได้ทั้งชุดนี้และ `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
2. **Blob store `cvc-private`** (access: **Private**) → Connect กับ `cvc-api` และ `cvc-agent` โดยตั้ง **Environment variable prefix = `BLOB_PRIVATE`** → ได้ `BLOB_PRIVATE_READ_WRITE_TOKEN`
3. **Blob store `cvc-creator-media`** (access: **Public**) → Connect กับ `cvc-agent` โดยตั้ง prefix = `CREATOR_MEDIA_BLOB` → ได้ `CREATOR_MEDIA_BLOB_READ_WRITE_TOKEN`
4. **Supabase** — ถ้าเชื่อมผ่าน Marketplace จะได้ `POSTGRES_URL` (role postgres) มาด้วย **โค้ดไม่ใช้ตัวนี้** ให้ตั้ง `API_DATABASE_URL` / `AGENT_DATABASE_URL` (role svc_*) เองตามข้อ 2.1

### 2.4 คิวงานวิเคราะห์ (Upstash QStash / Workflow) — `cvc-agent` เท่านั้น

pipeline ไม่รันใน request: `POST /api/agent/runs` สร้าง run แล้วเรียก `client.trigger` (Upstash Workflow) ใส่งานเข้าคิว QStash และตอบ `202` ทันที จากนั้น QStash เรียก `https://<agent origin>/api/workflow/kol-match` ครั้งละ 1 step (แต่ละครั้งเป็น function invocation ใหม่ `maxDuration = 800`) จน run จบ · route นี้อยู่นอก `/api/agent/*` จึงไม่ผ่าน proxy ของ web และไม่ใช้ `x-cvc-edge` แต่ตรวจลายเซ็นของ QStash (`Upstash-Signature`) แทน

1. **สร้าง QStash** (ทางใดทางหนึ่ง):
   - **Upstash Console** → QStash → เลือก region (ค่าเริ่มต้น EU หรือ US; token และ signing keys แยกตาม region) → คัดลอก `QSTASH_TOKEN` (Quickstart) และ `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` (Signing keys) ไปใส่ใน `cvc-agent`
   - **Vercel Marketplace** → **Upstash QStash/Workflow** → Connect กับ `cvc-agent` เท่านั้น → รัน `vercel env pull` เพื่อตรวจว่า integration ใส่ตัวแปรชื่ออะไรให้บ้าง ถ้าขาดตัวไหนในรายการข้างบน (โดยเฉพาะ signing keys) ให้คัดลอกจาก Upstash Console มาใส่เอง
   - region US: ตั้ง `QSTASH_URL=https://qstash-us-east-1.upstash.io` (ว่าง = EU `https://qstash.upstash.io`)
2. **ใส่ signing keys ครบทั้งสองค่าเสมอ** — SDK (`serve`) ตรวจลายเซ็นเฉพาะเมื่อมีทั้ง `QSTASH_CURRENT_SIGNING_KEY` และ `QSTASH_NEXT_SIGNING_KEY` ถ้าขาดตัวใดตัวหนึ่ง SDK จะไม่ตรวจ โค้ดจึงให้ endpoint ตอบ `503 queue_not_configured` ใน production แทนการรันงานที่ไม่ได้ยืนยัน · `GET /api/agent/health` รายงาน `configured.queue: true` เฉพาะเมื่อมี token และ keys ครบ
3. **`UPSTASH_WORKFLOW_URL`** = origin สาธารณะของ `cvc-agent` ที่ QStash เรียก (ไม่มี path) เช่น `https://cvc-agent.vercel.app`
   - ใส่เฉพาะ environment **Production** หรือไม่ใส่เลยก็ได้: ถ้าว่าง โค้ดใช้ `https://$VERCEL_PROJECT_PRODUCTION_URL` ใน production และ `https://$VERCEL_URL` ใน preview
   - **ห้ามใส่ค่า production ให้ Preview** ไม่งั้น run ที่สร้างจาก preview จะถูกส่งไปทำที่ agent ตัว production
   - ต้องเปิด Settings → Environment Variables → **Enable access to System Environment Variables** (ค่าเริ่มต้นเปิดอยู่) เพื่อให้มี `VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_AUTOMATION_BYPASS_SECRET`
4. **Flow control:** ทุก run ใช้ key `cvc-kol-match` กับ parallelism = `PIPELINE_MAX_PARALLEL_RUNS` (default 3) → QStash ส่ง step ของ run ต่างๆ พร้อมกันไม่เกินจำนวนนี้ ส่วนที่เกินรอในคิว (ไม่หาย) · ปรับตาม OpenAI TPM และ quota ของ provider · ถ้า production กับ preview ใช้ token เดียวกัน ทั้งสองจะแชร์ key นี้
5. **แผนของ Upstash:** Workflow คิดเงินต่อ step (retry นับเป็น step เพิ่ม) · แผน Free ได้ 1,000 steps/วัน, parallelism สูงสุด 10 และ HTTP response ≤ 15 นาที (พอสำหรับ step 800 s) · run หนึ่งใช้ราว 15–25 steps (ประมาณจากจำนวน step ใน pipeline ไม่รวม retry) → production ควรใช้ Pay as You Go ($1 ต่อ 100K steps)
6. **Preview + Deployment Protection:** preview ของ `cvc-agent` ถูกล็อกด้วย Vercel Authentication → QStash ผ่านได้ด้วย **Protection Bypass for Automation** (secret เดียวกับ §2.5 ข้อ 4) ซึ่ง Vercel ใส่ให้ทุก deployment เป็น system env `VERCEL_AUTOMATION_BYPASS_SECRET` เอง (ไม่ต้องสร้างตัวแปร) · เมื่อมีค่านี้ โค้ดแนบ header `x-vercel-protection-bypass` ทั้งตอน `client.trigger` และใน QStash client ของ `serve` (ใช้กับทุก step ถัดไป) — SDK ไม่ส่งต่อ header `x-vercel-*` ของ request เดิมให้ step ถัดไปเอง จึงต้องตั้งทั้งสองที่ตามคู่มือของ Upstash · สร้าง secret ใหม่หรือเปลี่ยน secret แล้วต้อง redeploy (Vercel ตั้งค่านี้ตอน build) · production domain ไม่ถูกล็อกภายใต้ Standard Protection
7. **production ไม่มี QStash = เริ่มวิเคราะห์ไม่ได้:** `PIPELINE_RUNNER=auto` (default) ใช้คิวเมื่อมี `QSTASH_TOKEN` · ถ้าไม่มีและ `NODE_ENV=production` → `POST /api/agent/runs` ตอบ `503` `queue_not_configured` และ run ถูกบันทึกเป็น `failed` (ไม่รัน inline ใน production เพราะจะชน timeout; ตั้ง `PIPELINE_RUNNER=inline` ใน production ก็ได้ผลเดียวกัน) · build บน Vercel ทั้ง Production และ Preview รันด้วย `NODE_ENV=production` จึงต้องมี QStash ทั้งสอง environment
8. **Deploy ระหว่างที่มี run ค้าง:** ใน production step ถัดไปของ run เดิมจะถูกเรียกที่ deployment ใหม่ (production domain ชี้ไป deployment ล่าสุด; preview ผูกกับ URL ของ deployment นั้น) → อย่าเปลี่ยนชื่อหรือลำดับ step แบบไม่ backward-compatible (SDK จะหยุดด้วย error `Incompatible step name`) · ถ้าจำเป็นให้รอคิวว่างหรือ cancel run เก่าก่อน deploy
9. ติดตาม run/step, retry และ DLQ ได้ที่ Upstash Console → Workflow (run id = `wfr_kol-match-<runId>` เก็บไว้ใน `analysis.runs.workflow_run_id`, label `kol-match`) · run ที่ล้มหลัง retry ครบจะเข้า DLQ (resume/restart ได้จาก console) และ `failureFunction` บันทึก run เป็น `failed`

### 2.5 ความปลอดภัยระหว่าง service

1. **Team slug**: Settings ของ team → URL `vercel.com/<team-slug>` → ใช้เป็น `VERCEL_TEAM_SLUG`
2. **OIDC** (api ↔ agent เรียก `/internal/*` กันเอง และ BotID ใน web): Project Settings → Security → **Secure backend access with OIDC federation** → เปิด, Issuer mode **Team** ทั้ง `cvc-api`, `cvc-agent` และ `cvc-web`
   - **BotID ตรวจที่ `cvc-web`:** `checkBotId()` ใช้ได้เฉพาะ route ที่เบราว์เซอร์เรียกในโปรเจคที่ส่งหน้าเว็บ จึงตรวจใน route handler ของ web (`/api/auth/guest`, `/api/agent/runs`, `/api/agent/transcribe`, `/api/agent/assist`, `/api/uploads/token`) แล้วส่งต่อพร้อม header `x-cvc-botid` ที่ api/agent เชื่อเฉพาะเมื่อมาพร้อม `x-cvc-edge` · ผู้ใช้ LINE (มี `app_metadata.line_sub`) ไม่ต้องผ่าน BotID · ถ้า BotID ใช้ไม่ได้ (เช่น ยังไม่เปิด OIDC ใน `cvc-web`) ระบบจะปล่อยผ่านพร้อม log error ใน `cvc-web` และใช้ rate limit แทน — ดู log นี้หลัง deploy
   - (แนะนำ, Pro) `cvc-web` → Firewall → Rules → เปิด **Vercel BotID Deep Analysis**
3. **Edge secret**: สร้างค่าสุ่มหนึ่งค่า (`openssl rand -hex 32`) → ใส่ `EDGE_SHARED_SECRET` **ค่าเดียวกัน** ทั้ง 3 project
4. **Deployment Protection** (preview ถูกล็อกด้วย Vercel Authentication): Settings → Deployment Protection → **Protection Bypass for Automation** → สร้าง secret แล้วใช้ **ค่าเดียวกัน** ทั้ง 3 project → ใส่เป็น `PREVIEW_BYPASS_SECRET` ใน `cvc-web` (proxy แนบ header ให้เมื่อเรียก preview ของ api/agent) · ใน `cvc-agent` Vercel ส่ง secret ของ project เป็น `VERCEL_AUTOMATION_BYPASS_SECRET` ให้เอง ซึ่งใช้ให้ QStash เรียก preview ของ agent ได้ (§2.4 ข้อ 6)
5. **Cron**: สร้างค่าสุ่ม → `CRON_SECRET` ใน `cvc-api` และ `cvc-agent` (Vercel ส่ง `Authorization: Bearer $CRON_SECRET` ให้เอง)

### 2.6 Related projects (ให้ preview ของ web ชี้ไป preview ของ api/agent)

ใน `apps/web/vercel.json` เพิ่ม project ID ของ api และ agent (ดูได้ที่ Project Settings → General → Project ID):

```json
{ "regions": ["sin1"], "relatedProjects": ["prj_<cvc-api-id>", "prj_<cvc-agent-id>"] }
```

production ใช้ `API_ORIGIN` / `AGENT_ORIGIN` เป็นค่า fallback (`https://cvc-api.vercel.app`, `https://cvc-agent.vercel.app`)

### 2.7 Domain

- `cvc-web` → Settings → Domains → เพิ่ม `kol.<convertcake-domain>` (ตัวเดียวที่ผู้ใช้เห็น)
- `cvc-api` / `cvc-agent` ไม่ต้องมี domain; ทุก route สาธารณะตรวจ `x-cvc-edge` ที่ proxy ของ web ใส่ให้ จึงเรียกตรงจากอินเทอร์เน็ตไม่ได้

### 2.8 LINE

1. LINE Developers → Provider → **LINE Login channel**
   - LIFF → Add → Size **Full**, Endpoint URL `https://kol.<domain>/liff`, Scope `openid` + `profile` → ได้ `NEXT_PUBLIC_LIFF_ID`
   - Basic settings → `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`
   - Callback URL: `https://kol.<domain>/liff`
2. **Messaging API channel** (LINE OA, ถ้าจะส่ง push)
   - Webhook URL `https://kol.<domain>/api/webhooks/line` → Use webhook: on
   - `LINE_MESSAGING_CHANNEL_SECRET`, `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` (long-lived)
   - Link OA กับ LINE Login channel (Add friend option) และใส่ `NEXT_PUBLIC_LINE_OA_BASIC_ID`
3. staging: สร้าง LIFF app แยกที่ชี้ preview/tunnel (LIFF ใช้กับ Vercel Authentication ไม่ได้)

### 2.9 Apify webhook (phase 2 — MVP รอผลแบบ synchronous)

`https://kol.<domain>/api/agent/webhooks/apify?secret=<APIFY_WEBHOOK_SECRET>`

## 3. Environment variables ต่อ project

ค่า default ของ local อยู่ใน `.env.example` (ไฟล์เดียวที่ root ใช้ร่วมทั้ง 3 app) — บน Vercel ให้ใส่เฉพาะ project ที่ระบุ
(✓ = ต้องใส่, ○ = ไม่บังคับ / มีค่า default)

| Variable | web | api | agent | ที่มา |
|---|---|---|---|---|
| `EDGE_SHARED_SECRET` | ✓ | ✓ | ✓ | สุ่มเอง (ค่าเดียวกัน) |
| `DEMO_MODE` | | ○ | ○ | `auto` (default) / `on` / `off` |
| `NEXT_PUBLIC_APP_URL` | ✓ | ✓ | ✓ | `https://kol.<domain>` |
| `API_ORIGIN` | ✓ | | ✓ | `https://cvc-api.vercel.app` |
| `AGENT_ORIGIN` | ✓ | ✓ | | `https://cvc-agent.vercel.app` |
| `PREVIEW_BYPASS_SECRET` | ✓ | | | Deployment Protection |
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | | Supabase → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✓ | ✓ | | Supabase → API Keys |
| `NEXT_PUBLIC_LIFF_ID` | ✓ | | | LINE Login → LIFF |
| `NEXT_PUBLIC_LINE_OA_BASIC_ID` | ○ | | | LINE OA |
| `NEXT_PUBLIC_NOTICE_VERSION` | ✓ | ✓ | | เช่น `2026-10-21` |
| `SUPABASE_URL` | | ✓ | ✓ | = NEXT_PUBLIC_SUPABASE_URL |
| `SUPABASE_SECRET_KEY` | | ✓ | | Supabase → API Keys (secret) |
| `API_DATABASE_URL` | | ✓ | | role `svc_api` ผ่าน pooler :6543 |
| `AGENT_DATABASE_URL` | | | ✓ | role `svc_agent` ผ่าน pooler :6543 |
| `LINE_LOGIN_CHANNEL_ID` / `LINE_LOGIN_CHANNEL_SECRET` | | ✓ | | LINE Login channel |
| `LINE_MESSAGING_CHANNEL_SECRET` / `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | | ✓ | | Messaging API channel |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` (หรือ `KV_REST_API_*`) | | ✓ | ✓ | Marketplace ใส่ให้ |
| `QSTASH_TOKEN` | | | ✓ | Upstash Console → QStash (หรือ Marketplace "Upstash QStash/Workflow") · production ไม่มีค่านี้ = เริ่ม run ไม่ได้ (503) |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | | | ✓ | Upstash Console → QStash → Signing keys (ต้องมีทั้งคู่ ไม่งั้นไม่ตรวจลายเซ็น) |
| `QSTASH_URL` | | | ○ | ว่าง = EU (`https://qstash.upstash.io`) · region US: `https://qstash-us-east-1.upstash.io` |
| `UPSTASH_WORKFLOW_URL` | | | ○ | `https://cvc-agent.vercel.app` เฉพาะ Production · ว่าง = `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL` (§2.4 ข้อ 3) |
| `PIPELINE_RUNNER` | | | ○ | `auto` (default) / `upstash` / `inline` (local เท่านั้น) |
| `PIPELINE_MAX_PARALLEL_RUNS` | | | ○ | `3` (flow control key `cvc-kol-match`) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | | | – | Vercel ใส่ให้เอง (system env จาก Protection Bypass for Automation) ไม่ต้องสร้าง |
| `BLOB_PRIVATE_READ_WRITE_TOKEN` | | ✓ | ✓ | Blob `cvc-private` (prefix `BLOB_PRIVATE`) |
| `CREATOR_MEDIA_BLOB_READ_WRITE_TOKEN` | | | ✓ | Blob `cvc-creator-media` (prefix `CREATOR_MEDIA_BLOB`) |
| `VERCEL_TEAM_SLUG` | | ✓ | ✓ | team URL |
| `VERCEL_PROJECT_API` / `VERCEL_PROJECT_AGENT` | | ✓ | ✓ | `cvc-api` / `cvc-agent` |
| `CRON_SECRET` | | ✓ | ✓ | สุ่มเอง |
| `OPENAI_API_KEY` | | | ✓ | platform.openai.com |
| `USE_AI_GATEWAY` / `AI_GATEWAY_API_KEY` | | | ○ | ใช้ AI Gateway แทนเรียก OpenAI ตรง (บน Vercel ใช้ OIDC ไม่ต้องใส่ key) |
| `OPENAI_MODEL_MAIN` / `_FAST` / `OPENAI_TRANSCRIBE_MODEL` / `OPENAI_EMBEDDING_MODEL` / `OPENAI_EMBEDDING_DIMENSIONS` | | | ○ | default ใน `.env.example` |
| `SCRAPECREATORS_API_KEY` | | | ✓ | ScrapeCreators |
| `APIFY_TOKEN` / `APIFY_WEBHOOK_SECRET` | | | ✓ | Apify |
| `FIRECRAWL_API_KEY` | | | ✓ | Firecrawl |
| `BUDGET_SOFT_USD` / `BUDGET_HARD_USD` | | | ○ | 4 / 6 |
| `LANGFUSE_*` | | | ○ | observability |

ตัวแปรที่ขึ้นต้นด้วย `NEXT_PUBLIC_` ถูกฝังตอน build → แก้แล้วต้อง redeploy
ใส่ทั้ง Production และ Preview (Preview ควรชี้ Supabase/LIFF ของ staging)

## 4. Local development

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run dev
```

- web http://localhost:3000 · api http://localhost:3001 · agent http://localhost:3002
- ไม่ใส่ key เลยก็รันได้: ระบบเข้า **โหมดตัวอย่าง** (ครีเอเตอร์สมมติ, ไม่มีรูปจริง, แสดงป้าย "ข้อมูลตัวอย่าง") และเก็บข้อมูลใน memory
- **คิวงาน (option):** ไม่ใส่ `QSTASH_TOKEN` = pipeline รันแบบ inline ใน process ของ agent หลังตอบ response (`PIPELINE_RUNNER=auto` ทำแบบนี้เฉพาะนอก production) · ถ้าต้องการทดสอบผ่านคิวจริงบนเครื่อง ให้เปิด QStash dev server อีก terminal หนึ่ง:

```bash
npm run qstash:dev
```

- แล้วคัดลอก `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` ที่มันพิมพ์ออกมา (ใช้ได้กับ dev server เท่านั้น) ไปใส่ `.env` พร้อม `QSTASH_URL=http://127.0.0.1:8080` และ `UPSTASH_WORKFLOW_URL=http://localhost:3002` → restart `npm run dev` → `GET http://localhost:3002/api/agent/health` ควรเห็น `configured.queue: true` และ runner `upstash`
- ทางเลือก: ใช้ QStash บน cloud กับเครื่อง local ผ่าน tunnel (`UPSTASH_WORKFLOW_URL=https://<tunnel>` ที่ชี้ `localhost:3002`) เพื่อดู run ใน Upstash Console — QStash บน cloud เรียก `localhost` ตรงไม่ได้
- ตรวจ migrations โดยไม่ต้องมี Supabase:

```bash
npm run db:test
```

- ทดสอบ LIFF: เปิด tunnel (เช่น `cloudflared tunnel --url http://localhost:3000`) แล้วตั้ง Endpoint URL ของ LIFF app (staging) เป็น `https://<tunnel>/liff`

## 5. Checklist ก่อนเปิดใช้งาน

- [ ] 3 projects build ผ่าน, region sin1, Node 24
- [ ] `GET https://kol.<domain>/api/health` และ `/api/agent/health` → `ok: true`, `demo: false`
- [ ] `/api/agent/health` → `configured.queue: true` และ runner = `upstash` (ไม่ใช่ `unavailable`)
- [ ] สร้าง run 1 ครั้ง → `POST /api/agent/runs` ตอบ `202` ทันที · Upstash Console → Workflow เห็น run `wfr_…` เดินครบทุก step และ `analysis.runs.workflow_run_id` ตรงกัน · ยกเลิก run ระหว่างทางแล้ว run ใน console เป็น cancelled
- [ ] release ที่ขยาย request schema (เช่น `campaign.objective: null`, `POST /api/agent/assist`): promote `cvc-agent` ก่อน แล้วตรวจว่า `POST /api/agent/assist` ไม่ตอบ `404` และ run ที่ส่ง `campaign.objective: null` ตอบ `202` จึง promote `cvc-web` (§1)
- [ ] แถบช่วยกรอก: `POST https://kol.<domain>/api/agent/assist` ด้วย session guest → `200` (หรือ `503 assist_unavailable` เมื่อปิดโหมดตัวอย่างแต่ยังไม่มี OpenAI key) ไม่ใช่ `404`
- [ ] `POST https://cvc-agent.vercel.app/api/workflow/kol-match` ตรงจากอินเทอร์เน็ต (ไม่มีลายเซ็น QStash) → ถูกปฏิเสธ
- [ ] preview: สร้าง run บน preview ของ web แล้ว step ถูกเรียกที่ preview ของ agent (ไม่ใช่ production) และไม่ถูก Deployment Protection บล็อก
- [ ] `https://cvc-api.vercel.app/api/me` ตรงจากอินเทอร์เน็ต → 401/403 (edge gate ทำงาน)
- [ ] `/api/internal/*`, `/api/cron/*` ผ่าน domain หลัก → 404
- [ ] LIFF เปิดใน LINE แล้ว login ได้, ผลวิเคราะห์ของ guest ถูกย้ายเข้าบัญชี LINE หลัง login
- [ ] รูปครีเอเตอร์โหลดจาก `*.public.blob.vercel-storage.com`
- [ ] cron ทั้ง 3 ตัวขึ้นใน Settings → Cron Jobs
- [ ] `ref.kpi_benchmarks` ที่เป็น `assumption_to_calibrate` ได้รับการทบทวนกับข้อมูลแคมเปญจริงของ CVC
