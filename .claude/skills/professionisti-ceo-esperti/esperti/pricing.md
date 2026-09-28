# Business Model & Pricing Lead — Unit Economics

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Piani Free/Pro €29/Business €59 in `packages/shared/src/plans.ts`, ma nessuna funzione è riservata a chi paga.
- 2026-09-28 — Lead €5/€8 (`guided-requests.service.ts:18-19`) con checkout non esposto nel sito.
- 2026-09-28 — Commissione Manovia 10% come regola DB modificabile (`platform-fee-rules.service.ts:14`), segnaposto.
- 2026-09-28 — Tetto dell'abbonamento: contare i lavori accettati (Booking creato all'accettazione, `bookings.service.ts:61-75`), non i completati (li segna il professionista).
- 2026-09-28 — Lavoro da 80 €: a Manovia ~6,3 € dopo fee Stripe con commissione 10%; da 500 €: ~41 €.
