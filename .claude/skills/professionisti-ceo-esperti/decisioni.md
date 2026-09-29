# Decisioni dell'utente

Letto dal CEO a ogni consultazione. Aggiornato dal CEO. Una riga per voce, con data.

## Registro decisioni dell'utente

- 2026-09-25 — Smistamento: 3 professionisti per richiesta normale, 5 per urgente; inoltro automatico delle richieste dirette attivo di default; il boost a pagamento NON entra nello smistamento (CLAUDE.md §9, `apps/api/src/guided-requests/lead-routing.ts`).
- 2026-09-28 — Badge assicurazione RC: si mostra come "dichiarata", colore neutro, mai come verificata finché non esiste un controllo della polizza (CHANGELOG §157).
- 2026-09-28 — Dichiarazione di responsabilità sul profilo professionista accettata cliccando "Salva profilo", senza casella (CHANGELOG §158-§159, `PROFILE_DECLARATION_TEXT`); testo da far validare a un avvocato.
- 2026-09-28 — Modello di ricavo: abbonamento unico a 3 livelli (~19/39/69 €, 5/15/illimitati lavori accettati al mese), tutte le funzioni per tutti, primo mese gratis per tutti; a chi non ha avuto preventivi accettati si regala un altro mese, comunicato solo vicino alla scadenza del primo mese. Niente lead a pagamento. Da rivedere sui dati dei primi mesi (CLAUDE.md §6).
- 2026-09-28 — Tempi di risposta: urgenti 35 min (7-22) / 60 min (notte), normali 4 ore diurne; nessun tasto "Me ne occupo io" (CHANGELOG §160, `lead-routing.ts`).
- 2026-09-28 — Account in pausa (fuori dalla ricerca, niente nuove richieste) a fine mese gratuito senza livello, ad abbonamento concluso e ai lavori del mese esauriti, con banner fisso in Home e Abbonamento; al limite si continua pagando solo la differenza verso il livello superiore; rinnovo automatico con avviso prima di ogni rinnovo, annullamento attivo fino alla scadenza; il mese gratuito vale come Base e sulla pagina prezzi Base appare "€19 barrato · Gratuito" (CHANGELOG §162).
- 2026-09-29 — Segnalazioni del cliente: mancata presentazione entro 7 giorni dalla fine dell'appuntamento, lavoro fatto male entro 14 giorni; prima fase in chat tra cliente e professionista, poi (se il cliente lo chiede) decide un admin; mancata presentazione accolta abbassa il punteggio nello smistamento; recensione dopo la decisione (CHANGELOG §164).
- 2026-09-29 — Controversie sul modello Amazon A-Z (CHANGELOG §167): procedura interna, niente agenzie; 48h in chat, 72h versione del professionista, 72h informazioni (senza risposta = accolta), admin decide entro 2 giorni, ricorso 30 giorni a un admin diverso. Misure in 30 giorni: avvertimento → più in basso 14 giorni → niente nuove richieste 14 giorni. Anche "lavoro fatto male" abbassa il punteggio. Mancata presentazione accolta: tasto per inviare la richiesta ad altri. Pagamenti online dei lavori con Stripe, con rimborso garantito se la segnalazione è accolta (non annunciarlo finché i pagamenti non sono attivi). Regolamento in bozza per l'avvocato.
- 2026-09-29 — Pagamento dei lavori (CHANGELOG §168): il cliente sceglie all'accettazione. Online con Stripe: acconto 20% del massimo, saldo a fine lavoro, soldi in custodia fino a conferma o 7 giorni, al professionista meno costo Stripe e commissione 5% (a suo carico); saldo non pagato in 7 giorni → acconto al pro e caso al team. Diretto: nessun rimborso né decisione nostra, parti in contatto in chat, recensione comunque. Termini scritti come attivi.
- 2026-09-28 — Il CEO e gli esperti possono modificare questa skill e i propri file di memoria per migliorarsi; obiettivo: consumare meno token possibile. Mai allentare i cancelli su decisioni critiche e merge.

## Decisioni critiche aperte (aspettano il sì/no dell'utente)

- Hosting a pagamento su Render (~14 $/mese: DB con backup + API senza sleep) + dominio (~10 €/anno).
- Claim falsi pubblicati: A) togliere subito "verificati" e le risposte false di `WhatIfSection.tsx`, B) costruire prima una verifica manuale admin (consigliata B). Le risposte false delle FAQ vanno tolte in ogni caso.
- Nome unico del brand (Manovia) e dominio.
- Città e 3 categorie di lancio (proposta: capoluogo medio dove l'utente ha contatti; idraulico, elettricista, pulizie).
- Lanciare senza incassare fino a P.IVA/società + parere del commercialista.
- Pagamenti online: deciso e implementato (29/09, §168). Storico delle opzioni considerate: A) abbonati pagano solo il costo del pagamento, B) lavori pagati online fuori dal limite mensile, C) commissione + costi. Mai abbonamento + commissione obbligatori insieme.
- Se chi manca un'urgenza di notte perde punteggio.
- Passaggio a un livello inferiore (oggi: annullare e sceglierlo alla scadenza).
