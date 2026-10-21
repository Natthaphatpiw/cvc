# UI Contract — CVC Influencer (apps/web)

The binding rules for every screen in `apps/web`. Where this file and `DESIGN.md` disagree, this file wins
(DESIGN.md v1.2 still describes gradients, glass and CTA cards, which this product no longer uses).

Sources: taste-skill app direction (`accent-ladder` style, `open-plane` shell, dealt with `--keep palette,type`),
anti-ui-slop finish gate, hallmark, ui-ux-pro-max (Swiss minimalism, light mode, accessibility rules).

## 1. What this product is

A working tool for Convert Cake planners and their clients: type a brand, get a ranked shortlist of Thai TikTok creators,
expected results per post, a plan and next steps. It must look like a SaaS product someone opens every day, not a
landing page and not an AI demo. The user lands on a screen that already does something (analyses table, one button).

## 2. Hard bans

- No emoji anywhere (UI copy, empty states, toasts, chat replies rendered by our components, LINE messages).
- No gradients, glass, blur panels, glows, neon, animated backgrounds, decorative blobs.
- No shadow on resting cards. Shadow only on floating layers (menus, sheets, dialogs, toasts): `0 8px 24px rgb(16 24 40 / .08), 0 1px 2px rgb(16 24 40 / .06)`.
- No icons inside tinted circles or squares. No "sparkle"/magic-wand/robot icons for AI features.
- No sparklines, no donut "score rings", no gauges.
- No uppercase tracked micro-labels, no monospace labels, no `01 / 02 / 03` numbering (rank numbers are fine).
- No "Welcome back", "Unlock the power of", "AI-powered", "Supercharge", "Seamless", lorem ipsum, invented metrics.
- No violet/indigo/purple. One hue family only (Convert Cake blue) plus semantic red/green/amber for status.
- No hero sections inside the app. No marketing copy on working screens.
- Never show a number we did not compute. Demo data is always labelled (banner + `isDemo`).

## 3. Tokens (CSS variables in `app/globals.css`, exposed to Tailwind v4 via `@theme inline`)

| Token | Value | Use |
|---|---|---|
| `--ground` | `#f7f8fc` | page background (one step toward the hue's palest tint) |
| `--surface` | `#ffffff` | cards, table body, sheets |
| `--raised` | `#f2f4f8` | input fill on hover, table header row, code chips |
| `--border` | `#e6e8ef` | 1px card and control borders |
| `--rule` | `#eef0f5` | row dividers inside cards |
| `--control` | `#d3d7e2` | input borders |
| `--text` | `#111827` | primary text and numbers |
| `--muted` | `#5f6672` | labels, secondary text, axis text |
| `--subtle` | `#8a90a0` | placeholders, disabled |
| `--accent` | `#0536d2` | Convert Cake blue: the one filled button, data series, active nav icon, links, focus ring, selected checkbox |
| `--accent-hover` | `#042cb0` | filled button hover |
| `--accent-soft` | `#eef2fe` | active nav row, selected row, accent badge fill |
| `--accent-track` | `#e3e9fd` | progress tracks, bullet-bar bands |
| `--accent-line` | `#c8d4fb` | expected-KPI range band, selected card border |
| `--accent-ink` | `#04299e` | text on accent-soft |
| `--positive` / `--positive-soft` | `#1f7a4d` / `#e7f6ee` | above benchmark, within budget, completed |
| `--negative` / `--negative-soft` | `#c4242a` / `#fdecec` | failed, over budget, risk |
| `--warning` / `--warning-soft` | `#8a4b08` / `#fff6e5` | assumption, low confidence, partial |
| `--line-green` | `#06c755` | LINE login button only (LINE brand guideline) |

Colour budget: 3–10 % of any screen, almost all of it as `--accent-soft`/`--accent-track` areas. The full hue only on
small marks. Never fill a large area with `--accent`.

Radius: card 8 · control 6 · chip 4 · avatar full circle. Borders 1px `--border`. Focus: `outline: 2px solid var(--accent); outline-offset: 2px` (visible on every interactive element; never `outline: none` without a replacement).

## 4. Type — Mitr only

```ts
// app/layout.tsx
import { Mitr } from 'next/font/google';
const mitr = Mitr({ subsets: ['thai', 'latin'], weight: ['300', '400', '500', '600'], display: 'swap', variable: '--font-mitr' });
```

`body { font-family: var(--font-mitr), system-ui, sans-serif; }`. No second family. Mitr is heavy, so the scale uses
light weights:

| Role | Size / line-height | Weight |
|---|---|---|
| Page title (a noun: "ผลวิเคราะห์", "วิเคราะห์ใหม่") | 24 / 32 | 500 |
| Section heading | 16 / 24 | 500 |
| Body, table cells, inputs | 14 / 22 | 300 |
| Emphasis in body, nav label (active) | 14 / 22 | 400 |
| Label, caption, table header | 13 / 20 (header 12 / 18) | 300, `--muted` |
| KPI value | 24 / 32 | 400 |
| Small meta (timestamps, sources) | 12 / 18 | 300, `--muted` |

Numbers: `font-variant-numeric: tabular-nums` on tables, KPI values and anything that updates. If Mitr lacks `tnum`
(verify visually during polish), right-align numeric columns so digits still line up. Thai numbers use Arabic digits.
Format with `@cvc/thai` (`formatNumber`, `formatCompact` → `62K` / `1.2M`, `formatTHB` → `฿22,500`, `formatPct` → `7.1%`,
`formatDateTh` → `21 ต.ค. 2569`).

## 5. Shell — open plane

- **Desktop ≥ 1024:** labelled sidebar 240px on `--ground` with no fill and one 1px `--border` hairline on its right edge.
  No top bar. Canvas fluid with 32px gutter, content max 1280px, page header starts 32px from the top.
- **Sidebar contents (top → bottom):** workspace switcher "Convert Cake · Influencer" (product mark + two lines, 13px),
  primary nav on a 34px pitch (row 32px, radius 6, inset 8px, 16px lucide icon at 1.5 stroke in `--muted`, label 14/300),
  group label "บัญชี" 12px `--muted` with 24px air above, utilities and the user row pinned to the bottom.
- **Nav items:** วิเคราะห์ (`/`), วิเคราะห์ใหม่ (`/new`), ที่บันทึกไว้ (`/saved`) · bottom: บัญชี (`/account`), user row
  (LINE picture + name, or "ผู้ใช้ทั่วไป" with a "เข้าสู่ระบบด้วย LINE" text button).
- **Active row:** `--accent-soft` fill, `--accent-ink` label at 400, icon in `--accent`. No left bar.
- **Product mark:** a drawn 20px SVG, two overlapping circles (brand ↔ creator, "match") in `--accent` stroke 1.75, the
  overlap filled `--accent-soft`. Not a letter in a square.
- **Phone < 768:** sidebar folds into a 48px top bar (menu button, screen name 16/500, at most one action). Menu opens a
  full-screen sheet with the nav. Content full width with 16px margins. Tablet 768–1023: sidebar collapses to the same
  top bar.
- **Page header:** title 24/500 + optional one-line description 14/300 `--muted`; the one primary action on the right,
  bottom-aligned with the description.

## 6. Components

- **Buttons:** primary = filled `--accent`, white 14/400, height 36, padding 0 14, radius 6 — at most one per screen.
  Secondary = white with 1px `--control` border, `--text`. Tertiary = text button in `--accent`. Icon buttons 32×32 with
  `aria-label`. Hover transitions 150ms on colour/background only; `cursor: pointer` on everything clickable.
- **Inputs:** height 36, 1px `--control`, radius 6, 14/300; label above at 13/400; helper text below at 12 `--muted`;
  error text in `--negative` with the field border red. Thai placeholders as examples, not instructions.
- **Cards:** white, 1px `--border`, radius 8, padding 20 (16 on phone), no shadow. Section heading sits outside the card,
  8px above it.
- **Tables:** header row 12/400 `--muted`, sentence case, `--raised` fill; rows 48px with 1px `--rule` dividers, no zebra;
  numbers right-aligned tabular; row hover `--raised`; clickable rows open the detail sheet.
- **Badges:** 4px radius, 12/400, 2×8 padding: neutral (`--raised`/`--muted`), accent (`--accent-soft`/`--accent-ink`),
  positive, warning, negative soft pairs. Text only, no icons inside badges except a 12px status dot when needed.
- **Avatar:** creator photo from `avatarUrl` (Vercel Blob) in a circle with a 1px `--border` ring; sizes 32 (table),
  40 (list), 64 (sheet). `next/image` with `remotePatterns` for `*.public.blob.vercel-storage.com`. When `avatarUrl` is
  null: initials (first two letters of the handle without `@`) on `--accent-soft` with `--accent-ink` text. Never a
  stock or generated face.
- **Sheet:** right side, 560px desktop / full screen phone, white, floating shadow, header with avatar + handle + close.
- **Tabs:** 14/400 labels, active has a 2px `--text` underline running 8px past the label, on a 1px `--rule` baseline.
- **Toasts:** bottom-right, white, floating shadow, one line, 4s.
- **Skeletons:** `--raised` blocks at the real size of the content, 1.2s opacity pulse (disabled under reduced motion).

## 7. Signature elements (use these, they make the product recognisable)

1. **Creator photos** in every list and table row (Blob-cached), handle 14/400 + display name 13/300 `--muted`.
2. **Fit strip** — five thin bars (fit, audience, performance, trust, cost), 40×6px each with 4px gaps, `--accent-track`
   track, `--accent` fill to the creator's group score, and a 1px `--text` tick at the pool median
   (`benchmarks.poolMedianScores`). Tooltip lists the five numbers. Used in the creators table and the sheet header.
3. **Expected-views bullet** — a 160×8px track: `--accent-line` band from p25 to p75 of `expectedKpis.perPost.views`,
   a 2px `--accent` tick at p50, a 1px `--muted` tick at the tier median views. Label to its right: "62K" (p50) with
   "42K–80K" under it in 12/300 `--muted`.
4. **Confidence badge** on every KPI estimate: สูง / ปานกลาง / ต่ำ (positive / neutral / warning). Estimates built on
   `assumption_to_calibrate` benchmarks carry a warning badge "สมมติฐาน" with the note in a tooltip.

## 8. Screens

| Route | Content |
|---|---|
| `/` วิเคราะห์ | Header "การวิเคราะห์" + primary "วิเคราะห์แบรนด์ใหม่". Table: แบรนด์ (logo or initials + name), สถานะ (badge), ครีเอเตอร์ (stack of 3 avatars), วันที่, actions. Guest data from IndexedDB, LINE users from `/api/history`. Empty state: framed area with one sentence "ยังไม่มีการวิเคราะห์" + the same primary button. |
| `/new` วิเคราะห์ใหม่ | Single column 720px. Sections as cards: แบรนด์ (company name required, website, Facebook, TikTok), กลุ่มลูกค้า (persona chips multi-select + notes), แคมเปญ (objective segmented control, budget min/max, number of creators), ไฟล์ประกอบ (screenshots ≤ 3 drag/drop with thumbnails; voice record or upload ≤ 3 min → transcript textarea, editable). Sticky footer bar with summary + primary "เริ่มวิเคราะห์". |
| `/runs/[id]` | Header = company name + status badge + cancel (secondary). Left: vertical stage list (normalize → prefetch → brand → discover → evaluate → rank → curate) with state per row (done check / spinner / waiting) and the Thai message; elapsed and ETA. Right rail 384px: brand card when `partial.brand` arrives, candidate count, preview avatars. Polls `/api/agent/runs/:id/events?after=` every 2s; on `completed`/`partial` → `/results/[resultId]`. Failure: error block in place with retry. |
| `/results/[id]` | Header: brand name as title, `headlineTh` under it, actions: บันทึก (primary), แชร์/ส่งออก (secondary, disabled for guests with a reason). KPI container (4 cells split by 1px dividers): ยอดวิวคาดการณ์รวม (p50 + p25–p75), งบประมาณโดยประมาณ (fee min–max total), ความเหมาะกับงบ (budgetFit badge), ครีเอเตอร์ที่แนะนำ (n). Then grid `1fr 384px`, gap 24. Main: "ครีเอเตอร์ที่แนะนำ" table: rank, avatar + handle, tier badge, followers, expected views bullet, ER, fee range, CPV, fit strip, total score; row → sheet. Below: alternatives (compact rows), methodology (weights, sources, data date, caveats). Rail: tabs "แผนงาน" (consultantSummaryTh, plan.mixTh, timeline by week, measurement plan, next actions as a checklist grouped by owner) and "ถาม-ตอบ" (chat). Demo banner on top when `isDemo`. |
| Creator sheet | Header: avatar 64, handle, display name, tier, followers, profile link (external icon), fit strip. Tabs: ภาพรวม (whyMatchTh with evidence links, risks, rubric table 0/1/2 with notes), คาดการณ์ (expected KPIs table p25/p50/p75 for views, engagements, clicks, orders; cost per view/engagement; basis paragraph listing videos analysed, sponsored factor and its source, benchmarks used; confidence), วิธีใช้งาน (playbook: role + reason, formats, posting window days/hours, collaboration model + note, content angles, brief do/don't, negotiation tips, risk → mitigation), ขั้นตอนถัดไป (this creator's next actions), วิดีโอ (top videos with covers from Blob, views, why). |
| `/saved` | Saved results table (title, brand, tags, updated, pin). Guests see IndexedDB items with a note that they live in this browser only and a LINE login button. |
| `/account` | Profile, LINE connection, notice acknowledgement, push opt-in, export data, delete account (destructive confirm dialog). |
| `/liff` | LIFF entry: init, login, notice acknowledgement, then the same screens in the phone shell. |
| `/share/[token]` | Read-only result without chat and without save. |

## 9. States (every data block)

Loading = skeletons at real size · Empty = framed area, one sentence, one action · Error = inside the block, plain Thai
cause + "ลองอีกครั้ง" · Partial = warning banner naming what is missing · Demo = neutral banner "ข้อมูลตัวอย่าง:
ยังไม่ได้ตั้งค่า API keys ผลลัพธ์นี้สร้างจากข้อมูลสมมติ" at the top of results and run pages.

## 10. Copy

Thai first, short, specific, sentence case. Verbs on buttons ("เริ่มวิเคราะห์", "บันทึกผล", "ดูโปรไฟล์"). Units always
shown (฿, ครั้ง, %). Estimates say "คาดการณ์" and show the range. No exclamation marks.

## 11. Accessibility and motion

WCAG AA contrast (all token pairs above pass), visible focus, keyboard reachable sheet/tabs/menus (Escape closes,
focus returns), `aria-live="polite"` for progress updates, form errors linked with `aria-describedby`, 44px touch
targets on phone, `prefers-reduced-motion` disables pulses and transitions. Check at 375 / 768 / 1024 / 1440.

## 12. Finish gate (run before calling a screen done)

`node .claude/skills/design-taste-frontend/scripts/lint.mjs --app <url>` and `inspect.mjs --app <url>` pass; screenshot at
375 and 1440 reviewed; no banned item from §2; every state in §9 reachable; numbers right-aligned and tabular.
