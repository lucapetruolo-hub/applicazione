# Business Model & Pricing Lead — Unit Economics

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Livelli Base €19/5, Plus €39/15, Pro €69/illimitati in `packages/shared/src/plans.ts` (CHANGELOG §161); conteggio e avvisi 80/100% in `apps/api/src/subscriptions/`. Dal §162: al limite l'account va in pausa finché non passa al livello superiore pagando la differenza o non inizia il mese dopo; il mese gratuito vale come Base.
- 2026-09-28 — Lead €5/€8 (`guided-requests.service.ts:18-19`) con checkout non esposto nel sito.
- 2026-09-28 — Commissione Manovia 10% come regola DB modificabile (`platform-fee-rules.service.ts:14`), segnaposto.
- 2026-09-28 — Lavoro accettato = Booking creata nel mese (ora di Roma), esclusi gli annullati dal cliente (`SubscriptionsService.countAcceptedJobsThisMonth`).
- 2026-09-28 — Lavoro da 80 €: a Manovia ~6,3 € dopo fee Stripe con commissione 10%; da 500 €: ~41 €.
