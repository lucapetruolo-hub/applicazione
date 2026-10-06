# Growth & Acquisition Lead — Reclutamento e Acquisizione

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Nessuna città di lancio scelta nel repo. Soglia proposta: 15 professionisti attivi per categoria (45 totali) prima di aprire ai clienti.
- 2026-09-28 — Email dei lead via Resend senza dominio proprio: arrivano solo al titolare dell'account o in spam.
- 2026-09-28 — "Rispondere" a un lead = inviare un preventivo o rifiutare. Scadenza ogni 5 min; i lead mancati abbassano `responseRate` (15% del punteggio).
- 2026-09-28 — `QuotesService` non controlla `lead.status`: via API si può mandare un preventivo anche dopo la scadenza.
- 2026-10-02 — Prova: `ensureTrial` parte alla PRIMA creazione del profilo (professionals.service.ts:675), 30 gg (plans.ts:30) + mese regalato se 0 lavori (subscriptions.service.ts:286-291). Un professionista reclutato >60 gg prima del lancio arriva al lancio con la prova scaduta.
- 2026-10-02 — Pausa solo se `paymentsActive()` (subscriptions.service.ts:125): finché Stripe è spento nessuno va in pausa, ma attivandolo i reclutati in anticipo finiscono subito fuori dalla ricerca.
- 2026-10-02 — Nessun endpoint admin per creare un profilo al posto del professionista né per spostare `trialEndsAt` (admin.controller.ts: solo sospensioni, ruoli, segnalazioni). L'operatore al telefono oggi deve registrarsi con l'email del professionista.
- 2026-10-02 — Vetrina: `MIN_PROFESSIONALS_TO_SHOWCASE = 12` (ProfessionalsShowcase.tsx:14) conta i profili non demo di TUTTA Italia (page.tsx:17), non per città/categoria. Lista d'attesa salva solo l'email.
- 2026-10-02 — Raccomandazione: reclutamento in parallelo da subito, ma prova che parte dal lancio (data fissa o dal primo lead), non dalla registrazione.
