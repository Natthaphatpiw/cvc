# UI Contract — CVC Influencer (apps/web)

The binding rules for every screen in `apps/web`. Where this file and `DESIGN.md` disagree, this file wins.

**Direction (v2, 2026-10):** a bright, friendly SaaS tool (references: the Invo dashboard and Homespot's soft
gradients). Light blue-grey canvas, white rounded cards with a soft shadow, one vivid blue accent with a cyan partner,
a solid blue active nav pill, soft pastel gradients only on hero and AI surfaces, and progressive disclosure so a
dense, high-quality analysis reads easily. It replaces the v1 "accent ladder / open plane" look (flat cards, one
muted blue, no gradients).

Sources: taste-skill app direction, anti-ui-slop finish gate, hallmark, ui-ux-pro-max (light mode, accessibility),
product owner request of 2026-10-22.

## 1. What this product is

A working tool for Convert Cake planners and their clients: type a brand, get a ranked shortlist of Thai TikTok creators,
expected results per post, a plan and next steps. It must look like a SaaS product someone opens every day, not a
landing page and not an AI demo. The user lands on a screen that already does something (analyses table, one button).
Summary first, detail on demand: every screen leads with what was learned and lets the reader open the evidence.

## 2. Hard bans

- No emoji anywhere (UI copy, empty states, toasts, chat replies rendered by our components, LINE messages).
- Gradients only through the tokens in `app/globals.css` and their utilities, never written inline or as Tailwind
  `bg-gradient-*` / `from-*` classes:
  - `bg-hero` (soft pastel radial blobs over white): the results hero card and other AI-written summary surfaces.
  - `bg-brand-grad` (cyan-blue): AI actions only (`Button variant="ai"`).
  - `text-brand-grad`: one short accent word or figure, never a sentence or paragraph.
  Nothing else: no glass, blur panels, glows, neon, animated or moving gradients, decorative blobs outside `bg-hero`.
- Shadows: resting cards use `shadow-card` (soft); clickable cards may lift to `shadow-raise` on hover; floating
  layers (sheets, dialogs, toasts, tooltips, menus) use `shadow-float`. No shadow or glow on buttons, nav pills or text.
- Icons in tinted tiles: only the KPI cards (one 32px tile per KPI, `bg-accent-soft` with an `--accent` icon, one hue
  for all of them). No tinted icon circles or squares anywhere else.
- The AI sparkle (`AiSparkleIcon`, three four-point stars) appears only on AI-generate actions and beside AI-written
  summaries. No magic-wand, robot or brain icons; no sparkle as decoration.
- No sparklines, no donut "score rings", no gauges.
- No uppercase tracked micro-labels, no monospace labels, no `01 / 02 / 03` numbering (rank numbers are fine).
- No "Welcome back", "Unlock the power of", "AI-powered", "Supercharge", "Seamless", lorem ipsum, invented metrics.
- No violet/indigo/purple hue: the accent blue, its cyan partner and semantic red/green/amber for status. Light lilac
  and peach exist only inside `--grad-hero`, at low alpha.
- No marketing hero. The results hero card summarises the analysis; it carries no slogan and no call to action
  beyond the screen's own actions.
- Never show a number we did not compute. Demo data is always labelled (banner + `isDemo`).

## 3. Tokens (CSS variables in `app/globals.css`, exposed to Tailwind v4 via `@theme`)

| Token | Value | Use |
|---|---|---|
| `--ground` | `#f3f6fd` | page background, `themeColor` |
| `--surface` | `#ffffff` | cards, sidebar, table body, sheets, top bar |
| `--raised` | `#eef3fc` | table header row, hover fills, segmented-control track, skeletons |
| `--border` | `#e1e7f5` | 1px card and container borders, sidebar edge |
| `--rule` | `#eaeff8` | row dividers inside cards, tab baseline |
| `--control` | `#cfd8ea` | secondary button border, dashed drop zones, disabled fills |
| `--input` | `#8590ab` | form-field border (3.19:1, WCAG 1.4.11) |
| `--placeholder` | `#67728b` | placeholder text (4.82:1) |
| `--text` | `#0f172a` | primary text and numbers |
| `--muted` | `#55607a` | labels, secondary text, inactive nav |
| `--subtle` | `#8792ab` | disabled and decorative only (3.12:1, never text someone must read) |
| `--accent` | `#1d5bff` | vivid blue: primary button, active nav pill, links, data marks, focus ring, selected states |
| `--accent-hover` | `#1449e0` | primary button hover |
| `--accent-soft` | `#eaf0ff` | selected rows and chips, accent badges, KPI icon tiles, AI summary panels |
| `--accent-track` | `#dce6ff` | progress tracks, bullet-bar bands, text selection |
| `--accent-line` | `#bfd0ff` | expected-KPI range band, selected card border |
| `--accent-ink` | `#0b3bc4` | text on `--accent-soft`, selected tab label, reference-median ticks |
| `--info` / `--info-soft` / `--info-ink` | `#0894b4` / `#e3f7fc` / `#086f88` | cyan partner: "inferred by the system" badges, secondary data marks (`--info` for marks and icons, `--info-ink` for text) |
| `--positive` / `--positive-soft` | `#127a4a` / `#e7f7ef` | above benchmark, within budget, completed |
| `--negative` / `--negative-soft` | `#c62a2f` / `#feeced` | failed, over budget, risk |
| `--warning` / `--warning-soft` | `#8f4c00` / `#fff5e1` | assumption, low confidence, partial |
| `--line-green` | `#06c755` | LINE login button only (LINE brand guideline) |
| `--overlay` | `rgb(15 23 42 / .36)` | backdrop of sheets and dialogs |
| `--grad-hero` | four radial blobs (cyan, lilac, peach, blue) at 10–22% alpha | `bg-hero` only |
| `--grad-brand` | `linear-gradient(135deg, #0a6fc2, #1d5bff)` | `bg-brand-grad`, `text-brand-grad` |
| `--shadow-card` | `0 1px 2px rgb(15 35 95/.04), 0 2px 12px rgb(15 35 95/.05)` | resting cards (`shadow-card`) |
| `--shadow-raise` | `0 2px 4px rgb(15 35 95/.05), 0 10px 28px rgb(15 35 95/.09)` | hover lift of clickable cards |
| `--shadow-float` | `0 16px 40px rgb(15 35 95/.14), 0 2px 6px rgb(15 35 95/.06)` | sheets, dialogs, toasts, tooltips |

Contrast (WCAG 2.x): `--text` on `--surface` 17.9:1, on `--ground` 16.5:1 · `--muted` on surface 6.3:1, on ground
5.8:1, on raised 5.7:1 · `--accent` on surface 5.3:1, on ground 4.9:1, on accent-soft 4.6:1 · white on `--accent`
5.3:1, on `--accent-hover` 6.9:1, on every stop of `--grad-brand` 5.2:1 or more · `--accent-ink` on accent-soft
7.6:1 · `--info-ink` on info-soft 5.2:1 · status inks on their soft fills 4.8–6.1:1. `--info` and `--subtle` are not
text colours.

Colour use: a calm blue-grey canvas with colour spent on meaning. Solid `--accent` on the primary action, the active
nav pill, selected marks and data; soft tints (`--accent-soft`, `--info-soft`) for areas. Never fill a section or a
card with solid `--accent` or `bg-brand-grad`; `bg-hero` is the one large tinted surface.

Radius: card 16 · control 10 · chip full (pill) · avatar full circle · skeleton 8. Borders 1px `--border`.
Focus: `outline: 2px solid var(--accent); outline-offset: 2px` on every interactive element; form fields draw it on
their border (offset 0) with a 4px `--accent-soft` halo. Never `outline: none` without a replacement.

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
`formatDateTh` → `21 ต.ค. 2569`). Paragraphs cap at about 70 characters per line (`max-w-[70ch]`).

## 5. Shell — white sidebar, collapsible rail

- **Desktop ≥ 1024:** a white (`--surface`) sidebar with a 1px `--border` on its right edge, 248px wide, collapsible
  to a 76px icon rail. No top bar. Canvas on `--ground`, 32px gutter, content max 1280px, page header 32px from the top.
- **Sidebar contents (top → bottom):** header row with the product mark + "Convert Cake / Influencer" (13px) and the
  collapse toggle (lucide `PanelLeftClose` / `PanelLeftOpen`, 36px, label "ย่อแถบเมนู" / "ขยายแถบเมนู"); primary nav;
  group label "บัญชี" 12px `--muted` pinned to the bottom with the account nav and the user row under a 1px rule.
- **Nav rows:** 44px tall, radius 10, 18px lucide icon at 1.75 stroke, label 14. Inactive: `--muted` icon and label at
  300, hover `--raised`. **Active:** solid `--accent` pill, white icon and label at 400, `aria-current="page"`.
- **Nav items:** วิเคราะห์ (`/`), วิเคราะห์ใหม่ (`/new`), ที่บันทึกไว้ (`/saved`) · bottom: บัญชี (`/account`), user row
  (LINE picture + name, or a person icon + "ผู้ใช้ทั่วไป" with a "เข้าสู่ระบบด้วย LINE" text button).
- **Collapsed rail (76px):** icons, the product mark and the avatar stay on one centre line; labels are visually
  hidden but stay the links' accessible names; each icon shows a Tooltip on the right on hover and focus; the account
  label and workspace text are hidden; the user row becomes its avatar (or person icon), a link to `/account` with a
  tooltip. Keyboard order and landmarks do not change.
- **Collapse mechanics:** the choice persists in `localStorage['cvc:sidebar-collapsed']` (`'1'` / `'0'`, wrapped in
  try/catch). An inline script in `app/layout.tsx` sets `<html data-sidebar="collapsed">` before the first paint, and
  CSS does the rest (`--sidebar-w` for the grid column, the `rail:` variant inside the `[data-rail]` aside), so a
  collapsed sidebar never flashes wide. React state (`useSidebarCollapsed`) only turns the tooltips on. The column
  width animates over 200ms, off under reduced motion.
- **Product mark:** a drawn SVG (22px in the sidebar), two overlapping circles (brand ↔ creator, "match") in
  `--accent` stroke 1.75, the overlap filled `--accent-soft`. Not a letter in a square.
- **Phone and tablet < 1024:** a 48px white top bar (menu button, screen name 16/500, at most one action). The menu
  opens a full-screen sheet with the same nav (never collapsed). Content full width with 16px (24px from 640) margins.
- **Canvas width:** `<main>` is a size container named `main`. Layouts that depend on the room beside the sidebar use
  container queries (`@min-[1280px]/main:grid-cols-[minmax(0,1fr)_384px]`), not viewport breakpoints, so collapsing
  the sidebar gives the content the room.
- **Page header:** title 24/500 + optional one-line description 14/300 `--muted`; the one primary action on the right,
  bottom-aligned with the description. The results screen uses a hero card instead (§8).

## 6. Components

- **Buttons** (`components/ui/button.tsx`): primary = solid `--accent`, white 14/400, height 36 (44 on phones), radius
  10, at most one per screen. Secondary = white with 1px `--control` border, `--text`; hover tints to `--accent-soft`.
  Tertiary = text button in `--accent`. Danger = white with a red border. **AI** (`variant="ai"`) = `bg-brand-grad`,
  white label and `AiSparkleIcon tone="current"`, only for actions that ask the model to write something. Icon-only
  buttons use `size="icon"` (round, 36px, 44 on phones) with an `aria-label`. No shadows on buttons. Hover transitions
  150ms on colour/background; `cursor: pointer` on everything clickable.
- **Inputs:** height 36 (44 on phones), 1px `--input` border, radius 10, 14/300 (16px on phones); label above at
  13/400; helper text below at 12 `--muted`; error text in `--negative` with the field border red. Focus: accent
  border + outline with an `--accent-soft` halo. Thai placeholders as examples, not instructions.
- **Cards:** white, 1px `--border`, radius 16, `shadow-card`, padding 20 (16 on phone). Section heading sits outside
  the card, 8px above it. KPI cards: separate cards, a 32px `--accent-soft` icon tile, the figure 24/400, one caption.
- **Tables:** header row 12/400 `--muted`, sentence case, `--raised` fill; rows 48px with 1px `--rule` dividers, no
  zebra; numbers right-aligned tabular; row hover `--raised`; clickable rows open the detail sheet.
- **Badges:** pill (full radius), 12/400, 2×10 padding: neutral (`--raised`/`--muted`), accent
  (`--accent-soft`/`--accent-ink`), info (`--info-soft`/`--info-ink`, for "ระบบวิเคราะห์ให้" / "ระบบเลือกให้"), positive,
  warning, negative soft pairs. Text only, no icons inside badges except a 6px status dot when needed.
- **AiSparkleIcon** (`components/ui/ai-sparkle.tsx`): the AI mark, cyan `#3dd9ff` → blue `#1d5bff` gradient, 14–18px,
  always next to text that names the action or the summary (it is `aria-hidden`). See §2 for where it may appear.
- **Disclosure** (`components/ui/disclosure.tsx`): the progressive-disclosure primitive. A button with
  `aria-expanded` / `aria-controls` (inside an h2–h4 for sections), a chevron that turns, a panel that is `hidden`
  while closed. Variants: `section` (rows inside a card), `card` (its own card), `inline` (a small "ดูรายละเอียด" toggle).
- **Avatar:** creator photo from `avatarUrl` (Vercel Blob) in a circle with a 1px `--border` ring; sizes 32 (table),
  40 (list), 64 (sheet). `next/image` with `remotePatterns` for `*.public.blob.vercel-storage.com`. When `avatarUrl` is
  null: initials (first two letters of the handle without `@`) on `--accent-soft` with `--accent-ink` text. Never a
  stock or generated face.
- **Sheet:** right side, 560px desktop / full screen phone, white, `shadow-float`, header with avatar + handle + close.
- **Tabs:** 14/400 labels, the selected one in `--accent-ink` with a 2px `--accent` underline running 4px past the
  label, on a 1px `--rule` baseline.
- **Tooltips:** white, 1px border, radius 10, `shadow-float`, 12px; on hover and focus, Escape hides; `side="right"`
  in the collapsed rail.
- **Toasts:** bottom-right, white, `shadow-float`, one line, 4s.
- **Skeletons:** `--raised` blocks at the real size of the content (8px corners, or the real shape), 1.2s opacity
  pulse (disabled under reduced motion).

**Progressive disclosure** (results, plan, sheet tabs, long forms):

1. Lead with the summary that answers the screen's question (brand overview, portfolio headline, KPI cards, the
   ranked table). Open by default: the one section a reader needs to decide (e.g. the consultant summary).
2. Put long, secondary or reference material behind a Disclosure that is closed by default and shows a one-line
   preview of what is inside (methodology, evidence, timeline, playbook groups, "ที่มาของตัวเลข", partial-result details).
3. Nothing is removed: every piece of content stays reachable in one click or key press, and stays in the DOM.
   Deep links (`?creator=`) and focus return keep working.
4. Per-row detail opens in place (table row accordion with its own chevron button before the rank) or in the sheet;
   multiple rows may be open. The trigger never nests inside another button or a clickable row's click target.
5. Never hide a warning, a caveat that changes the decision, or a number the summary quotes.

## 7. Signature elements (use these, they make the product recognisable)

1. **Creator photos** in every list and table row (Blob-cached), handle 14/400 + display name 13/300 `--muted`.
2. **Fit strip** — five thin bars (fit, audience, performance, trust, cost), 40×6px each with 4px gaps, `--accent-track`
   track, `--accent` fill to the creator's group score, and a 1px `--accent-ink` tick at the pool median
   (`benchmarks.poolMedianScores`). Tooltip lists the five numbers. Used in the creators table and the sheet header.
3. **Expected-views bullet** — a 160×8px track: `--accent-line` band from p25 to p75 of `expectedKpis.perPost.views`,
   a 2px `--accent` tick at p50, a 1px `--accent-ink` tick at the tier median views. Label to its right: "62K" (p50)
   with "42K–80K" under it in 12/300 `--muted`.
4. **Confidence badge** on every KPI estimate: สูง / ปานกลาง / ต่ำ (positive / neutral / warning). Estimates built on
   `assumption_to_calibrate` benchmarks carry a warning badge "สมมติฐาน" with the note in a tooltip.
5. **AI-written summaries** (brand overview, per-creator fit summary): `AiSparkleIcon` + a short label
   ("สรุปแบรนด์จากการวิเคราะห์", "สรุปความเหมาะสม") over the paragraph, on `bg-hero` or `--accent-soft`.

## 8. Screens

| Route | Content |
|---|---|
| `/` วิเคราะห์ | Header "การวิเคราะห์" + primary "วิเคราะห์แบรนด์ใหม่". Table: แบรนด์ (logo or initials + name), สถานะ (badge), ครีเอเตอร์ (stack of 3 avatars), วันที่, actions. Guest data from IndexedDB, LINE users from `/api/history`. Empty state: framed area with one sentence "ยังไม่มีการวิเคราะห์" + the same primary button. |
| `/new` วิเคราะห์ใหม่ | Single column 720px. Sections as cards: แบรนด์ (company name required, website, Facebook, TikTok), กลุ่มลูกค้า (ไม่บังคับ: AI assist bar, persona chips multi-select + notes), แคมเปญ (ไม่บังคับ: AI assist bar, objective segmented control with "ระบบเลือกให้" first, budget min/max, number of creators with "ระบบแนะนำให้"), ไฟล์ประกอบ (screenshots ≤ 3 drag/drop with thumbnails; voice record or upload ≤ 3 min → transcript textarea, editable). Empty audience/campaign = the agent infers them. Sticky footer bar with summary + primary "เริ่มวิเคราะห์". |
| `/runs/[id]` | Header = company name + status badge + cancel (secondary). Left: vertical stage list (normalize → prefetch → brand → discover → evaluate → rank → curate) with state per row (done check / spinner / waiting) and the Thai message; elapsed and ETA. Right rail 384px: brand card when `partial.brand` arrives, candidate count, preview avatars. Polls `/api/agent/runs/:id/events?after=` every 2s; on `completed`/`partial` → `/results/[resultId]`. Failure: error block in place with retry. |
| `/results/[id]` | Hero card (`bg-hero`): AI label + brand name as title + the brand overview paragraph (what the analysis learned from the page and website; says what was inferred), industry/tone chips and "ระบบวิเคราะห์ให้" / "ระบบเลือกให้" info badges, meta line, actions บันทึก (primary), แชร์/ส่งออก (secondary, disabled for guests with a reason). Then "ภาพรวมชุดครีเอเตอร์" with the `headlineTh` lead and KPI cards. Then grid `1fr 384px` (container query on `main`), gap 24. Main: "ครีเอเตอร์ที่แนะนำ" table: chevron (row summary accordion), rank, avatar + handle, tier badge, followers, expected views bullet, ER, fee range, CPV, fit strip, total score; row → sheet. Below: alternatives, methodology and evidence (collapsed). Rail: tabs "แผนงาน" (consultant summary open, other sections collapsed with previews) and "ถาม-ตอบ" (chat). Demo banner on top when `isDemo`. |
| Creator sheet | Header: avatar 64, handle, display name, tier, followers, profile link (external icon), fit strip. Tabs: ภาพรวม (fit summary first, then whyMatchTh with evidence links, risks, rubric table 0/1/2 with notes), คาดการณ์ (expected KPIs table p25/p50/p75 for views, engagements, clicks, orders; cost per view/engagement; basis paragraph behind "ที่มาของตัวเลข"; confidence), วิธีใช้งาน (playbook groups as disclosures), ขั้นตอนถัดไป (this creator's next actions), วิดีโอ (top videos with covers from Blob, views, why). |
| `/saved` | Saved results table (title, brand, tags, updated, pin). Guests see IndexedDB items with a note that they live in this browser only and a LINE login button. |
| `/account` | Profile, LINE connection, notice acknowledgement, push opt-in, export data, delete account (destructive confirm dialog). |
| `/liff` | LIFF entry: init, login, notice acknowledgement, then the same screens in the phone shell. |
| `/share/[token]` | Read-only result (same hero card) without chat and without save. |

## 9. States (every data block)

Loading = skeletons at real size · Empty = framed area, one sentence, one action · Error = inside the block, plain Thai
cause + "ลองอีกครั้ง" · Partial = warning banner naming what is missing (details behind "ดูรายละเอียด") · Demo = neutral
banner "ข้อมูลตัวอย่าง: ยังไม่ได้ตั้งค่า API keys ผลลัพธ์นี้สร้างจากข้อมูลสมมติ" at the top of results and run pages ·
AI busy (assist bar) = disabled control with a spinner, the result or error inline.

## 10. Copy

Thai first, short, specific, sentence case. Verbs on buttons ("เริ่มวิเคราะห์", "บันทึกผล", "ดูโปรไฟล์"). Units always
shown (฿, ครั้ง, %). Estimates say "คาดการณ์" and show the range. No exclamation marks. Say what the system inferred
plainly ("ระบบวิเคราะห์กลุ่มลูกค้าให้จากเพจและเว็บไซต์"), never "AI-powered".

## 11. Accessibility and motion

WCAG AA contrast (§3 lists the ratios; text on `bg-hero` and white on `bg-brand-grad` pass), visible focus,
keyboard reachable sheet/tabs/menus/disclosures (Escape closes, focus returns), `aria-expanded` + `aria-controls` on
every disclosure and accordion trigger, `aria-live="polite"` for progress updates, form errors linked with
`aria-describedby`, 44px touch targets on phone, icon-only controls named (`aria-label` or visually hidden text) with
a tooltip, `prefers-reduced-motion` disables pulses, the sidebar width transition and chevron turns. Gradients never
animate. Check at 375 / 768 / 1024 / 1440, with the sidebar expanded and collapsed.

## 12. Finish gate (run before calling a screen done)

`node .claude/skills/design-taste-frontend/scripts/lint.mjs --app <dirs>` and `inspect.mjs --app <url>` pass; screenshot
at 375 and 1440 reviewed; no banned item from §2; every state in §9 reachable; numbers right-aligned and tabular.
The gate allows only the declared gradient tokens: a `--grad-*` custom property and `@utility` blocks that apply it
(`bg-hero`, `bg-brand-grad`, `text-brand-grad`); any other gradient or clipped text still fails. Icons in tinted tiles in
more than one hue fail `icon-chips`, which is why KPI tiles share `--accent-soft`.
