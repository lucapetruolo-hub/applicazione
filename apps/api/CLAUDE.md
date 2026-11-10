# apps/api: regole dell'API

Si carica quando Claude Code lavora in `apps/api`. Testo da `CLAUDE.md` §2
(10/11/2026).

- Lo script `build` di `apps/api` compila prima `@professionisti/database` e
  `@professionisti/shared` (altrimenti TypeScript non trova quei moduli): non toglierlo.
- **Guard JWT senza `@nestjs/passport`**: `apps/api/src/auth/jwt-auth.guard.ts` verifica il token
  manualmente con `JwtService.verify()` invece di usare `@nestjs/passport` +
  `passport-jwt`. Motivo: con quella combinazione (testata con
  `@nestjs/core@10.4.22` + `@nestjs/passport@10.0.3`), un guard che nega
  l'accesso restituisce sempre `500 Internal Server Error` invece di `401`
  — l'eccezione lanciata da `AuthGuard.handleRequest` non viene propagata
  correttamente nella pipeline async di Nest. Non reintrodurre passport per
  l'auth JWT senza aver prima verificato che il bug sia risolto a monte.
- **Operazioni** (docs/changelog/2026-11-08-infrastruttura-lancio.md):
  rollback, ripristino del database, attività a orario, avvisi, variabili e
  cambio di dominio in `docs/ops/`. Ogni variabile letta dall'API va in
  `render.yaml` (la CI lo controlla, `apps/api/scripts/check-render-env.mjs`).
  Le attività a orario si scrivono con `@ScheduledJob` di
  `apps/api/src/common/scheduled-job.ts`, mai con `@Cron`: ora italiana,
  nessun giro accavallato e un solo giro anche con due API accese durante
  un deploy (tabella `cron_runs`). `/health` è il controllo leggero di
  Render, `/health/db` (usato dall'uptime) controlla anche il database.
- L'API ascolta su `app.listen(port, "0.0.0.0")` e legge sempre
  `process.env.PORT` (fallback 3001): senza host esplicito il proxy IPv4 della
  piattaforma non la raggiunge; non hardcodare la porta.
- **Migrazioni DB**: mai `prisma db push` in produzione. Lo `start` di
  `apps/api` esegue `packages/database/scripts/migrate-deploy.mjs`
  (`prisma migrate deploy`, con baseline automatica solo sull'errore `P3005`).
  `20260921212750_baseline` deve restare lo schema realmente presente in
  produzione al passaggio, mai lo schema corrente: ogni
  modifica allo schema va in una nuova migrazione (`prisma migrate dev --name
  <nome>` in locale), **mai modificare una migrazione già unita** (la CI lo
  blocca). Migrazioni **solo additive** (nuove colonne e tabelle): un `DROP`
  o un `RENAME` va in una PR a parte, almeno un deploy dopo il codice che
  non usa più quella colonna, così il rollback dell'API resta possibile
  (`docs/ops/rollback.md`). Le
  categorie si sincronizzano a ogni avvio via `CategoriesSeedService`.
