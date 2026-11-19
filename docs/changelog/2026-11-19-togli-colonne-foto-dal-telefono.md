# 19/11/2026 — Tolte le colonne vecchie di "Scatta dal telefono"

**Richiesta di Luca.** Proposta del 17/11 (dopo
`2026-11-17-piu-foto-dal-telefono.md`): togliere in una PR a parte le colonne
`photo` e `mediaType` di `photo_handoffs`, che dal 17/11 non si usano più
perché le foto stanno in `photo_handoff_photos`. Luca: "sì", poi il 19/11
"fai ora le colonne vecchie".

**Decisione.** Migrazione `20261119090000_togli_colonne_vecchie_foto_dal_telefono`
con `DROP COLUMN` delle due colonne, in una PR da sola come chiede
`docs/ops/rollback.md`: il codice che non le usa è in produzione dalla PR #386
(unita il 17/11). Nessun dato perso: lì dentro restavano al massimo foto di 10
minuti, già scadute.

**Attenzione per un rollback.** Da qui in poi l'API non si può riportare a una
versione di prima della #386 (16-17/11): quella leggeva ancora le colonne.

**Verifica.** `prisma migrate deploy` su un database locale e
`prisma migrate diff` (migrazione vuota: schema e database uguali); nessun
codice usa più le colonne (grep); prove di `photo-handoff`, typecheck e lint
dell'API verdi.
