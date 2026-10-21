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
  agent/    cvc-agent  Next.js 16 + Hono + Vercel Workflow + Mastra — AI pipeline     :3002
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

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | all three apps in parallel (turbo) |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run test` | vitest (scoring, providers, ai, thai) |
| `npm run build` | `next build` for the three apps |
| `npm run db:test` | applies `supabase/migrations` to an in-memory Postgres (PGlite + pgvector) and runs RLS/seed checks |

## Deploying

Three Vercel projects from this one repo (Root Directory `apps/web`, `apps/api`, `apps/agent`). Step-by-step setup,
storage, LINE, secrets and the per-project environment table: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
