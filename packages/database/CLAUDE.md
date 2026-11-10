# packages/database: schema e migrazioni

Si carica quando Claude Code lavora in `packages/database`. Testo da
`CLAUDE.md` §2 (10/11/2026).

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
