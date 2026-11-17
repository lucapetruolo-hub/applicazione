# Mestiere raro: il più vicino a quanti km, e contatore dei più richiesti

**Richiesta** (Luca, 17/11/2026, thread "Gestire le richieste per mestieri
senza iscritti", sulle migliorie dopo la #391): "dovrebbe comparire già,
dicendo che non c'è nessuno in zona, il più vicino a n km con la lista di tutti
gli altri in base alla distanza"; per le richieste di prima: "devono essere
messe in ordine di ricezione con un contatore dei richiesti per vedere quali
sono i più richiesti". No a far scadere da sole le richieste di prima.

**Decisione**

- Ricerca dal problema per un mestiere che quasi nessuno fa (gli 8 fuori
  servizio e i mestieri che non abbiamo, `offre=`): se nel raggio non c'è
  nessuno, la ricerca mostra **tutti** quelli entro `SEARCH_FALLBACK_MAX_KM`
  (100 km), dal più vicino (`selectSearchArea(..., "all")`), non solo il più
  vicino. Per le altre ricerche resta il più vicino (§349).
- Quando sono tutti fuori raggio l'elenco è in ordine di distanza.
- La scheda "Nessuno fa ancora questo lavoro vicino a te" compare anche in quel
  caso: "Nessuno lo fa entro 25 km da Lecce. Il più vicino è a circa 37 km: qui
  sotto trovi tutti i 2, dal più vicino. Puoi chiedere a loro un preventivo.
  Oppure lascia la richiesta…". La riga generica della lista non si ripete.
  Quando la lista generica ne mostra più d'uno dice "i più vicini".
- Admin › Richieste in attesa: riquadro "Più richiesti" in cima a tutte le
  schede, mestieri contati insieme tra richieste in attesa e di prima
  ("Ce ne occupiamo noi"), degli ultimi 90 giorni (`countRequestedTrades`).
- "Di prima": in ordine di arrivo, con il numero della riga; il pericolo resta
  segnato nella riga ma non la porta più in cima.

**Verifica**: prove di `search-area.test.ts` e `waitingTrade.test.ts`;
`e2e/tests/richiesta-in-attesa.spec.ts` con due antennisti a Brindisi e
Taranto cercati da Lecce, da telefono e computer, e il contatore in Admin.
