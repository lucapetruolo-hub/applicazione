# CTO — Ingegneria, Affidabilità e Sicurezza

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — CI su ogni push (`.github/workflows/ci.yml`), uptime ping ogni 10 min (`uptime.yml`, tiene sveglia l'API; ritardi cron GitHub), migrazioni non distruttive (`packages/database/scripts/migrate-deploy.mjs`).
- 2026-09-28 — Rate limiting globale 60/min e 5-10/min su login/registrazione (`app.module.ts`, `auth.controller.ts:38-53`); `helmet` assente (riverificato 10/02).
- 2026-10-02 — `render.yaml` ancora `plan: free` per API e DB: nessun backup/PITR, DB scade ogni 30 giorni.
- 2026-10-02 — 10 job `@Cron` (accrediti `online-money.service.ts:390`, promemoria a finestra 23-25h `booking-reminders.service.ts:16-17,46` = persi se l'API dorme >2h, smistamento ogni 5 min `guided-requests.service.ts:961`).
- 2026-10-02 — Webhook Stripe NON idempotente: commento dice "per event.id" ma nessuno store eventi; `payment.create` duplicato ai retry (`billing.service.ts:327-366`).
- 2026-10-02 — `transfers.create` senza `idempotencyKey`, check `releasedAt` poi transfer poi update senza lock (`online-money.service.ts:174,290,337`): rischio doppio accredito.
- 2026-10-02 — `render.yaml` dichiara `STRIPE_PRICE_PRO/BUSINESS`, il codice legge `STRIPE_PRICE_BASE/PLUS/PRO` (`billing.service.ts:24-26`).
- 2026-10-02 — 15 file test unitari; `online-payments.test.ts` solo regole pure (10 test). Nessun test su webhook, transfer, rimborsi, cron.
- 2026-09-28 — JWT di 30 giorni non revocabile; in SSE il token viaggia nell'URL (`realtime.controller.ts`).
