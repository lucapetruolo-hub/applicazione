# Banco di prova: conta anche le prestazioni indicate da Claude Haiku

**Richiesta** (Luca, 13/11/2026, thread "Far conoscere all'IA tutti i servizi del sito"): "sì, valuta come fossi il massimo esperto su come procedere al meglio", in risposta a due proposte: misurare se le prestazioni di Haiku sono giuste e, solo se restano errori, mostrare «In cima chi fa …» unicamente quando la prestazione è sicura.

**Decisione**:
- `apps/api/scripts/banco-ia.mjs` salva la prestazione di ogni risposta e, con `--prestazioni=<file>`, la confronta con quella scritta a mano: giuste, sbagliate, mancate e date quando nessuna va bene. Con `-` al posto dell'elenco delle frasi prova quelle del file delle prestazioni (le 100 di `packages/shared/test-data/banco-prestazioni.csv`, con le frasi in `banco-problemi.csv`).
- La regola «In cima chi fa … solo se sicura» (IA e dizionario d'accordo, risposta del dizionario o parole della prestazione nella frase) **non si fa**. Provata sulle risposte vere, avrebbe nascosto 1 sola prestazione sbagliata su 10 e anche 1 giusta. Gli errori del dizionario passano comunque, e le parole in comune sono troppo generiche ("cucina", "porta", "cancello").
- Le frasi del banco non si usano per insegnare parole o esempi (regola già scritta in `problemServiceWords.test.ts`). Servono solo a misurare.

**Risultato** (sito vero, Claude Haiku, 13/11/2026, 100 frasi):

| | Numero |
|---|---|
| Prestazione giusta, dove ce n'è una adatta | 56 su 75 (75%) |
| Prestazione sbagliata | 5 (1 discutibile: "Riparazione porta o finestra" per una porta che non chiude) |
| Nessuna prestazione, dove ce n'era una | 14 |
| Prestazione data quando nessuna va bene | 5 su 25 |

Delle 10 risposte sbagliate, 7 vengono dall'IA e 3 dal dizionario.

**Verifica**: lo script, lanciato sulle 100 frasi, ridà gli stessi numeri.

## Seconda parte: istruzioni corrette su frasi diverse da quelle di prova

**Richiesta** (Luca, 13/11/2026): "sì alla numero 1, è sempre meglio aumentare la percentuale di giustezza, per quanto possibile".

**Decisione**:
- Abbiamo preparato 100 frasi nuove per correggere. Vengono dal mucchio "lavoro" delle frasi etichettate, quello che si usa per correggere; il mucchio "chiuso" serve solo a misurare. La prestazione di ognuna è scritta a mano in `analisi/abbinamento-problema/misura-ia/prestazioni-allenamento.csv`, nella cartella del progetto, perché sono frasi prese da forum.
- Prima della correzione, su queste frasi Haiku dava 42 prestazioni giuste su 62, 7 sbagliate, e 9 date su 38 frasi senza una prestazione adatta.
- Dagli errori abbiamo ricavato regole generali, senza citare le frasi: riparare non è installare; una parola in comune non basta, la prestazione deve riguardare lo stesso oggetto e lo stesso materiale (gas e acqua, filtro dello scaldabagno e del condizionatore, PVC e legno, tende da interno e tende da sole); una domanda su come predisporre o regolare qualcosa non è una riparazione.
- La modifica resta solo se, sulle 100 frasi di prova, le prestazioni giuste non scendono e quelle sbagliate non salgono.
