# matside backend

NestJS 11 + Prisma 7 + PostgreSQL. JWT-authenticated REST API + Socket.IO scoreboard gateway.

For the full repo overview and setup, see the [top-level README](../README.md). For the product spec, see [docs/designs/judo-competition-manager.md](../docs/designs/judo-competition-manager.md).

## Quick start

```bash
npm install
cp .env.example .env
# edit DATABASE_URL if needed
npx prisma migrate dev
npm run start:dev   # http://localhost:3000
```

## Module layout

| Module | Responsibility |
|---|---|
| `auth/` | Email/password + JWT for organisers. PIN auth for table officials lives in `scoreboard/mat.service.ts`. |
| `competitions/` | Competition CRUD, status flow (DRAFT → REGISTRATION → WEIGH_IN → ACTIVE → COMPLETED). |
| `competitors/` | Self-registration, weight updates, withdraw. |
| `categories/` | IJF weight-class generation per age/gender, category-to-mat balancing. |
| `brackets/` | Bracket generation (round-robin for ≤4 competitors, single-repechage for 5+). Emits the full elimination tree with bye-prefilling. |
| `scoreboard/` | Match scoring (`scoreboard.service.ts`), Socket.IO gateway (`scoreboard.gateway.ts`), osaekomi auto-scoring with setTimeout, bracket advancement on match completion. Mat PIN auth. |
| `standings/` | Round-robin standings with full IJF tiebreakers, elimination podium derivation. Pure utilities — heavily tested in isolation. |
| `prisma/` | PrismaService wrapper. Schema + migrations live in `prisma/`. |

## Schema

`prisma/schema.prisma` is the source of truth. Run `npx prisma studio` to browse data locally. Run `npx prisma migrate dev --name <description>` after every schema change.

## Tests

```bash
npm test                         # all Jest unit tests
npm test -- --testPathPatterns=standings    # filter by path
npm run test:cov                 # with coverage
```

Pure utilities (`brackets/*.util.ts`, `standings/*.util.ts`, `categories/age-group.util.ts`) are 100% covered. Service tests use in-memory PrismaService mocks (see `competitions.service.spec.ts` for the pattern). Gateway tests use Jest fake timers — see `scoreboard.gateway.spec.ts` for the osaekomi-resolution test.

## API

There is no published API contract yet. Routes are defined per controller — `npm run start:dev` logs every mapped route on boot. Most endpoints are JWT-protected (`@UseGuards(JwtAuthGuard)`). Public exceptions: competitor self-registration, brackets read, scoreboard websocket viewer mode (controller mode requires a per-mat PIN).

## Common tasks

**Reset the local database**
```bash
npx prisma migrate reset    # drops + re-applies all migrations
```

**Add a new module**
```bash
nest g module <name>
nest g service <name>
nest g controller <name>
```

**Generate the Prisma client manually** (rarely needed — `migrate dev` does it automatically)
```bash
npx prisma generate
```
