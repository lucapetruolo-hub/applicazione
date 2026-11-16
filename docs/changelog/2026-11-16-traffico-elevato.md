# 16/11/2026 — Sito pronto a traffico molto elevato

**Richiesta di Luca.** Il 15/11 ha chiesto se il sito regge tanto traffico: con la prova di carico in locale la
risposta era no (resoconto in `analisi/carico-e-traffico.md` nei file del progetto). Il 16/11: "Effettua tutte
le Migliorie, dobbiamo essere pronti già ad un traffico molto elevato".

**Cosa non andava.** L'API reggeva circa 3 pagine al secondo. Con qualche migliaio di professionisti si spegneva
per memoria esaurita già a 2 visite al secondo. I motivi:
- la home scaricava tutti i professionisti d'Italia, con l'agenda;
- la ricerca caricava ogni lavoro con la sua recensione per contare le stelle;
- con un po' di traffico, il limite di 60 chiamate al minuto per indirizzo bloccava le pagine fatte da Vercel.

**Decisioni** (le otto correzioni del resoconto):
1. **Home e sitemap leggere.** `GET /professionals/newest` (i 21 più recenti, senza agenda) e
   `GET /professionals/directory` (solo id e data per la sitemap). La ricerca senza mestiere, città, parola o
   problema restituisce al massimo 100 profili, i più recenti. Con un filtro, l'agenda si calcola solo per i
   100 mostrati (`SEARCH_MAX_RESULTS`).
2. **Stelle contate dal database** (`apps/api/src/professionals/review-stats.ts`). Le regole restano quelle di
   sempre: recensioni non nascoste e media a un decimale. La pagina della città usa
   `/professionals/category-counts?city=` invece della ricerca completa.
3. **Chiave tra sito e API** (`SITE_SERVER_KEY`, intestazione `X-Site-Key`, `apps/api/src/common/client-ip.ts`).
   Le chiamate fatte dal server di Vercel con la chiave giusta non contano nel limite al minuto. I visitatori
   restano limitati come prima, e così i telefoni e chi chiama l'API direttamente. La chiave ha almeno 32
   caratteri ed è confrontata a tempo costante. Senza chiave tutto funziona come oggi.
4. **Indici sulle 23 colonne di collegamento** che non ne avevano (migrazione solo additiva
   `20261116095522_indici_colonne_collegamento`).
5. **Foto e video fino a 50 MB sul disco temporaneo** invece che nella memoria dell'API
   (`apps/api/src/common/media-upload.ts`). Da lì vanno a Cloudinary in streaming e il file si cancella a fine
   richiesta, anche se c'è un errore. Il caricamento firmato direttamente dal browser a Cloudinary resta
   possibile più avanti; per la memoria non serve più.
6. **Un minuto di memoria breve** (`apps/api/src/common/short-cache.ts`) per i numeri di riepilogo pubblici:
   numeri della home, prezzi medi, lavori più cercati, conteggi per mestiere, lingue, frasi d'esempio. Non
   contiene profili, quindi la regola "un profilo eliminato non resta visibile in ricerca" non cambia. Più
   richieste uguali nello stesso momento fanno una sola query.
7. **API pronta a più copie.** Prima tre cose vivevano nella memoria di una sola copia. Ora stanno nel database
   (migrazione `20261116100058_tetti_e_tempo_reale_condivisi`):
   - i tetti giornalieri di Google e dell'IA (`daily_budget_usage`, con aumento atomico che non supera mai il
     tetto). Se il database non risponde, la chiamata a pagamento non parte;
   - il tetto di 10 foto al giorno per indirizzo, conservato come impronta e non come indirizzo;
   - i biglietti del tempo reale (`realtime_tickets`, conservati come impronta, monouso con `DELETE … RETURNING`);
   - gli eventi del tempo reale (`realtime_events`): ogni copia li manda subito ai suoi utenti e li scrive nella
     tabella; le altre copie la leggono ogni secondo e la ripuliscono dopo 5 minuti. Si è scelta la tabella
     invece di LISTEN/NOTIFY perché LISTEN tiene una connessione fissa fuori dal pool di Prisma.

   Redis non serve.
8. **Connessioni**: se `DATABASE_URL` non le indica, 10 per copia e attesa massima 20 secondi
   (`withPoolDefaults` in `packages/database/src/index.ts`). Avviso a Sentry (`opsAlert`) quando i tetti
   dell'IA arrivano all'80%.

**Verifica.**
- `pnpm lint`, `pnpm typecheck` e `pnpm test` verdi. Test nuovi per conteggio stelle, chiave del sito, memoria
  breve, tetti condivisi, biglietti, eventi tra copie e connessioni.
- Prova di carico in locale con k6, API su 1 core e 400 MB come in produzione, nessun servizio vero:
  - **200 professionisti**: da 3 a circa **73 pagine/s**; a 60 pagine/s il p95 è 40 ms, senza errori;
  - **3.000 professionisti**: prima crash di memoria a 2/s, ora nessun crash (memoria ferma a circa 420 MB) e
    circa 25 pagine/s.

**Da fare a mano** (`docs/ops/avvisi.md`, "Traffico elevato"):
- `SITE_SERVER_KEY` su Render e Vercel, poi Redeploy;
- API su Standard e database su Basic-1gb prima del 5/12.

**Prossimo passo.** Risultati a pagine numerate da 20, con filtri e mappa calcolati sul server e tutti i
puntini sulla mappa (scelta di Luca del 16/11), in una PR a parte. Oggi la parte più pesante è l'agenda di 63
giorni dentro ogni scheda della ricerca: circa 22 KB a scheda.
