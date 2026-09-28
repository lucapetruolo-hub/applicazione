# Memoria del consiglio di esperti

Letta dal CEO prima di ogni consultazione e aggiornata subito dopo (vedi
"Memoria del consiglio" in `SKILL.md`). Una riga per voce, sempre con file o
fonte e data. Se il codice smentisce una voce, correggila o cancellala: non è
uno storico, è lo stato attuale di ciò che sappiamo.

## Registro decisioni dell'utente

- 2026-09-25 — Smistamento: 3 professionisti per richiesta normale, 5 per urgente; inoltro automatico delle richieste dirette attivo di default; il boost a pagamento NON entra nello smistamento (CLAUDE.md §9, `apps/api/src/guided-requests/lead-routing.ts`).
- 2026-09-28 — Badge assicurazione RC: si mostra come "dichiarata", colore neutro, mai come verificata finché non esiste un controllo della polizza (CHANGELOG §157).
- 2026-09-28 — Dichiarazione di responsabilità obbligatoria al salvataggio del profilo professionista, testo del consiglio legale da far validare a un avvocato (CHANGELOG §158, `PROFILE_DECLARATION_TEXT` in `packages/shared/src/schemas.ts`).
- 2026-09-28 — Autorizzato il CEO a modificare questa skill e questa memoria (non i cancelli su decisioni critiche e merge).

## Decisioni critiche aperte (aspettano il sì/no dell'utente)

- Hosting a pagamento su Render (~14 $/mese: DB con backup + API senza sleep) + dominio (~10 €/anno).
- Claim falsi pubblicati: A) togliere subito "verificati" e le risposte false di `WhatIfSection.tsx`, B) costruire prima una verifica manuale admin (consigliata B). Le risposte false delle FAQ vanno tolte in ogni caso.
- Nome unico del brand (Manovia) e dominio.
- Città e 3 categorie di lancio (proposta: capoluogo medio dove l'utente ha contatti; idraulico, elettricista, pulizie).
- Lanciare senza incassare fino a P.IVA/società + parere del commercialista.
- Modello di ricavo proposto dall'utente (abbonamento unico con tetto di lavori accettati, livelli ~19/39/69 €, prova 3 mesi ai reclutati e 1 mese agli altri) — consiglio: approvare con modifiche (soglia morbida, niente blocco al tetto).
- Pagamenti online: A) abbonati pagano solo il costo del pagamento, B) lavori pagati online fuori dal tetto, C) commissione + costi. Mai abbonamento + commissione obbligatori insieme.
- Tempi di risposta: urgenti da 20 min a 30 min (7-22) / 60 min (notte) per "Me ne occupo io" + 2 h per il preventivo; normali 4 h diurne presa in carico + 24 h diurne preventivo; nessuna penalità per urgenze notturne mancate.

## CTO — Ingegneria, Affidabilità e Sicurezza

- 2026-09-28 — CI su ogni push (`.github/workflows/ci.yml`), uptime ping ogni 10 min (`uptime.yml`), migrazioni non distruttive (`packages/database/scripts/migrate-deploy.mjs`).
- 2026-09-28 — Rate limiting globale 60/min e 5-10/min su login/registrazione (`app.module.ts`, `auth.controller.ts`); `helmet` assente.
- 2026-09-28 — `render.yaml` ancora `plan: free` per API e DB: nessun backup, DB scade ogni 30 giorni; 5 job `@Cron` dipendono dal ping che tiene sveglia l'API.
- 2026-09-28 — JWT di 30 giorni non revocabile; in SSE il token viaggia nell'URL (`realtime.controller.ts`).
- 2026-09-28 — 10 file di test unitari (77 test), nessun test sul webhook Stripe né e2e di auth.

## Backend Architect — Sistemi, Pagamenti e API

- 2026-09-28 — Checkout abbonamento/boost/lead in `apps/api/src/billing/billing.service.ts`; manca solo la chiave Stripe.
- 2026-09-28 — Webhook NON idempotente (nessuna tabella di eventi già elaborati): rischio doppioni su boost, `ManoviaRevenue`, `Payment`.
- 2026-09-28 — Disdette (`customer.subscription.deleted`) e pagamenti falliti (`invoice.payment_failed`) non gestiti; i boost non scadono mai (la ricerca filtra solo `status: "ACTIVE"`).
- 2026-09-28 — Nessun recupero password (`/password-dimenticata` rimanda al supporto).
- 2026-09-28 — Stripe Connect Express già creato in `apps/api/src/professional-fiscal/professional-fiscal.service.ts:212`; `account.updated` gestito in `billing.service.ts:249` ma salva solo `charges_enabled`, `payouts_enabled`, `requirements.currently_due`. Lo schema (`schema.prisma:1452-1454`) vieta di trattare il KYC Stripe come nostra verifica.
- 2026-09-28 — `ProfessionalProfile.verified` non viene mai messo a `true` da nessuna parte: "Profili verificati" non ha backend.
- 2026-09-28 — Stripe Connect verifica identità e IBAN, non mestiere (CCIAA, DM 37/08, RC). Badge "Identità verificata con Stripe": 1-2 giorni; verifica vera con documenti e admin: 1-2 settimane.
- 2026-09-28 — `ProfessionalsService.search` senza paginazione, carica tutte le prenotazioni e recensioni per profilo: ok fino a qualche centinaio.

## Frontend Lead / Designer — UX e Prodotto

- 2026-09-28 — "Verificati" falso in `ResultsListWithMap.tsx`, `SiteFooter.tsx`, `HomeHero.tsx`, metadati di `/cerca`; `PlatformGuarantee.tsx` è già onesto ("In arrivo").
- 2026-09-28 — `WhatIfSection.tsx` promette rimborso e sostituto entro 4 ore, rientro a spese del professionista, prezzo vincolante: non esistono.
- 2026-09-28 — Sotto 12 professionisti la home mostra `WaitlistBlock` "Arriviamo presto" (`ProfessionalsShowcase.tsx:14`); sopra, foto stock randomuser.me segnate "TEMPORANEO".
- 2026-09-28 — `GuidedRequestForm.tsx` supera le 1.200 righe: da semplificare e misurare.
- 2026-09-28 — Il tasto Salva del profilo pubblico sta nella riga delle azioni (CHANGELOG §155).

## Chief Legal Advisor — Privacy e Compliance

- 2026-09-28 — Segnaposto `[DA COMPILARE]` pubblicati in `privacy/page.tsx`, `contatti/ContattiContent.tsx`, `accessibilita/page.tsx`.
- 2026-09-28 — Banner cookie senza "Rifiuta" né revoca (`components/CookieBanner.tsx`): vietato dalle linee guida del Garante 2021. Non era nella checklist.
- 2026-09-28 — `/termini` non copre DSA (reclamo interno, punto di contatto, moderazione, regole sui contenuti); §6 "non rispondiamo di danni" da validare (Codice del Consumo artt. 33-36).
- 2026-09-28 — Esenzione hosting DSA art. 6 a rischio con claim "verificati" senza verifica (art. 6.3).
- 2026-09-28 — Dichiarazione al salvataggio del profilo aggiunta con data/versione; è una prova, non un esonero.

## CFO — Fiscale e Modello di Pagamento

- 2026-09-28 — Serve P.IVA/società prima di incassare qualunque cosa (anche il mese di prova gratuito conta come attività).
- 2026-09-28 — Pagamento lavori: destination charge senza `on_behalf_of` (`job-payments.service.ts:196-199`): la fee Stripe la paga Manovia; rischio mandatario senza rappresentanza (IVA sull'intero importo) → parere scritto del commercialista.
- 2026-09-28 — `ManoviaRevenue` registra la commissione lorda, nessun campo per il costo Stripe: il margine reale non si vede (`schema.prisma:1612`).
- 2026-09-28 — Nessuna integrazione PayPal; consiglio: non al lancio.
- 2026-09-28 — La ricevuta Stripe non è fattura elettronica SDI: serve un fornitore SDI. Export DAC7 solo bozza interna.
- 2026-09-28 — Costo del pagamento al professionista: meglio una commissione unica "tutto incluso" che una voce separata; mai sovrapprezzo al cliente consumatore.

## Business Model & Pricing Lead — Unit Economics

- 2026-09-28 — Piani Free/Pro €29/Business €59 in `packages/shared/src/plans.ts`, ma nessuna funzione è riservata a chi paga.
- 2026-09-28 — Lead €5/€8 (`guided-requests.service.ts:18-19`) con checkout non esposto nel sito.
- 2026-09-28 — Commissione Manovia 10% come regola DB modificabile (`platform-fee-rules.service.ts:14`), segnaposto.
- 2026-09-28 — Tetto dell'abbonamento: contare i lavori accettati (Booking creato all'accettazione, `bookings.service.ts:61-75`), non i completati (li segna il professionista).
- 2026-09-28 — Lavoro da 80 €: a Manovia ~6,3 € dopo fee Stripe con commissione 10%; da 500 €: ~41 €.

## Growth & Acquisition Lead — Reclutamento e Acquisizione

- 2026-09-28 — Nessuna città di lancio scelta nel repo. Soglia proposta: 15 professionisti attivi per categoria (45 totali) prima di aprire ai clienti.
- 2026-09-28 — Lista d'attesa salva solo l'email (`WaitlistSignup`); nessuno strumento operatore per creare profili al telefono; nessuna prova gratuita/coupon in billing.
- 2026-09-28 — Email dei lead via Resend senza dominio proprio: arrivano solo al titolare dell'account o in spam.
- 2026-09-28 — "Rispondere" a un lead = inviare un preventivo o rifiutare; nessun passo "Me ne occupo io". Scadenza controllata ogni 5 minuti; i lead mancati abbassano `responseRate` (15% del punteggio).
- 2026-09-28 — `QuotesService` non controlla `lead.status`: via API si può mandare un preventivo anche dopo la scadenza.

## Go-To-Market Lead — Lancio e Posizionamento

- 2026-09-28 — Il nome pubblico è "Professionisti" (header, footer, manifest, titoli); "Manovia" solo in fiscale/pagamenti. Dominio `applicazione-web.vercel.app` fisso in `lib/siteUrl.ts`.
- 2026-09-28 — Differenziatori veri nel codice: 3 professionisti scelti per qualità, urgenze, contatti protetti fino all'accettazione (CLAUDE.md §5.9), recensioni solo da lavori completati.
- 2026-09-28 — Promesse false in homepage: verifica documenti/RC, rimborso entro 4 ore, "Pagamento protetto", SMS, "filtrate dall'IA".
- 2026-09-28 — Consiglio: lancio silenzioso in una città, nessun comunicato stampa.

## CPO / Product Strategist — Roadmap e Competitività

- 2026-09-28 — Flusso ricerca → preventivo → prenotazione → recensione completo sul web; app mobile solo scheletro (3 schermate).
- 2026-09-28 — Da congelare fino a utenti paganti: altre sezioni admin, fiscale/DAC7, Stripe Connect.
- 2026-09-28 — KPI proposti: % richieste con ≥1 preventivo entro 4 h, preventivi accettati, recensioni per prenotazione.

## Analytics & Data Lead — Funnel e Dashboard

- 2026-09-28 — Vercel Analytics conta solo pagine viste (nessun `track()` in `apps/web/src`); Sentry solo sull'API.
- 2026-09-28 — Funnel esiste solo per singolo professionista (`revenue-analytics.service.ts`); manca la vista di piattaforma, ma i timestamp ci sono (`GuidedRequest`, `Quote`, `Booking`, `Lead`, `ProfessionalMetrics`).
- 2026-09-28 — Metriche proposte dal giorno 1: richieste con preventivo entro 24 h (allarme <50%), tempo al primo preventivo (>4 h), richieste → prenotazione (<15%), richieste a zero professionisti (>10%), professionisti attivi per categoria/città (<3), abbandono di `/preventivo` (oggi non misurabile).
