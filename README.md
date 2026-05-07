# matside

Judo competition management web app. Runs a tournament end-to-end: registration, weigh-in, IJF weight class categorisation, bracket generation (round-robin / single repechage), live scoreboard with real-time sync, and medal standings.

The product is **matside** (lowercase). Repo: `Nouhi/matside`.

## What it does

- **Pre-event** — organisers create a competition, share a public registration link, weigh in competitors, generate categories and brackets, configure mats.
- **Day-of** — auto-balanced category-to-mat assignment, table-official tablet for scoring (PIN-protected), TV/projector display per mat, phone-friendly spectator view.
- **Scoring** — IJF rules: waza-ari, yuko, shido (3rd shido = hansoku-make red card), osaekomi auto-scoring (10s = waza-ari, 20s = ippon), direct ippon button, golden score, big yellow IPPON animation on match-end.
- **Post-event** — round-robin standings with full IJF tiebreakers (direct H2H → ippons → waza-ari → fewest shidos), elimination podium (gold / silver / joint bronze).

For the full feature list, data model, and IJF rule decisions, see [docs/designs/judo-competition-manager.md](docs/designs/judo-competition-manager.md).

## Architecture

```
┌──────────────────────┐       ┌──────────────────────┐
│  frontend (Vite)     │       │  backend (NestJS)    │
│  React 19            │ HTTP  │  REST + WebSocket    │
│  TanStack Query      │◄─────►│  Prisma + PostgreSQL │
│  Tailwind, shadcn/ui │  WS   │  JWT + PIN auth      │
└──────────────────────┘       └──────────┬───────────┘
                                          │
                                          ▼
                               ┌──────────────────────┐
                               │  PostgreSQL          │
                               └──────────────────────┘
```

- `backend/` — NestJS 11, Prisma 7, PostgreSQL, Socket.IO for the live scoreboard.
- `frontend/` — Vite + React 19, TanStack Query, Tailwind v4, shadcn/ui. The `@/*` import alias resolves to `frontend/src/*`.

## Local development

**Prerequisites**

- Node.js 20+ (24 recommended; backend uses ts-node, frontend uses Vite 8)
- PostgreSQL 14+ running locally (or accessible at the URL in `backend/.env`)
- npm 9+

**One-time setup**

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env
# edit .env if your Postgres needs different credentials
npx prisma migrate dev   # creates the schema
cd ..

# 2. Frontend
cd frontend
npm install
cd ..
```

**Run the app**

Two terminal tabs:

```bash
# tab 1 — backend on :3000
cd backend && npm run start:dev
```

```bash
# tab 2 — frontend on :5173
cd frontend && npm run dev
```

Open http://localhost:5173 and register an organizer account to get started. The Vite dev server proxies `/auth`, `/competitions`, `/categories`, `/competitors`, `/mats`, and `/scoreboard` (Socket.IO) to the backend on :3000.

## Useful URLs once running

| URL | Who | What |
|---|---|---|
| http://localhost:5173 | Organiser | Dashboard, competitions, registration, weigh-in, brackets, mats, standings |
| http://localhost:5173/competitions/`:id`/register | Public | Self-registration form for competitors |
| http://localhost:5173/c/`:competitionId` | Spectator (phone) | Live mat cards |
| http://localhost:5173/mat/`:matId`/display | TV / projector | Big scoreboard |
| http://localhost:5173/mat/`:matId`/control | Table official | PIN-protected scoring tablet |

## Scripts

**Backend** (in `backend/`)

| Command | Purpose |
|---|---|
| `npm run start:dev` | Dev server with watch (port 3000) |
| `npm run build` | TS → dist/ |
| `npm run start:prod` | Run the built server |
| `npm test` | Run all Jest unit tests |
| `npm run lint` | ESLint with autofix |
| `npx prisma migrate dev` | Apply migrations to local DB |
| `npx prisma studio` | Open the Prisma data browser |

**Frontend** (in `frontend/`)

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (port 5173) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npx vitest run` | Run all Vitest tests |
| `npm run lint` | ESLint |

## Project layout

```
matside/
├── backend/                # NestJS API + WebSocket
│   ├── prisma/             # schema + migrations
│   └── src/
│       ├── auth/           # JWT auth (organisers)
│       ├── competitions/   # competition CRUD + status flow
│       ├── competitors/    # registration, weigh-in
│       ├── categories/     # IJF weight class generation, mat assignment
│       ├── brackets/       # bracket generation (round-robin, single repechage)
│       ├── scoreboard/     # match scoring, osaekomi, WebSocket gateway
│       └── standings/      # medal standings, IJF tiebreakers
├── frontend/               # Vite + React 19
│   └── src/
│       ├── pages/
│       │   ├── dashboard/  # organiser views
│       │   └── scoreboard/ # Display, Control, Spectator
│       ├── components/     # shared UI (BracketView, StandingsTab, etc.)
│       ├── hooks/          # useAuth, useScoreboard
│       └── lib/            # api client, toast
├── docs/designs/judo-competition-manager.md  # Product/design source of truth
├── CLAUDE.md               # AI agent instructions for this repo
├── CONTRIBUTING.md         # How to contribute
├── TODOS.md                # Tracked design + eng debt
└── README.md               # this file
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, commit conventions, and review gates before opening a PR.

## License

Private / unlicensed during early development. Reach out if you want to use or distribute it.
