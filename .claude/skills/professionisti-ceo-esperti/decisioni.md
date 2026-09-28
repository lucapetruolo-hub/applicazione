# Decisioni dell'utente

Letto dal CEO a ogni consultazione. Aggiornato dal CEO. Una riga per voce, con data.

## Registro decisioni dell'utente

- 2026-09-25 — Smistamento: 3 professionisti per richiesta normale, 5 per urgente; inoltro automatico delle richieste dirette attivo di default; il boost a pagamento NON entra nello smistamento (CLAUDE.md §9, `apps/api/src/guided-requests/lead-routing.ts`).
- 2026-09-28 — Badge assicurazione RC: si mostra come "dichiarata", colore neutro, mai come verificata finché non esiste un controllo della polizza (CHANGELOG §157).
- 2026-09-28 — Dichiarazione di responsabilità sul profilo professionista accettata cliccando "Salva profilo", senza casella (CHANGELOG §158-§159, `PROFILE_DECLARATION_TEXT`); testo da far validare a un avvocato.
- 2026-09-28 — Modello di ricavo: abbonamento unico a 3 livelli (~19/39/69 €, 5/15/illimitati lavori accettati al mese), tutte le funzioni per tutti, primo mese gratis per tutti; a chi non ha avuto preventivi accettati si regala un altro mese, comunicato solo vicino alla scadenza del primo mese. Niente lead a pagamento. Da rivedere sui dati dei primi mesi (CLAUDE.md §6).
- 2026-09-28 — Tempi di risposta: urgenti 35 min (7-22) / 60 min (notte), normali 4 ore diurne; nessun tasto "Me ne occupo io" (CHANGELOG §160, `lead-routing.ts`).
- 2026-09-28 — Il CEO e gli esperti possono modificare questa skill e i propri file di memoria per migliorarsi; obiettivo: consumare meno token possibile. Mai allentare i cancelli su decisioni critiche e merge.

## Decisioni critiche aperte (aspettano il sì/no dell'utente)

- Hosting a pagamento su Render (~14 $/mese: DB con backup + API senza sleep) + dominio (~10 €/anno).
- Claim falsi pubblicati: A) togliere subito "verificati" e le risposte false di `WhatIfSection.tsx`, B) costruire prima una verifica manuale admin (consigliata B). Le risposte false delle FAQ vanno tolte in ogni caso.
- Nome unico del brand (Manovia) e dominio.
- Città e 3 categorie di lancio (proposta: capoluogo medio dove l'utente ha contatti; idraulico, elettricista, pulizie).
- Lanciare senza incassare fino a P.IVA/società + parere del commercialista.
- Pagamenti online: l'utente vuole "ragionarci meglio". Opzioni sul tavolo: A) abbonati pagano solo il costo del pagamento, B) lavori pagati online fuori dal limite mensile, C) commissione + costi. Mai abbonamento + commissione obbligatori insieme.
- Cosa succede al limite di lavori (lavoro extra a pagamento o passaggio al livello superiore) e se chi manca un'urgenza di notte perde punteggio.
