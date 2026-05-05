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
