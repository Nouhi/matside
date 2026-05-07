# matside frontend

Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui. TanStack Query for server state. React Router for navigation. Socket.IO client for the live scoreboard.

For the full repo overview and setup, see the [top-level README](../README.md).

## Quick start

```bash
npm install
npm run dev   # http://localhost:5173
```

The dev server proxies API and WebSocket traffic to `localhost:3000`. Start the [backend](../backend/) first.

## Layout

```
src/
├── pages/
│   ├── LoginPage.tsx
│   ├── RegisterPage.tsx
│   ├── dashboard/                 # organiser views
│   │   ├── CompetitionsPage.tsx
│   │   └── CompetitionDetailPage.tsx  # tabs: competitors, categories, brackets, mats, standings
│   └── scoreboard/                # live scoreboard surfaces
│       ├── DisplayPage.tsx        # TV / projector — IJF blue/white, big timer, IPPON animation
│       ├── ControlPage.tsx        # table-official tablet — PIN gate, scoring buttons
│       └── SpectatorPage.tsx      # phone — live mat cards
├── components/
│   ├── BracketView.tsx
│   ├── StandingsTab.tsx
│   └── ...
├── hooks/
│   ├── useAuth.ts
│   └── useScoreboard.ts           # Socket.IO connection, score events
├── lib/
│   ├── api.ts                     # fetch wrapper, JWT injection
│   └── toast.ts
└── App.tsx                        # routes
```

## Tests

```bash
npx vitest run                  # all tests
npx vitest                      # watch mode
```

Components use React Testing Library. The api / auth helpers and LoginPage are covered today.

## Path alias

`@/*` resolves to `frontend/src/*` (configured in `vite.config.ts` and `tsconfig.app.json`). Use it for all internal imports:

```tsx
import { api } from '@/lib/api';
import { StandingsTab } from '@/components/StandingsTab';
```

## Styling

Tailwind v4 via `@tailwindcss/vite`. Custom keyframes for the IPPON animation + score-cell pulse live in `src/index.css`. The `prefers-reduced-motion` override is honoured for both. Component primitives come from shadcn/ui (browse `components/ui/` if a primitive is missing — generate via `npx shadcn add <name>`).

## Common tasks

**Add a route** — edit `App.tsx` and add the route inside the `<Routes>` block.

**Add an API call** — use the `api` helper:

```ts
import { api } from '@/lib/api';
const data = await api.get<Foo>('/competitions/123/foo');
```

**Add a TanStack Query** — see `CompetitionDetailPage.tsx` for the pattern (`useQuery` keyed on `[entity, id]`, `useMutation` with `invalidateQueries` in `onSuccess`).

**Subscribe to the scoreboard** — `useScoreboard(matId, pin?)` (see `hooks/useScoreboard.ts`). Without a PIN you get `viewer` role; with a valid PIN you get `controller` and can emit score events.
