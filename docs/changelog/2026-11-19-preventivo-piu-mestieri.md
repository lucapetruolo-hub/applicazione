# Mandare la richiesta a tutti i mestieri proposti

**Richiesta** (Luca, 19/11/2026): "Quando clicco su chiedi preventivo a tutti
dopo aver fatto una ricerca in cui l'IA dice che possono farla due categorie,
la manda ad una sola categoria e non a tutti, possiamo fargli scegliere se
mandarla a tutti entrambi o tutti di una categoria?". Proposta con le anteprime,
Luca ha scelto "Sì, con le migliorie".

**Prima**: "Chiedi preventivo a tutti" nella banda del problema
(`ProblemBand.tsx`) portava nel modulo solo il mestiere dei risultati
(`categoria=`). L'altro mestiere restava nel modulo come "Può servire anche:
+ Idraulico", poco visibile.

**Decisione**:
- Quando i mestieri proposti con qualcuno vicino sono più di uno, al posto del
  pulsante unico c'è "A chi mandiamo la richiesta?" con due pulsanti su due
  righe, ognuno con quanti professionisti raggiunge (`TradesRequestChoice`).
- Finché il cliente non sceglie un mestiere (né tocca un pulsante in alto né
  risponde alla domanda) il pulsante pieno è "a tutti i mestieri": non sappiamo
  quale serve. Sotto: "Non sei sicuro? Mandala a tutti e due…". Dopo una
  scelta il pieno è "Solo agli idraulici" e l'altro "Anche agli elettricisti":
  si rispetta la scelta del cliente, e gli altri mestieri non si aggiungono mai
  da soli (decisione del 09/11, `2026-11-09-mestieri-proposti-pulsanti.md`).
- Etichetta "A elettricisti e idraulici" solo se corta e senza una "e" nei nomi;
  altrimenti "A tutti e due i mestieri" / "A tutti e tre i mestieri"
  (`TO_TRADE_PLURAL` e `tradePlural` in `lib/problemChoices.ts`).
- Un mestiere proposto senza nessuno vicino non entra in "a tutti": una riga
  dice "Per ora nessuno vicino per Muratore." (anche con il pulsante unico).
- Il modulo legge `altreCategorie` anche fuori dalla richiesta ai scelti (mai
  con un professionista solo): "Chi ti serve" mostra i due mestieri, il secondo
  con la X, e "Partono 2 richieste, una per mestiere." All'invio una richiesta
  per mestiere, come sempre (docs/CHANGELOG.md §259).
- Restano i pulsanti dei mestieri in alto e l'elenco separato per mestiere.
- **Admin, Mestieri richiesti**: nuova scheda "Richieste mandate a più mestieri
  insieme" (ultimi 30 giorni, dal lancio, senza account di prova): preventivi
  dal primo mestiere e dagli altri, e in quante richieste hanno risposto solo
  gli altri (`multiTradeOutcomes`, per `submissionGroupId`). Dice se il
  pulsante porta preventivi in più o solo richieste in più ai professionisti.

**Verifica**:
- `typecheck` di sito e API, `lint` del sito verdi; prova `multi-trade-outcomes.test.ts`.
- Sito e API in locale con professionisti di prova a Rieti, ricerca "il
  condizionatore perde acqua" (idraulico e climatizzazione): i due pulsanti nei
  due stati, il link porta `altreCategorie=climatizzazione` e il modulo mostra
  i due mestieri. Foto in `anteprime/preventivo-piu-mestieri/` (file `sito-*`).
