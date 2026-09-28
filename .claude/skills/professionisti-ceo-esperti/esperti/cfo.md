# CFO — Fiscale e Modello di Pagamento

Fatti verificati nel codice (max 20 righe: tieni i più utili, cancella i superati).

- 2026-09-28 — Serve P.IVA/società prima di incassare qualunque cosa (anche il mese di prova gratuito conta come attività).
- 2026-09-28 — Pagamento lavori: destination charge senza `on_behalf_of` (`job-payments.service.ts:196-199`): la fee Stripe la paga Manovia; rischio mandatario senza rappresentanza (IVA sull'intero importo) → parere scritto del commercialista.
- 2026-09-28 — `ManoviaRevenue` registra la commissione lorda, nessun campo per il costo Stripe: il margine reale non si vede (`schema.prisma:1612`).
- 2026-09-28 — Nessuna integrazione PayPal; consiglio: non al lancio.
- 2026-09-28 — La ricevuta Stripe non è fattura elettronica SDI: serve un fornitore SDI. Export DAC7 solo bozza interna.
- 2026-09-28 — Costo del pagamento al professionista: meglio una commissione unica "tutto incluso" che una voce separata; mai sovrapprezzo al cliente consumatore.
