# CTO — Ingegneria, Affidabilità e Sicurezza

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — CI su ogni push (`.github/workflows/ci.yml`), uptime ping ogni 10 min (`uptime.yml`), migrazioni non distruttive (`packages/database/scripts/migrate-deploy.mjs`).
- 2026-09-28 — Rate limiting globale 60/min e 5-10/min su login/registrazione (`app.module.ts`, `auth.controller.ts`); `helmet` assente.
- 2026-09-28 — `render.yaml` ancora `plan: free` per API e DB: nessun backup, DB scade ogni 30 giorni; 5 job `@Cron` dipendono dal ping che tiene sveglia l'API.
- 2026-09-28 — JWT di 30 giorni non revocabile; in SSE il token viaggia nell'URL (`realtime.controller.ts`).
- 2026-09-28 — 10 file di test unitari (77 test), nessun test sul webhook Stripe né e2e di auth.
