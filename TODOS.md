<!-- /autoplan restore point: /Users/omar/.gstack/projects/Nouhi-matside/claude-focused-napier-b01ea5-autoplan-restore-20260511-063024.md -->
# matside TODOs

Triaged via `/autoplan` on 2026-05-11 (CEO + Design + Eng + DX pipeline, codex unavailable, single-voice consensus). Starting backlog: 21 items (14 design + 7 eng) from `/plan-design-review` 2026-05-07. Triage outcome: ship 4 bundles (~10 engineer-hours), defer 2, kill 8, surface 7 missing roadmap items.

Approved mockup reference: `~/.gstack/projects/Nouhi-matside/designs/scoreboard-display-20260506/variant-A.html` (Variant A — Classic IJF Broadcast).

---

## SHIP NOW — 4 Bundles (~10 engineer-hours total)

**Recommended PR order** (sharpened in Phase 3 eng review): **1 → 4 in parallel → 2 → 3**.
- Bundle 1 first (biggest review surface, exposes `WinMethod` literal union the frontend can consume in Bundle 2).
- Bundle 4 can ship in parallel with Bundle 1 — zero dependencies, 10-min Tailwind class change.
- Bundle 2 depends on Bundle 1's frontend `WinMethod` union (otherwise Bundle 2 duplicates the union).
- Bundle 3 is independent of Bundles 2 and 4.

Each bundle is one PR.

### Bundle 1 — Type hygiene + concurrency hardening (PR 1, ~2h CC)

Ships: **ENG-Q1, ENG-Q2, ENG-Q4, ENG-A2, ENG-A4**. Specs sharpened during `/autoplan` Phase 3 — original spec had 3 critical errors (wrong `$transaction` form, duplicate `MatchScores` in standings, missing socket-boundary validation).

#### ENG-Q1 — Single source of truth for `MatchScores` types

- Create `backend/src/scoreboard/scoreboard.types.ts`. Export `MatchScores` (with `yuko: number` REQUIRED, not optional) and `CompetitorScore`.
- **Delete the duplicate `MatchScores` in `backend/src/standings/standings.types.ts:1-4`.** Standings imports from scoreboard. The current duplicate has `yuko?: number` (optional) which is silently incompatible — it's only working today via an `as unknown as StandingMatchScores` cast at `scoreboard.service.ts:646`. Drop the cast as part of this work.
- Frontend `useScoreboard.ts` keeps an identical local copy with comment `// MUST MATCH backend/src/scoreboard/scoreboard.types.ts`. Frontend tsconfig has no path alias to backend; a shared `packages/types` workspace is overkill for 2 interfaces.
- **Also widen the frontend `winMethod` type** from `string` to literal union `'IPPON' | 'WAZA_ARI' | 'DECISION' | 'HANSOKU_MAKE' | 'FUSEN_GACHI' | 'KIKEN_GACHI'` so Bundle 2's variant switch can be type-safe. Same "must match backend" comment.
- **Add a satisfies-style test** at `frontend/src/hooks/useScoreboard.test.ts` that asserts the frontend `MatchScores` shape against a hand-mirrored backend type. If they drift, type-check fails.

#### ENG-Q2 — Drop `as unknown as` casts on `MatchState`

- Extend frontend `MatchState` in `useScoreboard.ts:15-25` to include:
  - `competitor1?: { id: string; firstName: string; lastName: string; club?: string }` (add `club`)
  - `competitor2?: { ...same shape }`
  - `category?: { name: string }`
- The backend `getMatchState` (scoreboard.service.ts:178) already includes `category: true` and full competitor relations, so the wire data is consistent.
- Drop the 3 `as unknown as` casts in `DisplayPage.tsx:390-392`.
- Audit `applyScoreEvent` (scoreboard.service.ts:51), `startMatch` (:122), `endMatch` (:138), `enableGoldenScore` (:208) — they each currently use `include: { competitor1: true, competitor2: true }` without category. That's fine because category is invariant per match: it arrives on the `match-state` event (gateway join-mat path) and survives subsequent state patches.

#### ENG-Q4 — Drop `any` from `WinMethod` and `match`

- Import `WinMethod` and `Prisma` from `@prisma/client` in `scoreboard.service.ts`.
- Type `ApplyResult.match` (line 40) as `Prisma.MatchGetPayload<{ include: { competitor1: true; competitor2: true } }>`.
- Type internal `winMethod` variable at line 71 as `WinMethod | undefined`. Drop `winMethod as any` at lines 92, 137.
- **Add runtime validation at the socket boundary** (gateway.ts:113 `end-match` message). The `winMethod: string` arriving from the wire is unvalidated user input. Add a guard:
  ```ts
  const VALID_WIN_METHODS = Object.values(WinMethod);
  if (!VALID_WIN_METHODS.includes(payload.winMethod as WinMethod)) {
    throw new WsException('Invalid winMethod');
  }
  ```
  Prisma would reject at write time anyway, but a clear WsException beats a 500 over the socket.

#### ENG-A2 — Transaction-wrap `applyScoreEvent` tail (interactive form)

**CRITICAL CORRECTION** from the original spec: `prisma.$transaction([find, update])` array form CANNOT pass data between operations. The advancement chain has 6+ sequential reads with data dependencies (`findFirst` returns the next-slot ID that the `update` consumes). Must use interactive form.

- Wrap the tail of `applyScoreEvent` (lines 95-104) — the `match.update` + `advanceWinner` + `advanceMatQueue` sequence — in `this.prisma.$transaction(async (tx) => { ... })`.
- Thread `tx` through `advanceWinner` and ALL its helpers (`advanceWinnerInPools`, `advanceWinnerInDoubleRepechage`, `advanceWinnerInGrandSlam`, the SINGLE_REPECHAGE branch). Replace every `this.prisma.X` inside with `tx.X`.
- Same treatment for `endMatch` (lines 126-145) and `maybeCreateKnockoutMatchesAfterPoolStage` (lines 609-750).
- **Document the concurrency boundary:** the transaction wrap prevents partial DB writes within one `applyScoreEvent` call. It does NOT prevent two concurrent score events (e.g., manual end-match collision with the osaekomi-20s auto-IPPON setTimeout at gateway.ts:140) from racing. Postgres default isolation (READ COMMITTED) doesn't serialize them. Mitigation for that race is out of scope for Bundle 1 — track as ENG-A5 (new) in DEFER for now.

#### ENG-A4 — ASCII diagrams in 3 spots

- `single-repechage.util.ts:getNextSlot` — slot mapping `(R, P) → (R+1, ⌈P/2⌉)` with isCompetitor1 rule.
- `scoreboard.service.ts:advanceWinner` — state machine showing R1 → R2 → R3 → bronze paths per bracket type.
- `standings/round-robin.util.ts:rankRoundRobin` — IJF tiebreaker chain (H2H → ippons → waza-ari → fewest shidos).

#### Bundle 1 — Test plan (sharpened)

- `cd backend && npx tsc --noEmit` — passes.
- `cd frontend && npx tsc --noEmit` — passes.
- **New backend test:** `backend/src/scoreboard/scoreboard.service.spec.ts` — add cases that mock `prisma.$transaction(async (tx) => fn(tx))` to invoke the callback with a `tx` proxy and assert the right advancement update is called with the right slot. Otherwise the existing `scoreboard.gateway.spec.ts` mocks `applyScoreEvent` and won't catch a broken transaction wrap.
- **New frontend test:** the satisfies-style type-mirror test in `useScoreboard.test.ts` (mentioned in ENG-Q1).
- Manual smoke: score a match through to completion, verify R1 winner advances to R2, verify standings tab still renders the standings (catches the `as unknown as` cast removal).

**Bundle 1 — Files touched:** backend new `scoreboard/scoreboard.types.ts`, modified `scoreboard/scoreboard.service.ts`, `scoreboard/scoreboard.gateway.ts`, `standings/standings.types.ts`, `standings/round-robin.util.ts`, `brackets/single-repechage.util.ts`, new `scoreboard/scoreboard.service.spec.ts` cases; frontend modified `useScoreboard.ts`, `DisplayPage.tsx`, new `useScoreboard.test.ts`.
**Risk:** medium (was: very low). The transaction-wrap touches concurrency-sensitive advancement code. Type-only changes are still very low risk; the `$transaction` interactive form needs careful threading.

### Bundle 2 — Broadcast feel (PR 2, ~5h CC ≈ ~25 min CC actual)

Ships: **F3.B, F1.B, F3.C**. Specs locked during `/autoplan` Phase 2 — the original spec had critical gaps (GS interaction, SCHEDULED misfire, IPPON ambiguity, WAZA_ARI fire trigger).

#### F3.B — Final 30s timer pulse on Display

**Gating** (CRITICAL — original spec missed this; sharpened in Phase 3 eng review):
- Pulse active only when `matchState.status === 'ACTIVE' && !matchState.goldenScore && timerSeconds > 0`.
- The `timerSeconds > 0` clause specifically guards the GS-transition race: today the timer effect clamps `remaining` to `>= 0`, so when GS engages, `timerSeconds` sits at `0` permanently. Without the `> 0` guard, the 0s flash animation would fire once on every GS transition. (There is no count-up GS timer in the codebase today; adding one is out of scope for this bundle.)
- During SCHEDULED, COMPLETED, or any non-ACTIVE state: no pulse, no color change.

**Thresholds** (countdown direction, regulation only):
- `> 30s`: white text, no animation.
- `≤ 30s and > 10s`: amber text (`#fbbf24`), no animation. (Calm but warmer.)
- `≤ 10s and > 0s`: red text (`#ef4444`), pulse animation 1s ease-in-out, opacity 100% → 60% → 100%.
- `= 0s`: red text, flash animation (3 quick blinks over 750ms, then static red).

**CSS** (add to `index.css`):
```css
@keyframes timer-pulse-warn { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
@keyframes timer-flash-end { 0%,33%,66%,100% { opacity: 1; } 16%,50%,83% { opacity: 0.2; } }
.timer-pulse { animation: timer-pulse-warn 1s ease-in-out infinite; }
.timer-flash { animation: timer-flash-end 750ms ease-in-out 1; }
@media (prefers-reduced-motion: reduce) {
  .timer-pulse, .timer-flash { animation: none; }
  /* Color change is preserved — that's the urgency cue under reduced-motion. */
}
```

**Files:** `DisplayPage.tsx` (CenterBar — conditional class on the timer span), `index.css`.

#### F1.B — "STARTING SOON" overlay on SCHEDULED-status matches

**Trigger:** `matchState.status === 'SCHEDULED' && matchState.competitor1 && matchState.competitor2` (match assigned, BOTH competitors known). If a SCHEDULED match has only one competitor (TBD slot in bracket): do NOT show STARTING SOON — fall through to the LIVE scoreboard layout (CompetitorRow + CenterBar + CompetitorRow). The existing "Waiting for match" full-screen state at `DisplayPage.tsx:397-403` is only reachable when `!matchState` — that path is unaffected.

**Layout:** Full takeover of the CenterBar only (the timer slot). Competitor rows REMAIN visible underneath. The category strip above also remains visible. This is the same vertical real-estate the timer occupies, replaced.

**Visual:**
- Background: `linear-gradient(180deg, #000000 0%, #0a0f1f 100%)` — matches the existing black scoreboard backdrop.
- Headline: "STARTING SOON" in `#c9a64b` (the IJF gold token used elsewhere on the scoreboard), `clamp(64px, 9vw, 140px)`, font-weight 900, letter-spacing 0.05em, no animation.
- Subtext (one line below): `<category.name> · <bout number if known>`, white at 70% opacity, `clamp(20px, 2.5vw, 40px)`, font-weight 600.
- Reduced-motion: irrelevant (no animation).

**A11y:** `role="status"`, `aria-live="polite"`. Screen readers on the venue laptop announce the upcoming match once. Not relevant for TV display but cheap to include.

**Files:** `DisplayPage.tsx` (new `<StartingSoonBar>` component rendered in place of `<CenterBar>` when trigger fires).

#### F3.C — Win-method-specific banner styling

**Fire condition** (CRITICAL — original spec was ambiguous):
- `WinBanner` renders **only when `matchState.status === 'COMPLETED' && matchState.winMethod`**.
- Never mid-match. Never on score events. A score-event handler must NOT touch this banner.
- For IPPON specifically: `IpponOverlay` plays first (4s, full-screen drama, current behavior unchanged). Once `onAnimationEnd` fires, `WinBanner` takes over as the **static post-overlay label** — no `animate-pulse` on the IPPON banner anymore.

**Method-by-method spec table:**

| Method | Display copy | Background | Text color | Animation | A11y label |
|--------|--------------|------------|------------|-----------|-----------|
| IPPON | "IPPON" | `#c9a64b` (gold) | `#000` | none (static post-overlay) | "Match won by ippon" |
| WAZA_ARI | "WAZA-ARI" | `#d4b669` (lighter gold) | `#000` | none | "Match won by waza-ari" |
| DECISION | "DECISION" + winner name on winner's color half | Vertical split: blue half `#0a3a7a` (IJF blue) on competitor1 side, white half `#fff` on competitor2 side | Blue half: white text. White half: `#0a3a7a` text. | none | "Match decided in favor of {winner}" |
| HANSOKU_MAKE | "HANSOKU-MAKE" + subtitle "DISQUALIFICATION" | `#991b1b` (red-800) | `#fff` | none — current red border/glow style is fine and stays | "Match ended by disqualification" |
| FUSEN_GACHI | "FUSEN-GACHI" + subtitle "FORFEIT" | `#525252` (neutral-600) | `#fff` | none | "Match won by forfeit (opponent did not appear)" |
| KIKEN_GACHI | "KIKEN-GACHI" + subtitle "WITHDRAWAL" | `#525252` (neutral-600) | `#fff` | none | "Match won by withdrawal" |

(Phase 3 correction: an earlier draft of this table included a `SOREMADE` row. The Prisma `WinMethod` enum has only 6 values — see `backend/prisma/schema.prisma:279-286` — and SOREMADE is not one of them. Adding it would require a migration, which Bundle 1 explicitly avoids. Dropped from the variant table.)

**Other methods:** if `winMethod` is anything outside these 6 (or null after COMPLETED), fall back to generic gold banner showing the raw enum text. Log a `console.warn` so we catch new enum values added later.

**Reduced-motion:** all variants are static. The existing `WinBanner` `animate-pulse` is removed across the board — drama lives in `IpponOverlay` for IPPON, and the static color/typography carries the rest.

**Files:** `DisplayPage.tsx` (WinBanner refactor — switch on winMethod), `index.css` (add the variant classes, remove the existing `animate-pulse` from WinBanner).

**Bundle 2 — Files touched:** `DisplayPage.tsx`, `index.css`.
**Risk:** medium. Touches the most-watched UI in the product. Verify with all 7 win methods.
**Test plan:**
1. Type-check passes.
2. Manual: trigger each of the 7 win methods (force via dev tools or backend script). Verify the right banner appears at COMPLETED, never mid-match.
3. Manual: assign a match without starting it. Verify STARTING SOON appears with competitor names + category.
4. Manual: run a match to 0:30 / 0:10 / 0:00. Verify color changes + pulse + flash at the right thresholds.
5. Manual: hit Golden Score during regulation expiry. Verify timer pulse/flash STOP when GS engages.
6. Manual: enable `prefers-reduced-motion` in OS. Verify animations replaced by static color changes.

### Bundle 3 — Spectator standings tab (PR 3, ~3h CC ≈ ~20 min CC actual)

Ships: **F7.D2** (the only TODO with a real user premise — family of competitors looking up their fighter). Spec locked during `/autoplan` Phase 2 — original "mobile layout" was undefined.

**Data layer** (Phase 3 correction: original spec falsely claimed cache reuse with StandingsTab):
- `SpectatorPage.tsx` currently uses raw `api.get` + `setInterval` (lines 174-202). It does NOT use TanStack Query. To stay consistent with the surrounding page, `SpectatorStandings` should use the same `api.get` + polling pattern, not introduce TanStack Query just for one component.
- `useEffect` hook calling `api.get('/competitions/:competitionId/standings')` every 5s. `useState` for the latest standings response. Clear interval on unmount.
- Reuse the `rankBadge()` helper from `StandingsTab.tsx` (export it from there) and `BRACKET_LABELS` from `@/lib/bracket`.
- Do NOT reuse `RoundRobinTable` directly — it's a 7-column desktop table that overflows 375px. Build a mobile alternative below.

**Tab bar (bottom-fixed nav, not tablist):**
- Semantics: `<nav role="navigation" aria-label="Spectator views">` containing two buttons. NOT `role="tablist"` — these are page-level navigation, not in-page tabs.
- Position: `position: fixed; bottom: 0; left: 0; right: 0`. iOS safe-area: `padding-bottom: env(safe-area-inset-bottom)`.
- Height: 56px content + safe area. Each button ≥ 44×44px touch target.
- Background: `#0a0f1f` with `border-top: 1px solid #1f2937` (matches existing scoreboard tone).
- Active tab indicator: 3px top border in `#c9a64b` (IJF gold) on the active button, none on inactive. Icon (Lucide `Activity` for Live Mats, `Trophy` for Standings) + label below in 12px font.
- Switching tabs: in-page state via `useState<'live' | 'standings'>('live')`. URL stays the same (no route change). Keyboard: `Tab` + `Enter` works. Focus moves to the panel heading on switch.
- Bottom padding on content area: 80px (56px tab bar + safe area + breathing room) so the last card isn't covered.

**Standings panel — mobile layout:**

Per-category card (replaces `RoundRobinTable` on mobile). For each category:

```
┌──────────────────────────────────────┐
│ -73kg                           [POOLS] │ ← category header (existing flex flex-wrap)
├──────────────────────────────────────┤
│  🥇  YAMAMOTO, Kenji           [Tokyo] │ ← rank 1, big name, club pill
│  └─ 3W 0L · 2 ippon · 1 waza-ari       │ ← stats row, small muted text
│ ────────────────────────────────────── │
│  🥈  KIMURA, Hiroshi           [Osaka] │
│  └─ 2W 1L · 1 ippon · 1 waza-ari       │
│ ────────────────────────────────────── │
│  🥉  TANAKA, Daisuke           [Kobe]  │
│  └─ 1W 2L · 0 ippon · 2 waza-ari       │
└──────────────────────────────────────┘
```

- Show rank 1-3 by default. If category has 4+ competitors AND status is COMPLETE, hide rank 4+ behind a tappable "Show all rankings (N more)" footer that toggles `expanded` state per category.
- Rank icon (🥇🥈🥉) for top 3, otherwise the rank number in a circle.
- Name: 18px, font-weight 600. Club: 12px, neutral-400.
- Stats row (only for round-robin standings): 14px, neutral-500. For elimination brackets, omit the stats row (no W/L tally tracked).
- Tap expansion: chevron right (→) becomes chevron down (↓) on expand. `aria-expanded` true/false.

**Empty states** (CRITICAL — original spec showed organizer copy "Generate categories" to spectators):
- No categories yet: large centered icon + "Bracket coming soon — check back when matches start." in 16px neutral-400. NO "generate categories" copy.
- All categories IN_PROGRESS, no rankings: per-category card shows "Matches in progress — no rankings yet" instead of the rank rows. Less scary.
- Socket disconnect during standings polling: existing `<DisconnectBanner>` on SpectatorPage already covers it. Standings table renders last-known data, which is acceptable.

**Files touched:** `SpectatorPage.tsx` (tab bar + panel switching), new `frontend/src/components/SpectatorStandings.tsx` (mobile layout, reuses `useQuery` key + bracket helpers).
**Risk:** low-medium. New page surface + new component, but reuses data layer. Mobile-only — desktop spectator gets the same view (acceptable; spectator is phone-first).
**Test plan:**
1. Type-check passes.
2. Manual: open `/spectator/<id>` on 375px viewport. Verify tab bar at bottom with safe-area inset.
3. Manual: tap Standings tab. Verify standings panel renders. Verify no horizontal scroll.
4. Manual: with 0 categories, verify empty-state copy is spectator-friendly (not organizer copy).
5. Manual: complete a round-robin category. Verify top-3 with rank icons + club + stats.
6. Manual: tap "Show all rankings" on a 5+ competitor category. Verify expand/collapse with chevron and `aria-expanded`.
7. Manual: keyboard navigation — Tab to each nav button, Enter to switch panels. Verify focus moves to panel heading.
8. Manual: disconnect socket (DevTools offline). Verify DisconnectBanner shows AND standings keep showing last-known data.

### Bundle 4 — F4.A tiny slice (PR 4, ~10 min CC)

Ships: **F4.A reduced scope only**

- Change active tab underline color on the dashboard to IJF blue (`#0a3a7a`). Single Tailwind class change.
- **Skip** the rest of F4.A (status pills, standings podium tokens) — those depend on F5.A which is killed.

**Files touched:** `CompetitionDetailPage.tsx`.
**Risk:** zero. One-line CSS.
**Test plan:** open dashboard, click between tabs, verify underline color.

---

## DEFER — Re-evaluate only when a real customer reports it

### F2.B — Control offline queue (IndexedDB)

**What:** Queue score events in IndexedDB when socket drops, replay on reconnect.
**Why defer:** Tier 1 disable-buttons already shipped. The 1% case where reconnect is slow does not justify 2-3 engineer-days. **Server idempotency (sequence numbers) must ship before client queue, or you get double-counted scores.** TODO has the dependency right — answer is "don't start until a customer complains."
**Re-evaluate when:** A tournament reports lost score events under bad Wi-Fi.

### F4.A full scope — Pull IJF tokens into admin UI (beyond tab underline)

**What:** Status pills + standings podium binary in IJF blue/white.
**Why defer:** The premise (admin/scoreboard cohesion) is real but small. Bundle 4 ships the highest-impact slice. The rest is incremental.
**Re-evaluate when:** A user complains the dashboard looks generic. Bundle with a future visual pass.

---

## KILLED — Removed from backlog

These 8 items will not ship. Rationale per item:

### F1.A — Spectator visual coherence (drop gray Mat N header)

**Killed because:** Taste call with no user signal. The current gray header is functional; the "two competing visual systems" argument is designer aesthetic dressed as user pain. Resurrect only if a venue reports confusion.

### F1.C — Standings podium card layout

**Killed because:** 1 day of layout work to celebrate a champion whose name already shows at rank 1. The "celebration moment" is solving for a problem no organizer has flagged. If the rank-1 cell ever feels buried, add a trophy SVG + bold border in 10 minutes — don't rebuild the layout.

### F2.D — Spectator match-end gold flash

**Killed because:** Animation on a phone glance is solving for a moment no one is reporting as missing. Phone spectators look at the score, not the celebration. The win-method banner in Bundle 2 (F3.C) already differentiates outcomes.

### F3.A — HAJIME countdown overlay

**Killed because:** Overlaps the actual referee's job (the ref shouts HAJIME). Adding a 3-second client overlay introduces sync risk if backend match start drifts. Negative value at a real tournament if it desyncs.

### F5.A — Run /design-consultation, produce DESIGN.md

**Killed because:** Solves a problem (token drift across contributors) the 1-person team does not have. Design systems are leverage at 5+ designers. The recent `frontend/src/lib/bracket.ts` extraction proved incremental DRY-up works fine without a global DESIGN.md. Revisit when team size > 3 or when adding a second product surface (marketing site, federation portal).

### F6.A — Display portrait fallback layout

**Killed because:** Premature responsive work. The premise ("tournaments don't always have ideal hardware") is unsupported by any actual venue report. Ship the standard landscape Display to 10 venues, then add portrait if anyone complains.

### ENG-A1 — Persist osaekomi state to DB

**Killed because:** TODO self-admits "probably overkill for v1 single-laptop tournaments." If backend restarts mid-osaekomi (a 20-second window per match), worst case is the auto-timer doesn't fire and the referee manually awards waza-ari/ippon. Not catastrophic. Revisit only when running multi-instance deploy or a >3-mat tournament.

### ENG-A3 — Implement true DOUBLE_REPECHAGE bracket structure

**Killed because:** The pre-fix (stop tagging DOUBLE_REPECHAGE until ready) already solves the user-facing lie. 2-3 engineer-days for two distinct bronzes is overkill until a federation customer with a documented IJF event format requests it. Resurrect when a customer says "your repechage is wrong."

---

## MISSING FROM BACKLOG — Strategic roadmap gaps

Not addressed by `/autoplan` because they were never planned. Surfaced here as the actual next-step list. Pick one for the next `/autoplan` invocation.

1. **Payments / billing** — Stripe direct, idempotent webhooks, organizer paywall. `T1 #3` in the in-memory backlog but no design doc. **Highest priority.**
2. **Competitor accounts** — A competitor with a login who sees their rating across events. Cross-event retention engine.
3. **Coach / club manager accounts** — Judo's actual buyer in clubs. `T2 #9`. Already has `COACH` enum in Prisma schema (ARCH-PREP shipped) but no UX, no scoped access enforcement.
4. **Email / SMS notifications** — Weigh-in reminders, "you're on Mat 2 in 5 min," results to family. `T1 #6`. Tournament-day venue magic.
5. **Multi-tournament / season view** — Organizer running 6 events/year wants templates and reuse.
6. **Federation results export** (CSV / IJF format) — Organizers report to federations. Without this, matside is a toy.
7. **Observability** — Zero monitoring/error tracking. Will be blind on day 1 of a real tournament.

---

## Decision Audit Trail

Auto-decided during `/autoplan` 2026-05-11. Format: `# | Phase | Decision | Classification | Principle | Rationale | Rejected`.

| # | Phase | Decision | Class | Principle | Rationale | Rejected |
|---|-------|----------|-------|-----------|-----------|----------|
| 1 | 0 | Treat TODOS.md as plan file (user picked D over A/B/C) | User choice | n/a | Explicit intake answer | n/a |
| 2 | 1 | DX phase skipped — end-user UI, no developer-facing surface | Mechanical | P3 pragmatic | TODOS contain zero API/CLI/SDK content | run-DX-anyway |
| 3 | 1 | CEO mode: SCOPE REDUCTION (not SELECTIVE EXPANSION default) | Mechanical | P3 pragmatic | User picked "batch the design TODOs" → triage is the natural fit | default-mode |
| 4 | 1 | Premise challenge → USER CHALLENGE (gated, not auto) | Mandatory | autoplan rules | Both voices recommended pivot from polish to Payments | silent-auto |
| 5 | 1 | Premise gate: Hybrid (user picked B over A/C/D) | User choice | n/a | Ship 4 bundles + then pivot to Payments | n/a |
| 6 | 1 | Kill F1.A — gray Mat N header | Auto | P3 pragmatic | No user signal; subagent + primary concur | preserve-for-future |
| 7 | 1 | Kill F1.C — podium card layout | Auto | P5 explicit | 1 day for designer aesthetic; trophy SVG is the simpler answer | full-redesign |
| 8 | 1 | Kill F2.D — Spectator gold flash | Auto | P3 pragmatic | Phone spectators glance at score, not celebration | ship-anyway |
| 9 | 1 | Kill F3.A — HAJIME countdown | Auto | P5 explicit | Sync-risk vs the ref's actual job; ambiguous semantics | sync-via-backend |
| 10 | 1 | Kill F5.A — DESIGN.md refactor | Auto | P3 pragmatic | No team size to justify; bracket.ts proves incremental works | ship-anyway |
| 11 | 1 | Kill F6.A — Display portrait fallback | Auto | P3 pragmatic | No venue report; premature responsive | ship-anyway |
| 12 | 1 | Kill ENG-A1 — osaekomi DB persistence | Auto | P3 pragmatic | TODO self-admits "overkill for v1" | ship-anyway |
| 13 | 1 | Kill ENG-A3 — true DOUBLE_REPECHAGE | Auto | P3 pragmatic | Pre-fix already solved user-facing lie | ship-now |
| 14 | 1 | Defer F2.B — IndexedDB offline queue | Auto | P5 explicit | Server idempotency must ship first | ship-client-only |
| 15 | 1 | Defer F4.A full scope — admin token sweep | Auto | P3 pragmatic | Bundle 4 ships highest-impact slice; rest is incremental | full-sweep |
| 16 | 1 | Bundle 1 — Type hygiene (Q1+Q2+Q4+A2+A4) | Auto | P4 DRY | All small, all in scoreboard module, all reduce future-bug surface | ship-separately |
| 17 | 1 | Bundle 2 — Broadcast feel (F3.B+F1.B+F3.C) | Auto | P2 boil lakes | All touch DisplayPage; one coherent visual upgrade | ship-separately |
| 18 | 1 | Bundle 3 — F7.D2 Spectator standings as own PR | Auto | P5 explicit | New page surface deserves its own PR for clean review | bundle-with-F4.A |
| 19 | 1 | Bundle 4 — F4.A tab underline only | Auto | P3 pragmatic | 10-min slice; full F4.A scope deferred | full-F4.A |
| 20 | 2 | F3.B gated on `status === 'ACTIVE' && !goldenScore` | Auto | P5 explicit | Original spec silently misfires during SCHEDULED (timer=0:00) and GS (no fixed end) | run-pulse-always |
| 21 | 2 | F3.B pulse animation: opacity 100→60→100 over 1s ease-in-out | Auto | P5 explicit | Tailwind animate-pulse is too gentle for broadcast urgency; named keyframe | tailwind-default |
| 22 | 2 | F3.B reduced-motion: drop animation, keep color change | Auto | P1 completeness | Color is the urgency signal; animation is the polish | drop-all |
| 23 | 2 | F1.B trigger: SCHEDULED + both competitors known | Auto | P5 explicit | Avoid "STARTING SOON" with blank competitor rows | always-on-SCHEDULED |
| 24 | 2 | F1.B layout: full takeover of CenterBar only (not full screen) | Auto | P5 explicit | Competitor rows + category strip remain visible (useful pre-match context) | full-screen |
| 25 | 2 | F1.B subtext: category name + bout number | Auto | P1 completeness | "STARTING SOON" alone is less useful than the context | headline-only |
| 26 | 2 | F3.C trigger: only at COMPLETED, never mid-match | Auto | P5 explicit | Prevent double-firing on every WAZA_ARI score event | fire-on-score |
| 27 | 2 | F3.C IPPON: overlay carries drama, WinBanner is static label | Auto | P5 explicit | Resolves "current animation" ambiguity; one source of drama | double-animate |
| 28 | 2 | F3.C: lock 7-method table with explicit copy/colors/a11y labels | Auto | P1 completeness | Was: 5 methods + "appropriate variants"; now: all enum values covered | leave-implementer-guessing |
| 29 | 2 | F7.D2 tab bar: `<nav>` semantics, not `role="tablist"` | Auto | P5 explicit | Page-level navigation pattern, not in-page tabs (URL-stable but semantically nav) | tablist-semantics |
| 30 | 2 | F7.D2 mobile layout: card-per-competitor, not table | Auto | P5 explicit | RoundRobinTable overflows 375px; cards are mobile-native | reuse-RoundRobinTable |
| 31 | 2 | F7.D2 empty state: spectator-friendly copy | Auto | P1 completeness | Current "Generate categories first" is organizer-flavored — wrong audience | reuse-org-copy |
| 32 | 2 | F7.D2 top-3 by default, expand for rank 4+ | Auto | P3 pragmatic | Mobile real estate; family looks for top 3 first | show-all |
| 33 | 3 | ENG-A2: interactive `$transaction(async (tx) => ...)` not array form | Auto | P5 explicit | Array form can't pass data between dependent ops (CRITICAL fix) | array-form-as-spec'd |
| 34 | 3 | ENG-A2: thread `tx` through `advanceWinner` + helpers + `endMatch` + `maybeCreate...` | Auto | P1 completeness | Atomicity boundary covers the whole advancement chain, not just the leaf | wrap-leaf-only |
| 35 | 3 | ENG-A2: document Postgres READ-COMMITTED race; track as ENG-A5 in DEFER | Auto | P3 pragmatic | Concurrent score events not in scope; spec must be honest about it | claim-tx-fixes-everything |
| 36 | 3 | ENG-Q1: delete duplicate `MatchScores` from `standings.types.ts` | Auto | P4 DRY | Two shapes glued by `as unknown as` cast — reconcile or ship two canonical types | leave-as-is |
| 37 | 3 | ENG-Q1: `MatchScores.yuko` is REQUIRED (not optional) in canonical version | Auto | P5 explicit | Scoreboard always writes yuko: 0+; the optional version is a lie | preserve-optional |
| 38 | 3 | ENG-Q1: also widen frontend `winMethod` to literal union | Auto | P1 completeness | Bundle 2's variant switch needs type-safe enum; do it in Bundle 1 not duplicate later | duplicate-in-bundle-2 |
| 39 | 3 | ENG-Q1: add satisfies-style type-mirror test in `useScoreboard.test.ts` | Auto | P1 completeness | Duplicate-with-comment without a guard rots silently | trust-the-comment |
| 40 | 3 | ENG-Q4: add runtime validation on socket `end-match` payload (WsException) | Auto | P5 explicit | Unvalidated socket string → cleaner error than 500 from Prisma write | rely-on-prisma-throw |
| 41 | 3 | Bundle 1: add `scoreboard.service.spec.ts` test cases for the tx wrap | Auto | P1 completeness | Gateway spec mocks `applyScoreEvent`, won't catch a broken interactive tx | manual-smoke-only |
| 42 | 3 | F3.B: gate flash on `timerSeconds > 0` (not just `!goldenScore`) | Auto | P5 explicit | Timer clamps to 0 during GS — without guard the 0s flash fires once per GS transition | gate-on-GS-only |
| 43 | 3 | F1.B SCHEDULED+one-competitor: fall through to live layout, not "Waiting" | Auto | P5 explicit | "Waiting for match" path requires `!matchState`, not reachable when matchState exists | spec-was-incorrect |
| 44 | 3 | F3.C: DROP `SOREMADE` row (not in Prisma enum) | Auto | P5 explicit | Phase 2 spec error: 7 methods listed, Prisma has 6. SOREMADE would require migration | ship-with-migration |
| 45 | 3 | F7.D2: use `api.get` + `setInterval`, not TanStack Query | Auto | P5 explicit | SpectatorPage uses raw api.get; introducing TanStack Query just here is inconsistent | mix-data-patterns |
| 46 | 3 | F7.D2: export `rankBadge()` from `StandingsTab.tsx` for reuse | Auto | P4 DRY | Helper is local module-scope today | re-implement |
| 47 | 3 | PR order: 1 → 4 in parallel → 2 → 3 (was: 1 → 2 → 3 → 4) | Auto | P6 bias-to-action | Bundle 4 has zero deps, 10-min work; should ship in parallel with Bundle 1 | stick-with-original |
| 48 | 4 | Final approval: A (approve as-is) — all 46 auto-decisions stand | User choice | n/a | Per /autoplan D3 gate | overrides / revise / kill-tests |

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` (via /autoplan) | Scope & strategy | 1 | CLEAR | mode: SCOPE_REDUCTION, 4 proposals accepted, 2 deferred, 8 killed |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | unavailable | binary not installed |
| Eng Review | `/plan-eng-review` (via /autoplan) | Architecture & tests (required) | 1 | CLEAR | 12 issues, 3 critical gaps — all fixed inline |
| Design Review | `/plan-design-review` (via /autoplan) | UI/UX gaps | 1 | CLEAR | score: 4/10 → 9/10, 13 spec decisions locked |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | skipped | no developer-facing scope |

**VERDICT:** CEO + ENG + DESIGN CLEARED — ready to implement. PR order: 1 → 4 (parallel) → 2 → 3. Outside voice unavailable (codex not installed); single-voice Claude-subagent consensus across all 3 phases. Adversarial review: not run.

<!-- AUTONOMOUS DECISION LOG — appended during /autoplan -->
