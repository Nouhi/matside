# matside TODOs

Design review backlog from `/plan-design-review` on 2026-05-07. Tier 1 critical-path fixes (disconnect overlays, score pulse, reduced-motion, ARIA) shipped on `claude/vibrant-chandrasekhar-8b77b5`. The 13 below are deferred.

Approved mockup reference: `~/.gstack/projects/Nouhi-matside/designs/scoreboard-display-20260506/variant-A.html` (Variant A — Classic IJF Broadcast).

---

## Information Architecture

### F1.A — Spectator visual coherence

**What:** Drop the gray "Mat N" admin-style header on the Spectator phone view. Mat number lives inside the IJF blue band as a small label next to the player name.

**Why:** Two competing visual systems on one card (gray admin header + IJF blue/white band) makes the Spectator feel like a draft. One system reads as one product.

**Pros:** Visually consistent with Display. Spectator card reads as a single object.
**Cons:** Mat number becomes less prominent as a glance-target.
**Files:** [SpectatorPage.tsx](frontend/src/pages/scoreboard/SpectatorPage.tsx) — `MatCard`, `CompetitorBand`.
**Effort:** ~30 min human / ~3 min CC.

### F1.B — "STARTING SOON" overlay on SCHEDULED matches

**What:** When a match is assigned to a mat but `status === 'SCHEDULED'`, overlay a subtle dark gradient + "STARTING SOON" text in muted gold across the Display.

**Why:** A SCHEDULED match looks identical to an ACTIVE match (timer at 4:00, scores 0/0/0). Spectators don't know if they're early or if the match is paused.

**Pros:** Pre-match clarity. Removes ambiguity for the venue.
**Cons:** Adds a state-conditional render to Display.
**Files:** [DisplayPage.tsx](frontend/src/pages/scoreboard/DisplayPage.tsx).
**Effort:** ~45 min human / ~5 min CC.

### F1.C — Standings podium card layout

**What:** For COMPLETE categories in the Standings tab, render gold/silver/bronze as 3 distinct cards (gold tallest, silver/bronze flanking) above the round-robin table. Table becomes audit/detail view.

**Why:** Champion deserves a single visible moment per category. Currently rank 1 looks the same as rank 4 except for a small medal icon.

**Pros:** Scannable champion declaration. Better celebration moment for the venue / family / coach.
**Cons:** More complex layout. Round-robin and elimination need different podium presentations.
**Files:** [StandingsTab.tsx](frontend/src/components/StandingsTab.tsx).
**Effort:** ~1 day human / ~10 min CC.

---

## Interaction State Coverage

### F2.B — Control offline queue (IndexedDB)

**What:** When the Control view socket drops, queue any score events the table official taps in IndexedDB. On reconnect, replay the queue in sequence so no scoring data is lost.

**Why:** The design doc commits to offline resilience: *"The control view queues score events in IndexedDB when disconnected. On reconnect, it replays the event queue in order."* Currently we just disable the buttons (Tier 1 fix), but a slow reconnect leaves the table official waiting and the match flow paused.

**Pros:** Matches the design-doc commitment. No data loss under bad Wi-Fi.
**Cons:** Server needs idempotent event handling (event sequence numbers per match) to apply replays without double-counting.
**Files:** [useScoreboard.ts](frontend/src/hooks/useScoreboard.ts), backend [scoreboard.gateway.ts](backend/src/scoreboard/scoreboard.gateway.ts), [scoreboard.service.ts](backend/src/scoreboard/scoreboard.service.ts), Match schema (sequenceNum already exists, repurpose or add idempotency key).
**Effort:** ~2 days human / ~25 min CC.
**Depends on:** Tier 1 F2.A (disable-buttons) shipped.

### F2.D — Spectator match-end gold flash

**What:** When `match.status` flips to COMPLETED on Spectator: winner's name band flashes green for 2s, then a gold WIN METHOD ribbon appears between bands. Match the Display energy at phone scale.

**Why:** Currently the match completion shows as a tiny amber text band at the bottom of the card. On a phone glanced at across a venue, easy to miss who won.

**Pros:** Phone spectators get the same celebration moment as Display.
**Cons:** Animation work. Need to handle multiple cards completing in close succession.
**Files:** [SpectatorPage.tsx](frontend/src/pages/scoreboard/SpectatorPage.tsx).
**Effort:** ~30 min human / ~5 min CC.

---

## User Journey & Emotional Arc

### F3.A — HAJIME countdown overlay

**What:** When match status flips SCHEDULED → ACTIVE: brief 3-2-1 HAJIME countdown overlay on Display (3 seconds total) before the timer starts counting.

**Why:** In real judo the ref shouts HAJIME — it's the start moment. Currently the timer just starts silently. The product loses its start ceremony.

**Pros:** Real start moment. Improves the venue experience.
**Cons:** Either backend delays match start by 3s (sync model) or Display animates over the running timer (cosmetic only). Need to decide which is correct semantics.
**Files:** [DisplayPage.tsx](frontend/src/pages/scoreboard/DisplayPage.tsx), possibly [scoreboard.service.ts](backend/src/scoreboard/scoreboard.service.ts).
**Effort:** ~1 day human / ~15 min CC.

### F3.B — Final 30s timer pulse

**What:** Timer color/pulse shift in final 30 seconds (amber at 0:30, red+pulse at 0:10, red flash at 0:00).

**Why:** Real broadcasts pulse the timer to build pressure. Currently nothing changes until 0:00, so the audience feels no tension.

**Pros:** Cheap drama. Matches federation broadcast convention.
**Cons:** None significant.
**Files:** [DisplayPage.tsx](frontend/src/pages/scoreboard/DisplayPage.tsx) — `CenterBar`.
**Effort:** ~1 hour human / ~5 min CC.

### F3.C — Win-method-specific banner styling

**What:** Differentiate win-method banners. IPPON: gold + animation (current). WAZA_ARI: lighter gold, smaller animation. DECISION: blue/white split banner showing method. HANSOKU_MAKE: red banner ("disqualification"). FUSEN_GACHI / KIKEN_GACHI: appropriate variants.

**Why:** Currently all non-IPPON wins use the same gold banner minus the big animation, making them feel anticlimactic. Hansoku-make especially is a disqualification — it should feel stern, not gold.

**Pros:** Each method carries its own emotional weight. Audience reads the method correctly.
**Cons:** More variants to design and test.
**Files:** [DisplayPage.tsx](frontend/src/pages/scoreboard/DisplayPage.tsx) — `WinBanner`, [index.css](frontend/src/index.css).
**Effort:** ~3 hours human / ~10 min CC.

---

## Design System Alignment

### F4.A — Pull IJF tokens into admin UI

**What:** Active tab underline becomes IJF blue (#0a3a7a). Standings tab podium cards use IJF blue/white binary. Status pills (REGISTRATION/WEIGH_IN/ACTIVE) keep their semantic colors.

**Why:** Scoreboard surfaces feel intentional (IJF federation-grade). Admin surfaces (Standings, tab nav, dashboard) feel generic Tailwind. Pulling tokens makes the whole product cohere.

**Pros:** Visual coherence across the product. No two-system feel.
**Cons:** Some admin contexts may want neutral colors (status pills, error states).
**Files:** [CompetitionDetailPage.tsx](frontend/src/pages/dashboard/CompetitionDetailPage.tsx), [StandingsTab.tsx](frontend/src/components/StandingsTab.tsx).
**Effort:** ~2 hours human / ~10 min CC.
**Depends on:** F5.A (DESIGN.md) ideally first.

### F5.A — Run /design-consultation, produce DESIGN.md

**What:** Run the gstack `/design-consultation` skill. Generate a real DESIGN.md with all tokens (colors, type, spacing, motion) extracted from current scoreboard code. Refactor inline values to CSS variables.

**Why:** No DESIGN.md exists. Every IJF blue, gold, tracking value, and panel size is hand-coded inline across DisplayPage / ControlPage / SpectatorPage. Future contributors will pick wrong values.

**Pros:** Compounding benefit. Every future visual change references real tokens.
**Cons:** Adds a refactor pass to existing code. Touches every scoreboard file.
**Files:** Creates `DESIGN.md`. Touches all scoreboard surfaces + `index.css`.
**Effort:** ~3 hours human / ~30 min CC.
**Blocks:** F4.A is ideally done after this.

---

## Responsive & Accessibility

### F6.A — Display portrait fallback layout

**What:** When viewport is portrait or <800px wide: stack player rows above/below a smaller centered timer. Keep IJF blue/white. Keep score panels.

**Why:** Display is currently landscape-only. Tournaments don't always have ideal hardware (vertical projector, iPad in portrait, kiosk).

**Pros:** Works on any hardware the venue has.
**Cons:** Two layouts to maintain. Score panel typography needs to scale down.
**Files:** [DisplayPage.tsx](frontend/src/pages/scoreboard/DisplayPage.tsx).
**Effort:** ~3 hours human / ~15 min CC.

### F6.B — Control keyboard shortcuts

**What:** Add keyboard shortcuts on the Control view: 1=Ippon left, 2=Waza left, 3=Yuko left, 4=Shido left. 7-0 same for right. Space=start/end osaekomi. Enter=start match. Esc=open end-match modal. Show shortcut hints on each button.

**Why:** Refs scoring under pressure want fast keys. Laptop-based table officials currently mouse-click everything.

**Pros:** Faster scoring under pressure. Pro-broadcast feel.
**Cons:** Need to handle focus / ignore when modal open / honor disabled state.
**Files:** [ControlPage.tsx](frontend/src/pages/scoreboard/ControlPage.tsx).
**Effort:** ~3 hours human / ~15 min CC.

---

## Decisions Deferred

### F7.D1 — "Next match preparing" state on Display

**What:** After 30s of showing the COMPLETED match's final state, Display transitions to a "Next match preparing — `<categoryName>`" placeholder until a new match is assigned.

**Why:** Between matches on the same mat, Display shows the LAST match's final state for ~5 minutes. Spectators see frozen results and assume the tournament has stalled.

**Pros:** Clear flow signal. Continuity for the venue.
**Cons:** Need to decide: does this happen automatically after timeout, or only when next match is assigned via the mat queue?
**Files:** [DisplayPage.tsx](frontend/src/pages/scoreboard/DisplayPage.tsx).
**Effort:** ~1 hour human / ~10 min CC.

### F7.D2 — Spectator standings tab

**What:** Add a bottom tab bar on Spectator: "Live Mats" (current view) | "Standings". Standings tab shows the same data as the organizer Standings tab in mobile layout.

**Why:** Family of competitors want to find their fighter. Currently no path on phone to see who advanced or where their fighter ranks.

**Pros:** Closes the spectator information gap.
**Cons:** New page surface. If many spectators poll /standings concurrently, see ENG-P1 below — needs caching.
**Files:** [SpectatorPage.tsx](frontend/src/pages/scoreboard/SpectatorPage.tsx), reuse [StandingsTab.tsx](frontend/src/components/StandingsTab.tsx) data.
**Effort:** ~3 hours human / ~20 min CC.

---

## Engineering review backlog (added 2026-05-07)

### ENG-A1 — Persist osaekomi state to DB (multi-instance / restart resilience)

**What:** Move osaekomi tracking from in-memory `Map<string, OsaekomiTracker>` in scoreboard.gateway.ts:29 to a DB-backed state. Add an `OsaekomiState` table (matchId, competitorId, startedAt). On boot, query active states + reschedule `setTimeout` for the auto-IPPON path.

**Why:** Backend restart during a tournament kills active osaekomi timers. Multi-instance deployment can't share state. Design doc commits to offline resilience.

**Pros:** Real production-grade resilience. Survives restarts. Scales to multi-instance.
**Cons:** New table + migration. setTimeout-on-boot complexity. Probably overkill for v1 single-laptop tournaments.
**Files:** [scoreboard.gateway.ts](backend/src/scoreboard/scoreboard.gateway.ts), Prisma schema.
**Effort:** ~1 day human / ~30 min CC.

### ENG-A3 — Implement true DOUBLE_REPECHAGE bracket structure

**What:** For 8+ competitor categories, generate proper repechage paths: 2 repechage paths (top-half QF losers + bottom-half QF losers), bronze fights between repechage winners and SF losers.

**Why:** v1 currently tags categories DOUBLE_REPECHAGE but generates the same matches as SINGLE_REPECHAGE (joint-bronze for SF losers). The bracketType field doesn't reflect actual behavior. Real IJF events with 8+ competitors run proper repechage producing 2 distinct bronzes.

**Pros:** Matches IJF specification. Two distinct bronze medalists.
**Cons:** Bracket generation gets significantly more complex (additional `bracketSection` enum, slot routing for losers, bronze match wiring).
**Files:** [single-repechage.util.ts](backend/src/brackets/single-repechage.util.ts), [scoreboard.service.ts](backend/src/scoreboard/scoreboard.service.ts) (advanceWinner needs to know about loser advancement), Prisma schema (likely add `bracketSection` enum), [BracketView.tsx](frontend/src/components/BracketView.tsx) (already shows the visual).
**Effort:** ~2-3 days human / ~45 min CC.
**Depends on:** Stop tagging DOUBLE_REPECHAGE until ready (already applied as ENG-A3-pre).

### ENG-Q1 — Single source of truth for `MatchScores`

**What:** Move `MatchScores` + `CompetitorScore` types to a shared location. Backend: `backend/src/scoreboard/scoreboard.types.ts`. Frontend: keep its own copy with comment "must match backend" or generate via `zod`.

**Why:** Currently 3 separate definitions in scoreboard.service.ts:26, standings/standings.types.ts:1, useScoreboard.ts:9. Adding `yuko` required updating all 3.

**Pros:** DRY. No drift.
**Cons:** Frontend can't directly import backend types in this monorepo setup. Either zod-derived or duplicated-with-comment.
**Files:** new `backend/src/scoreboard/scoreboard.types.ts`, refactor 3 callers.
**Effort:** ~30 min human / ~5 min CC.

### ENG-Q2 — Type the `MatchState` properly (drop `as unknown as` casts)

**What:** Extend the frontend `MatchState` type in `useScoreboard.ts` to include the optional `club` field on competitors and the optional `category: { name }` field. Drop the 3 `as unknown as` casts in DisplayPage.tsx:285-287.

**Why:** The backend payload already includes these fields via the `getMatState` Prisma include. The casts hide a type drift between server and client.

**Pros:** Type-safe access. No casts.
**Cons:** None.
**Files:** [useScoreboard.ts](frontend/src/hooks/useScoreboard.ts), [DisplayPage.tsx](frontend/src/pages/scoreboard/DisplayPage.tsx).
**Effort:** ~10 min human / ~3 min CC.

### ENG-Q4 — Remove `match: any` and `winMethod as any`

**What:** Import `WinMethod` enum from `@prisma/client` and use it for typing. Type `ApplyResult.match` as `Prisma.MatchGetPayload<{...}>` with the relevant includes.

**Why:** scoreboard.service.ts:42 `match: any` and lines 94, 137 `winMethod as any` defeat type safety.

**Pros:** Type-safe API surface.
**Cons:** None.
**Files:** [scoreboard.service.ts](backend/src/scoreboard/scoreboard.service.ts).
**Effort:** ~15 min human / ~3 min CC.

### ENG-A2 — Wrap `advanceWinner` in `prisma.$transaction`

**What:** Wrap the findFirst + update pair in scoreboard.service.ts:198 in `prisma.$transaction`.

**Why:** Read-then-update without a transaction is a smell. Two concurrent R1 finishes feeding the same R2 don't logically conflict (different columns) but the pattern is brittle.

**Pros:** Cleaner concurrency story. Future-proof.
**Cons:** None significant.
**Files:** [scoreboard.service.ts](backend/src/scoreboard/scoreboard.service.ts).
**Effort:** ~15 min human / ~3 min CC.

### ENG-A4 — Add ASCII diagrams for bracket advancement + tiebreaker chain

**What:** Add ASCII diagrams in 3 spots: (1) `single-repechage.util.ts:getNextSlot` showing slot mapping `(R, P) → (R+1, ⌈P/2⌉)` with isCompetitor1 rule; (2) `scoreboard.service.ts:advanceWinner` showing the state machine; (3) `standings/round-robin.util.ts:rankRoundRobin` showing the IJF tiebreaker chain.

**Why:** Future contributors will re-derive the slot mapping. Per user preference: "I value ASCII art diagrams highly."

**Pros:** Code reads like a spec. Diagrams travel with the code.
**Cons:** Diagrams can go stale. User has stated diagram-maintenance is part of any change.
**Files:** [single-repechage.util.ts](backend/src/brackets/single-repechage.util.ts), [scoreboard.service.ts](backend/src/scoreboard/scoreboard.service.ts), [round-robin.util.ts](backend/src/standings/round-robin.util.ts).
**Effort:** ~30 min human / ~10 min CC.

**What:** Add a bottom tab bar on Spectator: "Live Mats" (current view) | "Standings". Standings tab shows the same data as the organizer Standings tab in mobile layout.

**Why:** Family of competitors want to find their fighter. Currently no path on phone to see who advanced or where their fighter ranks. They keep refreshing live mats hoping for results.

**Pros:** Closes the spectator information gap. Matches the design-doc spec for spectator view.
**Cons:** New page surface to build and maintain. Standings table needs mobile-first design.
**Files:** [SpectatorPage.tsx](frontend/src/pages/scoreboard/SpectatorPage.tsx), reuse [StandingsTab.tsx](frontend/src/components/StandingsTab.tsx) data.
**Effort:** ~3 hours human / ~20 min CC.
