# Professionisti — piattaforma marketplace

Monorepo per la piattaforma di ricerca professionisti locali (idraulico,
elettricista, imbianchino, ecc.). Architettura, stack e regole di sviluppo
sono documentati in [`CLAUDE.md`](./CLAUDE.md) — è la fonte di verità,
leggerlo prima di contribuire.

## Requisiti

- Node.js 24 (versione esatta in `.nvmrc`)
- pnpm ≥ 10 (`corepack enable` oppure `npm i -g pnpm`)
- PostgreSQL con estensione PostGIS (per `apps/api` in locale)

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp packages/database/.env.example packages/database/.env
cp apps/web/.env.example apps/web/.env.local

pnpm db:generate   # genera il Prisma Client
pnpm dev           # avvia web, mobile e api in parallelo (Turborepo)
```

- `apps/web` → http://localhost:3000
- `apps/api` → http://localhost:3001
- `apps/mobile` → avvia Expo (scansiona il QR code con Expo Go, oppure `pnpm --filter @professionisti/mobile ios|android`)

## Struttura

Mappa delle cartelle in `CLAUDE.md` §4, motivi delle scelte tecniche in
[`docs/architettura/stack.md`](./docs/architettura/stack.md), indice di tutta la
documentazione in [`docs/README.md`](./docs/README.md). Ogni app e pacchetto
principale ha il suo `CLAUDE.md` con le regole di quella cartella.

## Comandi principali

| Comando | Cosa fa |
|---|---|
| `pnpm dev` | Avvia tutte le app in dev (via Turborepo) |
| `pnpm build` | Build di produzione di tutti i package/app |
| `pnpm typecheck` | Type-check TypeScript su tutto il monorepo |
| `pnpm db:generate` | Rigenera il Prisma Client da `packages/database/prisma/schema.prisma` |
| `pnpm db:migrate` | Applica una migration Prisma in locale |

Nota: il build di produzione dell'app mobile avviene tramite **EAS Build**
(cloud), non in locale — vedi CLAUDE.md §2.
