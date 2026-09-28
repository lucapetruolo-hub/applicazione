# Growth & Acquisition Lead — Reclutamento e Acquisizione

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Nessuna città di lancio scelta nel repo. Soglia proposta: 15 professionisti attivi per categoria (45 totali) prima di aprire ai clienti.
- 2026-09-28 — Lista d'attesa salva solo l'email (`WaitlistSignup`); nessuno strumento operatore per creare profili al telefono; nessuna prova gratuita/coupon in billing.
- 2026-09-28 — Email dei lead via Resend senza dominio proprio: arrivano solo al titolare dell'account o in spam.
- 2026-09-28 — "Rispondere" a un lead = inviare un preventivo o rifiutare; nessun passo "Me ne occupo io". Scadenza controllata ogni 5 minuti; i lead mancati abbassano `responseRate` (15% del punteggio).
- 2026-09-28 — `QuotesService` non controlla `lead.status`: via API si può mandare un preventivo anche dopo la scadenza.
