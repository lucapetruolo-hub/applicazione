# Backend Architect — Sistemi, Pagamenti e API

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Checkout abbonamento/boost/lead in `apps/api/src/billing/billing.service.ts`; manca solo la chiave Stripe.
- 2026-09-28 — Webhook NON idempotente (nessuna tabella di eventi già elaborati): rischio doppioni su boost, `ManoviaRevenue`, `Payment`.
- 2026-09-28 — Disdette (`customer.subscription.deleted`) e pagamenti falliti (`invoice.payment_failed`) non gestiti; i boost non scadono mai (la ricerca filtra solo `status: "ACTIVE"`).
- 2026-09-28 — Nessun recupero password (`/password-dimenticata` rimanda al supporto).
- 2026-09-28 — Stripe Connect Express già creato in `apps/api/src/professional-fiscal/professional-fiscal.service.ts:212`; `account.updated` gestito in `billing.service.ts:249` ma salva solo `charges_enabled`, `payouts_enabled`, `requirements.currently_due`. Lo schema (`schema.prisma:1452-1454`) vieta di trattare il KYC Stripe come nostra verifica.
- 2026-09-28 — `ProfessionalProfile.verified` non viene mai messo a `true` da nessuna parte: "Profili verificati" non ha backend.
- 2026-09-28 — Stripe Connect verifica identità e IBAN, non mestiere (CCIAA, DM 37/08, RC). Badge "Identità verificata con Stripe": 1-2 giorni; verifica vera con documenti e admin: 1-2 settimane.
- 2026-09-28 — `ProfessionalsService.search` senza paginazione, carica tutte le prenotazioni e recensioni per profilo: ok fino a qualche centinaio.
