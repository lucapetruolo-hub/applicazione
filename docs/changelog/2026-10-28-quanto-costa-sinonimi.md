# "Quanto costa in media": sinonimi e account di prova

**Richiesta** (Luca, 28/10/2026, dopo il §398-§399): "effettua la prima
modifica" (i sinonimi) e, per il conteggio, "quando un account viene segnato
dalla sezione admin come prova non far comparire i dati degli account di
prova".

**Sinonimi.** La chiave unica delle prestazioni (`serviceGroupKey`,
`apps/api/src/professionals/service-group-key.ts`) ora passa dai nomi del
§392: prima le unioni fatte dall'admin ("Unisci a…") e le prestazioni
standard (§388), poi la tabella di `packages/shared/src/serviceNames.ts`.
"riparazione perdite", "Perdita acqua" e "Riparazione perdita d'acqua" sono
una sola voce, con il nome suggerito, nel "Quanto costa in media" della
home, nelle prestazioni delle pagine /prezzi e nella ricerca che si apre
cliccando una voce (stessa chiave ovunque, così l'elenco mostra sempre chi è
contato). Il profilo continua a mostrare il nome scritto dal professionista.
`ServiceNamesService` sta ora in un modulo suo (`ServiceNamesModule`) usato
sia dall'abbinamento del problema sia dai professionisti: una sola istanza,
così un'unione fatta dall'admin vale subito ovunque.

**Account di prova.** I loro prezzi non entrano nelle medie del "Quanto
costa in media" né nelle pagine /prezzi (prestazioni dichiarate e preventivi
accettati, sia del professionista sia del cliente), con `COUNTED_USER` del
§395. Restano nella ricerca come deciso nel §395. I passi del percorso
("Voce cliccata", "Profilo aperto", "Richiesta inviata") erano già a posto:
un browser che entra con un account di prova smette da solo di essere
contato e i conteggi partono dal lancio (§395).

**Verifica**: 864 test API (nuovi: sinonimi nella stessa voce, unione
dell'admin, ricerca con sinonimi, account di prova esclusi), typecheck e
lint di API e sito.

**Migliorie dopo (28/10/2026, "effettua le due migliorie").**
- Sinonimi allungati a tutte le prestazioni suggerite, mai con una parola che può voler dire due lavori diversi ("caldaia" da sola resta com'è). Un test controlla che ogni sinonimo porti a un nome suggerito.
- Prova simulata con 5 persone (`analisi/quanto-costa/prova-5-persone.md`, foto in `anteprime/quanto-costa-prova5/`). Ne sono uscite tre correzioni:
  - la casella di "Quanto costa" trovava solo il testo esatto: "perdite", "umidita", "imbiancatura" e "condizionatore" non davano nulla. Ora usa `serviceNameMatches` (plurali, accenti, sinonimi, parola non finita);
  - Invio nella casella apre la prima voce trovata;
  - quando non si trova nulla compare "Chiedi un preventivo gratuito" con la parola già scritta, invece di un vicolo cieco.

  La prova con persone vere resta da fare prima del lancio.
