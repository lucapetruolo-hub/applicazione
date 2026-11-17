# Richieste in attesa per i mestieri che nessuno fa ancora

**Richiesta** (Luca, 17/11/2026, thread "Gestire le richieste per mestieri
senza iscritti"): "quando per esempio il lavoro che cerco lo fa un antennista
che non è ancora presente in elenco, con ce ne occupiamo noi, lui deve mandare
una richiesta preventivo completa, così appena facciamo iscrivere qualcuno che
fa quel lavoro, il lavoro glielo facciamo arrivare". Piano in
`analisi/mestieri-senza-iscritti-versione-profonda.md` (cartella del
progetto); Luca ha detto sì a 6 decisioni su 7, no alla 4.

**Decisioni di Luca (17/11/2026)**

1. Al posto di "Ce ne occupiamo noi": "Nessuno fa ancora questo lavoro vicino
   a te · Lascia la richiesta". "Ce ne occupiamo noi" faceva pensare che il
   lavoro lo facesse il sito (CLAUDE.md §5 punto 18): ora la lint delle frasi
   la ferma.
2. Richiesta completa come le altre: descrizione, foto, indirizzo, quando.
3. Vale 60 giorni (come le altre); al 30° giorno "Ti serve ancora?".
4. **No**: niente domanda al cliente prima di mandare una richiesta più
   vecchia di 14 giorni. Arriva direttamente.
5. "Oggi" non si offre: si dice subito che in giornata non c'è nessuno.
6. Arriva da sola a chi fa quel lavoro appena il suo profilo è visibile.
7. Durante l'iscrizione il professionista vede "Vicino a te ci sono N
   richieste di …".

**Come funziona**

- La richiesta è una `GuidedRequest` vera, con `waitingTrade` (nome del
  mestiere), `waitingTradeKey` (uno degli 8 lavori fuori servizio) e
  `stillNeededAskedAt`. Si salva con la categoria di comodo `tuttofare`
  (`WAITING_REQUEST_HOST_CATEGORY`), che non decide a chi arriva: il percorso
  per categoria la esclude (`waitingTrade: null`), anche nei carichi delle
  richieste generali.
- Arriva a chi ha le parole del mestiere nelle prestazioni, nei patentini o
  nella descrizione, con lo stesso confronto della ricerca "Chi offre…"
  (`packages/shared/src/waitingTrade.ts`), nel raggio del professionista e con
  i filtri di visibilità di sempre. Il boost non conta.
- `matchProfileToWaitingTrades` gira quando un profilo diventa visibile
  (insieme a `matchNewProfileToOpenRequests`) e quando un profilo attivo salva
  le prestazioni. Al primo che la riceve la richiesta prende la categoria della
  prestazione che corrisponde e il cliente riceve `REQUEST_MATCHED_LATER`; la
  cronologia dice da quanto aspettava.
- Il cliente vede sempre il nome del mestiere (email, Le mie richieste,
  notifiche), non "Tutto Fare". Email di conferma: "Oggi nessuno fa ancora
  questo lavoro vicino a te… Non sappiamo dirti quando".
- Al 30° giorno `WAITING_REQUEST_STILL_NEEDED` (argomento "richieste"); alla
  scadenza senza nessuno, email "Non abbiamo trovato nessuno in tempo" con
  "Rimanda la richiesta".
- Professionista: `GET /guided-requests/waiting-nearby` (25 km) mostra in Il
  mio profilo, sotto le prestazioni, quante richieste aspettano qualcuno con le
  sue parole.
- Admin › Richieste › Richieste in attesa (`GET
  /admin/problem-match/waiting-requests`, MODERATION): "Chi cercare" per
  mestiere e provincia, "Copia annuncio" anonimo (solo mestiere, zona e numero,
  mai dati del cliente), schede In attesa / Arrivate / Chiuse e "Di prima" per
  le vecchie richieste di "Ce ne occupiamo noi". Mai i contatti del cliente
  (CLAUDE.md §5 punto 9).
- Privacy, punto (f): la richiesta resta aperta 60 giorni e va a chi si
  iscrive; il personale può leggerla per capire quali mestieri mancano.

**Corretto durante la prova**: "antenna" contava come "ante" (falegname) e
faceva comparire la domanda sulle porte: "ante " ora vale solo come parola
intera.

**Verifica**: prove dell'API (`waiting-trade.test.ts`), di `packages/shared`
(`waitingTrade.test.ts`, `problemMatch.test.ts`), typecheck e lint; prova nel
browser `e2e/tests/richiesta-in-attesa.spec.ts` da telefono e computer
(ricerca, modulo senza "Oggi", riepilogo, invio salvato in attesa, admin).
Migrazione `20261117120000_richieste_in_attesa` solo additiva.
