# Skill prisma-patterns e database-migrations da ECC

**Richiesta** (Luca, 16/11/2026): controllare la raccolta "ecc" di affaan-m
(Everything Claude Code) e capire se serve al progetto. Dopo la valutazione,
"Sì" alla proposta di copiare solo due skill come testo.

**Decisione**: niente installazione di ECC (hook in Node a ogni comando,
4.700 file, sovrapposizioni con le nostre skill). Copiate solo
`.claude/skills/prisma-patterns/` e `.claude/skills/database-migrations/`, dal
commit `d2ef268` di github.com/affaan-m/ECC, licenza MIT (file `LICENSE`
accanto). Testo originale invariato, con in cima una sezione "Nel nostro
progetto" che lo lega alle regole di `packages/database/CLAUDE.md` (mai
`db push`, migrazioni solo additive, mai toccare una migrazione unita, Prisma
6 senza adapter, API su Render non serverless, filtri di visibilità di
`CLAUDE.md` §5 punto 11).

**Motivo**: raccolgono trappole di Prisma e regole per cambiare il database
senza fermare il sito, utili per i lavori sul backend prima e dopo il lancio.
Le altre skill di ECC sono generiche o doppioni di quelle che abbiamo già
(owasp-security-audit, seo-audit, accessibility-review).

**Verifica**: lette riga per riga le due skill (nessun comando che parte da
solo, nessun link esterno oltre alla fonte); controllati i percorsi citati
(`packages/database/scripts/migrate-deploy.mjs`, `docs/ops/rollback.md`,
`publicVisibilityWhere`).

**Giro sul codice con le regole delle skill** (16/11/2026, chiesto da Luca):
- `updateMany`/`deleteMany` usati come record: nessuno, tutti leggono `.count`
  (e TypeScript strict lo impedirebbe comunque).
- `deleteMany()` senza `where`: nessuno.
- Chiamate esterne (Stripe, email, fetch) dentro `$transaction(async ...)`:
  nessuna nelle 10 transazioni interattive.
- `@updatedAt` su `updateMany`: la skill dice che non si aggiorna, ma su
  Prisma 6.19.3 si aggiorna (provato su Postgres locale). Corretto nella
  sezione "Nel nostro progetto" di `prisma-patterns`.
- Migrazioni: le ultime con `DROP COLUMN` sono già unite e non si toccano;
  nessun `ADD COLUMN ... NOT NULL` senza valore di partenza.

**Controllo in `pnpm lint`** (16/11/2026, ok di Luca): in `eslint.config.mjs`
una regola per `apps/api/src` blocca `deleteMany()`, `deleteMany({})` e
`deleteMany({ where: {} })`, che svuotano la tabella intera. L'unico caso
voluto (`popular-jobs.service.ts`, l'elenco su misura sostituisce quello di
partenza) ha `eslint-disable-next-line` con il motivo. Verifica: `eslint src`
dell'API passa; un file di prova con le tre forme dà i tre errori, la forma
con una condizione vera passa.
