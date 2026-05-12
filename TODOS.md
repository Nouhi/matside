<!-- /autoplan restore point: /Users/omar/.gstack/projects/Nouhi-matside/claude-focused-napier-b01ea5-autoplan-restore-20260511-063024.md -->
# matside TODOs

Triaged via `/autoplan` on 2026-05-11 from a starting backlog of 21 items (14 design + 7 eng) deferred from `/plan-design-review` 2026-05-07. Outcome: 4 bundles shipped, 3 items deferred, 8 killed, 7 strategic roadmap gaps surfaced.

**Status (2026-05-12):** all 4 ship bundles merged via PRs #16–#20. Detailed bundle specs live in git history (see audit trail at the bottom + the autoplan restore point referenced in the HTML comment above). The live content of this file is the DEFER / KILLED / MISSING sections below.

Approved mockup reference: `~/.gstack/projects/Nouhi-matside/designs/scoreboard-display-20260506/variant-A.html` (Variant A — Classic IJF Broadcast).

## SHIPPED via /autoplan (2026-05-11 → 2026-05-12)

| PR | Bundle | What landed |
|----|--------|-------------|
| #16 | Bundle 4 — admin tab underline | `border-gray-900` → IJF blue `#0a3a7a` on the active dashboard tab. |
| #17 | Bundle 1 — type hygiene + concurrency | ENG-Q1 / Q2 / Q4 / A2 / A4: single source of truth for `MatchScores`, drop `as unknown as` casts on `MatchState`, drop `any` from `WinMethod`, wrap advancement in interactive `prisma.$transaction(async (tx) => ...)` with `tx` threaded through every advancement helper, ASCII diagrams for slot routing + IJF tiebreaker chain + advancement state machine. |
| #18 | Bundle 1 — real-DB smoke | 5-scenario e2e spec against real Postgres + 3 gateway-boundary cases for the WinMethod `WsException`. Backend tests 228 → 231. |
| #19 | Bundle 2 — broadcast feel | F3.B timer pulse (amber 0:30, red+pulse 0:10, red+flash 0:00, gated on `!goldenScore && timer > 0`), F1.B "STARTING SOON" overlay on SCHEDULED matches with both competitors known, F3.C six explicit win-method banner variants (DECISION as a vertical blue/white split with winner's name on their side). |
| #20 | Bundle 3 — spectator standings | New `SpectatorStandings` mobile-card layout, bottom-fixed nav in `SpectatorPage` (Live Mats / Standings toggle), spectator-friendly empty states, rank icons exported from `StandingsTab`. Caught + fixed auth bug: switched the standings fetch to `/public/competitions/:id/standings`. |

## DEFER — Re-evaluate only when a real customer reports it

### F2.B — Control offline queue (IndexedDB)

**What:** Queue score events in IndexedDB when socket drops, replay on reconnect.
**Why defer:** Tier 1 disable-buttons already shipped. The 1% case where reconnect is slow does not justify 2-3 engineer-days. **Server idempotency (sequence numbers) must ship before client queue, or you get double-counted scores.** TODO has the dependency right — answer is "don't start until a customer complains."
**Re-evaluate when:** A tournament reports lost score events under bad Wi-Fi.

### F4.A full scope — Pull IJF tokens into admin UI (beyond tab underline)

**What:** Status pills + standings podium binary in IJF blue/white.
**Why defer:** The premise (admin/scoreboard cohesion) is real but small. Bundle 4 ships the highest-impact slice. The rest is incremental.
**Re-evaluate when:** A user complains the dashboard looks generic. Bundle with a future visual pass.

### ENG-A5 — Concurrent `applyScoreEvent` race (osaekomi setTimeout vs manual end-match)

**What:** Bundle 1's `prisma.$transaction(async (tx) => ...)` wrap prevents PARTIAL writes inside one `applyScoreEvent` call. It does NOT serialize two concurrent score events on the same match — e.g. the osaekomi 20s `setTimeout` in `scoreboard.gateway.ts:140` firing while a controller manually ends the match. Postgres default isolation (READ COMMITTED) doesn't prevent that race. Two parallel score events can both see `status: ACTIVE`, both attempt the COMPLETED update, and last writer wins.
**Why defer:** Bundle 1 closed the partial-write window (the more common bug class). The concurrent-events race is rarer (requires ~ms-scale collision between auto-timer and human input) and has a fixed cost ceiling (one match state wrong by a tick, recoverable by re-scoring). Mitigation options (optimistic locking via a `version` column, `SELECT ... FOR UPDATE`, or app-level mutex per matchId) all add complexity.
**Re-evaluate when:** A tournament reports a match ended with the wrong winner or wrong winMethod, and the audit trail shows two near-simultaneous applyScoreEvent calls.
**Files (when picked up):** [scoreboard.service.ts](backend/src/scoreboard/scoreboard.service.ts), [scoreboard.gateway.ts](backend/src/scoreboard/scoreboard.gateway.ts).

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
