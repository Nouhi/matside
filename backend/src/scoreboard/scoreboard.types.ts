/**
 * Canonical scoreboard score types.
 *
 * Owned by the scoreboard module because scoreboard writes the JSON shape
 * to `Match.scores`. Standings reads the same shape (read-only consumer)
 * and re-exports the type alias from this file. Frontend keeps its own
 * mirror in `frontend/src/hooks/useScoreboard.ts` with a "must match
 * backend" comment (the frontend cannot import directly across the
 * package boundary in this monorepo).
 *
 * `yuko` is REQUIRED, not optional. The scoreboard service always writes
 * the full `{ wazaAri, yuko, shido }` triple (see `normalizeScores` in
 * scoreboard.service.ts). The older optional shape in standings.types.ts
 * survived only because of an `as unknown as` cast and is now deleted.
 */
export interface CompetitorScore {
  wazaAri: number;
  yuko: number;
  shido: number;
}

export interface MatchScores {
  competitor1: CompetitorScore;
  competitor2: CompetitorScore;
}
