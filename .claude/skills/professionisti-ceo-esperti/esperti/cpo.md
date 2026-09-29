# CPO / Product Strategist — Roadmap e Competitività

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Flusso ricerca → preventivo → prenotazione → recensione completo sul web; app mobile solo scheletro (3 schermate).
- 2026-09-28 — Da congelare fino a utenti paganti: altre sezioni admin, fiscale/DAC7, Stripe Connect.
- 2026-09-28 — KPI proposti: % richieste con ≥1 preventivo entro 4 h, preventivi accettati, recensioni per prenotazione.
- 2026-09-29 — Controversie: JobIssue (CHAT→OPEN→UPHELD/REJECTED) è l'unico flusso vivo; nessuna scadenza/cron su nessuna fase, esito solo binario + nota libera, BAD_WORK accolto non ha effetti, nessuna soglia di recidiva.
- 2026-09-29 — Dispute/Refund (job-payments/) sovrapposti ma inerti senza JobPayment; NO_SHOW scrive ancora `Booking.refundRequested` (promessa di rimborso impossibile: pagamenti fuori piattaforma).
