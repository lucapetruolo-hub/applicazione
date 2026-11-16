# 16/11/2026 — Ricerca più leggera: scheda intera solo per i professionisti mostrati

**Richiesta di Luca.** Dopo l'unione delle pagine da 20 (`2026-11-16-pagine-da-20.md`), sì
alle due migliorie proposte: "far ordinare i trovati al database invece che all'API" e "far
leggere al database, per i puntini, solo i campi che servono".

**Prima.** Ogni ricerca leggeva dal database la scheda intera di tutti i trovati: tutte le
colonne del profilo, le prestazioni con i prezzi, i pacchetti di visibilità, i dati fiscali.
Poi ne mostrava 20, o solo i puntini. Con 250 professionisti in una città la lettura costava
circa 57 ms, di cui 25 solo per le prestazioni.

**Decisioni.**
1. **Riga leggera per tutti i trovati** (`SEARCH_ROW_SELECT`, tipo `SearchRow` in
   `apps/api/src/professionals/professionals.service.ts`). Per ordinare, filtrare, fare il
   riassunto "in breve" e disegnare i puntini si leggono solo i campi che servono: nome,
   città, coordinate, foto, mestieri, verifica, lingue, assicurazione, pagamenti online,
   specializzazioni, pacchetto di visibilità attivo, restrizioni in corso.
2. **Prestazioni solo quando servono.** Si leggono per tutti solo cercando una prestazione
   o un problema, per trovare quella in evidenza. Le tre prestazioni di "in breve" si
   leggono a gruppi di 20 professionisti, nell'ordine della ricerca, e ci si ferma appena
   ne bastano tre (`firstServiceNames`).
3. **Scheda intera solo per le schede mostrate** (`searchDetails`): le 20 della pagina,
   oppure le 100 di `GET /professionals/search`. Si leggono con prezzi, indirizzo e tipo di
   professionista. Stelle, distanza e prestazione in evidenza vengono dalla riga leggera.
4. **L'ordine resta calcolato dall'API** sulla riga leggera, non nel database. Le stelle
   arrivano da una somma sulle recensioni e i criteri dipendono dalla ricerca (boost, merito,
   prestazione in evidenza, distanza). Spostarlo in SQL avrebbe voluto dire una query scritta
   a mano per ogni caso, per un guadagno di pochi millisecondi: il costo era nella lettura,
   non nell'ordinamento.
5. `docs/ops/avvisi.md`: in Vercel il pulsante della regola del Firewall si chiama "Add Rule"
   (segnalato da Luca).
6. **Piani di Render al lancio** (decisione di Luca): fino alla società, da gennaio, si resta
   sui piani gratuiti e il database Free si rifà quando scade. Database Basic-1gb e API
   Standard sono nella checklist di lancio (punto 4quater) e in `docs/ops/avvisi.md`.

**Verifica.**
- Prove in `apps/api/src/professionals/professionals.service.test.ts`:
  - la lettura di tutti i trovati usa la select ridotta, senza indirizzo né prezzi;
  - le prestazioni di tutti si leggono solo cercando un problema;
  - la scheda intera si legge solo per le 20 della pagina;
  - i puntini non la leggono mai.
- Risposte dell'API identiche a prima, agenda esclusa, su 10 ricerche: pagine, filtri,
  inquadratura della mappa, problema con merito, puntini e la ricerca vecchia.
- Tempi in locale, con 3.000 professionisti e un solo processore:
  - puntini di un mestiere in tutta Italia: da 88 a 43 ms;
  - pagina di tutti i mestieri a Latina: da 150 a 105 ms.
- Prova di carico (miscela con pagine e puntini) a 22 visite/s, stesso computer e stesso
  momento: p95 da 1,6 a 1,0 s, mediana da 22 a 14 ms, nessun errore.
