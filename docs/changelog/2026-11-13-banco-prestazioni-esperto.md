# Banco delle prestazioni da esperto: 3 volte per frase, margini e pile separate

**Richiesta** (Luca, 13/11/2026): valutare la scelta della prestazione da parte
dell'IA come farebbe il massimo esperto di valutazione dei sistemi di ricerca,
senza aggiungere funzioni. Banco che non usa la memoria del sito, ogni frase 3
volte, precisione, copertura e "prestazione data quando non c'è" con il margine,
confronto prima/dopo frase per frase, per mestiere; le frasi di prova mai usate
per regole o esempi, e il banco deve impedirlo da solo.

**Decisione**:
- Nuovo `apps/api/scripts/banco-prestazioni.mjs` (`pnpm --filter @professionisti/api banco-prestazioni`):
  - chiede la prestazione 3 volte per frase e tiene quella data più spesso;
    dice anche in quante frasi la risposta non cambia;
  - sul sito vero la 2a e la 3a volta la frase finisce con " ." e " ..", così
    non risponde la memoria delle ultime 500 risposte;
  - con `--diretto` chiama Anthropic con lo stesso codice e le stesse istruzioni
    del sito (`apps/api/dist`) e il catalogo letto dal sito pubblico, senza
    memoria e senza scrivere nel database: è il modo per provare istruzioni
    nuove prima di pubblicarle (serve `ANTHROPIC_API_KEY` o `BANCO_ANTHROPIC_KEY`);
  - precisione, copertura, "data senza" e sbagliate su 100 frasi, ciascuna con
    il margine al 95% (ricampionamento, 2000 giri, seme fisso);
  - con `--prima=<giro precedente>` il test di McNemar frase per frase;
  - conti per mestiere, prima idraulico, elettricista, pulizie e falegname.
- Pile separate dal banco stesso:
  - `--pila=prova` usa solo `packages/shared/test-data/banco-prestazioni.csv` e
    stampa solo i numeri, mai frasi, motivi o elenco degli errori;
  - `--pila=allenamento` si ferma se trova anche una sola frase della pila di
    prova o del mucchio "chiuso";
  - test `apps/api/src/problem-match/banco-separato.test.ts`: i controlli si
    fermano se un pezzo di 5 parole di una frase di prova entra nelle istruzioni
    dell'IA. Con 4 parole scattava su pezzi comuni ("un odore di gas").

- **Prima correzione, nel codice e non nelle istruzioni**: se l'IA risponde
  "nessuna prestazione", resta nessuna. Prima la riempiva il dizionario
  (`combine()` in `problem-match.service.ts`), che per una parola in comune dava
  la prestazione sbagliata: "perdita di gas" → "Riparazione perdita d'acqua",
  "il citofono non suona" → "Installazione videocitofono". Nel banco di
  allenamento dopo la #348 (3 volte per frase) erano 8 errori su 15, il gruppo
  più grande; per questo le regole nuove della #348 non avevano cambiato niente
  (prova: 56/75 come prima, sbagliate 10 su 100 come prima, McNemar p = 1;
  allenamento: 41/62, 15 su 100, p = 0,73).

Motivo: con 75 frasi "56 su 75" vuol dire tra il 64% e l'85%; senza margini e
senza confronto frase per frase una differenza di 3-4 frasi non dice nulla. La
seconda prova sul sito dopo un deploy prendeva le risposte dalla memoria.

**Verifica**: rifatti i conti del giro del 13/11 (stessi numeri: 56/75, 5
sbagliate, 5/25; margine della copertura 64-85%); il banco di allenamento con un
id della pila di prova si ferma; test `banco-separato` verde; lint dell'API.
