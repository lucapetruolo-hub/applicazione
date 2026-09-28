# Analytics & Data Lead — Funnel e Dashboard

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Vercel Analytics conta solo pagine viste (nessun `track()` in `apps/web/src`); Sentry solo sull'API.
- 2026-09-28 — Funnel esiste solo per singolo professionista (`revenue-analytics.service.ts`); manca la vista di piattaforma, ma i timestamp ci sono (`GuidedRequest`, `Quote`, `Booking`, `Lead`, `ProfessionalMetrics`).
- 2026-09-28 — Metriche proposte dal giorno 1: richieste con preventivo entro 24 h (allarme <50%), tempo al primo preventivo (>4 h), richieste → prenotazione (<15%), richieste a zero professionisti (>10%), professionisti attivi per categoria/città (<3), abbandono di `/preventivo` (oggi non misurabile).
