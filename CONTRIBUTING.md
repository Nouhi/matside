# Contributing to matside

Thanks for your interest. matside is in early development; contributions of any size are welcome.

## Before you start

Read the [top-level README](README.md) for the project overview and local setup. Read [docs/designs/judo-competition-manager.md](docs/designs/judo-competition-manager.md) for the product spec, data model, and IJF rule decisions. Skim [TODOS.md](TODOS.md) for known design and engineering debt — many of those are good first issues.

## Local setup

See the [README's "Local development" section](README.md#local-development). One-time: install Node 20+, Postgres 14+, then `npm install` in both `backend/` and `frontend/`, copy `backend/.env.example` to `backend/.env`, run `npx prisma migrate dev`, then `npm run start:dev` (backend) and `npm run dev` (frontend) in two tabs.

## Branching

- **`main`** is the trunk. PRs target main.
- Feature branches: `feat/<short-description>` (e.g. `feat/spectator-standings-tab`).
- Fix branches: `fix/<short-description>`.
- Don't push directly to main.

## Commit messages — conventional commits

Conventional-commits style, lowercase, no emoji.

| Prefix | Use for |
|---|---|
| `feat:` | New feature visible to a user |
| `fix:` | Bug fix |
| `chore:` | Tooling, config, deps, no user-visible change |
| `refactor:` | Code reshape, no behaviour change |
| `docs:` | Documentation only |
| `test:` | Tests only |
| `perf:` | Performance change |

Example:

```
feat: yuko + direct ippon + osaekomi auto-scoring

Adds three scoring upgrades to the live judo scoreboard.
[…paragraph or two of context…]
```

Keep the subject under ~70 chars. Use the body for the why, not the what (the diff already shows the what).

## Tests

Both `backend/` and `frontend/` ship test suites. Run them locally before pushing:

```bash
# backend
cd backend && npm test

# frontend
cd frontend && npx vitest run
```

Coverage expectations:
- Pure utilities (`backend/src/standings/`, `backend/src/brackets/*.util.ts`, `backend/src/categories/age-group.util.ts`) — 100% covered. Don't regress these.
- Service / gateway code — Jest mocks against PrismaService. Use fake timers for setTimeout-driven flows (see `backend/src/scoreboard/scoreboard.gateway.spec.ts`).
- Frontend — React Testing Library. Coverage is light; aim higher when touching critical flows (auth, scoring, standings).

## Pull request workflow

1. Branch off main.
2. Make your changes. Run tests + type-check (`npx tsc --noEmit` in `backend/`).
3. Commit in atomic chunks following the conventional-commits format above.
4. Push and open a PR against main. The PR description should include a summary, the test plan you used, and links to any related TODOs.
5. CI / reviewer feedback: address before merge. Use `git commit --fixup` + `git rebase -i` if you want to keep the history clean.

### Recommended pre-PR sanity check

This repo uses [gstack](https://github.com/garryslist/gstack) for plan-stage review skills. If you have it installed, run any of these from inside Claude Code before opening a PR:

- `/plan-eng-review` — architecture, code quality, tests, performance
- `/plan-design-review` — UI/UX gaps if your change is user-facing
- `/qa` — runs the QA testing flow against your local site

These aren't required, but they catch a lot before review.

## What's a good first contribution?

Look at [TODOS.md](TODOS.md). Items tagged `ENG-*` (engineering) and `F1.*` / `F2.*` etc. (design fixes) are scoped, with files + estimated effort. Pick one that interests you, comment on the issue (or open one) before starting if it's non-trivial.

Quick wins right now:
- Fix the `MatchScores` type duplication across backend + frontend (see `ENG-Q1` in TODOS.md)
- Drop `as unknown as` casts in `DisplayPage.tsx` (see `ENG-Q2`)
- Add ASCII diagrams for bracket advancement (see `ENG-A4`)

## Code style

- TypeScript strict mode. No `any` except where genuinely unavoidable (and add a comment).
- Prefer explicit over clever. `// removed: foo` comments don't survive — just delete the code.
- Don't add dependencies casually; the runtime stack is intentionally small (NestJS, Prisma, React, TanStack Query, Tailwind).

## Questions?

Open an issue or comment on a PR. matside is small enough that response time is good.
