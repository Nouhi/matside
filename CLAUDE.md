## Project briefing

**matside** is a judo competition management web app. Runs a tournament end-to-end: competitor registration, IJF weight class categorization, pool/bracket generation (round-robin, repechage), weigh-in management, live scoreboard with real-time sync, and results.

- **Backend:** `backend/` — NestJS 11 + Prisma + PostgreSQL. JWT auth. Socket.IO for real-time scoreboard.
- **Frontend:** `frontend/` — Vite + React 19 + TanStack Query + Tailwind + shadcn/ui. `@/*` alias → `./src/*`.
- **Design doc:** `docs/designs/judo-competition-manager.md` is the source of truth for features, data model, and IJF rules.

## Local dev

1. `cd backend && npm install && cp .env.example .env` (edit DATABASE_URL if needed)
2. `npx prisma migrate dev` to set up the database
3. `npm run start:dev` for backend on :3000
4. `cd frontend && npm install && npm run dev` for frontend on :5173
5. Frontend proxies `/api/*` to backend :3000

## Naming

The product is **matside** (lowercase). The repo is `Nouhi/matside`.

## Gotchas

- `backend/.env` is gitignored, never commit it.
- Commit messages follow conventional-commits (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke context-save / context-restore
- Code quality, health check → invoke health
