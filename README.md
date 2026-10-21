# CVC KOL Matcher

TikTok creator matching for the Thai market, built for Convert Cake. A planner enters a brand (name, website, Facebook,
TikTok, target personas, screenshots, a voice note), and the system researches the brand, finds and evaluates Thai
TikTok creators, ranks them, and returns a consultant-style result: why each creator fits, expected KPIs per post
computed from their own history, how to use them (role, formats, posting window, collaboration model, brief do/don't),
a portfolio plan against the budget, and next actions — plus a chatbot scoped to that result.

## Repository

```
apps/
  web/      cvc-web    Next.js 16 — web app + LINE LIFF + proxy.ts edge gate         :3000
  api/      cvc-api    Next.js 16 + Hono — auth, users, saved results, LINE, uploads  :3001
  agent/    cvc-agent  Next.js 16 + Hono + Upstash Workflow (QStash) + Mastra — AI    :3002
packages/
  schemas/  zod contracts (RunInput → FinalResult, API DTOs, reference data)
  scoring/  deterministic metrics, gates, ranking, expected KPIs, plan, next actions
  ai/       models, prompts, LLM0–LLM4 calls, chat agent (with demo stubs)
  providers/ ScrapeCreators, Apify, Firecrawl adapters (with fictional mock data)
  db/       Postgres repositories (svc_api / svc_agent roles) + in-memory fallback
  cache/    Upstash Redis helpers (rate limit, dedupe, budget, locks) + in-memory fallback
  auth/     Supabase JWT, Vercel OIDC, Hono guards
  media/    creator photos and video covers cached in Vercel Blob
  thai/     Thai segmentation and number/date formatting
supabase/migrations/   Postgres schema, RLS, reference data
docs/                  CONTRACTS.md · UI_CONTRACT.md · DEPLOYMENT.md
SYSTEM_DESIGN.md · DESIGN.md
```

## Quick start

```bash
cp .env.example .env
```

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. With an empty `.env` everything runs in **demo mode**: mock providers return fictional
creators (handles start with `cvcdemo_`, no photos), AI calls are deterministic stubs, data lives in memory, and every
screen shows that the data is sample data. Fill in the variables in `.env` to switch each integration to live.

Analysis runs go through a job queue: `POST /api/agent/runs` only enqueues the run and answers `202`, then Upstash
QStash calls the workflow endpoint `/api/workflow/kol-match` on the agent once per step (Upstash Workflow), so no request
waits for the whole pipeline and nothing hits a function timeout. Without `QSTASH_TOKEN` the local/demo setup runs the
same steps in-process instead; production refuses to start a run without the queue (`503 queue_not_configured`). To try
the real queue locally, start the QStash dev server in a second terminal:

```bash
npm run qstash:dev
```

Copy the `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` it prints into `.env`, set
`QSTASH_URL=http://127.0.0.1:8080` and `UPSTASH_WORKFLOW_URL=http://localhost:3002`, then restart `npm run dev`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | all three apps in parallel (turbo) |
| `npm run qstash:dev` | local QStash dev server on http://127.0.0.1:8080 for the job queue; prints a local token and signing keys |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run test` | vitest (scoring, providers, ai, thai) |
| `npm run build` | `next build` for the three apps |
| `npm run db:test` | applies `supabase/migrations` to an in-memory Postgres (PGlite + pgvector) and runs RLS/seed checks |

## Deploying

Three Vercel projects from this one repo (Root Directory `apps/web`, `apps/api`, `apps/agent`), plus Upstash QStash for
the job queue (agent only). Step-by-step setup, storage, queue, LINE, secrets and the per-project environment table:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
