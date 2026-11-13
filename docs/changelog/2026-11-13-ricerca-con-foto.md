# Ricerca del problema con una foto (13/11/2026)

**Richiesta** (Luca, thread "Stimare i costi della ricerca con foto"): stimare
e valutare la ricerca del problema tramite foto, poi farla "già tutto pronto
per il lancio". Stima e valutazione nella cartella del progetto
(`analisi/ricerca-foto/stima-costi.md`, `analisi/ricerca-foto-versione-profonda.md`).

**Decisione**:
- La foto è **facoltativa e si aggiunge al testo**: in home, sotto la ricerca,
  "Aggiungi una foto del problema" con la scritta "Facoltativa. Non fotografare
  persone o documenti." La foto parte solo con "Cerca".
- Il browser **rimpicciolisce la foto** (lato lungo 1280 px, JPEG): costa circa
  un terzo in token, si carica prima e perde i dati della posizione.
- `POST /problem-match/photo` (pubblica, 6 al minuto, stesso tetto giornaliero
  dell'IA) manda foto e testo **solo ad Anthropic** (Claude Haiku 5.5, mai
  OpenRouter), con le stesse istruzioni in cache della ricerca a testo e le
  regole della foto nel messaggio. Il tipo del file si controlla dai primi
  byte (JPEG, PNG, WebP). **La foto non si salva**: resta in memoria solo il
  risultato, con un id, per mezz'ora. `/cerca?problema=…&foto=<id>` lo
  riprende (anche cambiando mestiere); un id scaduto torna alla ricerca a testo.
- Nella stessa chiamata l'IA controlla la foto: "ok"; "dati-personali"
  (persone, documenti, numeri, targhe: i risultati arrivano ma la foto non si
  allega alla richiesta, CLAUDE.md §5 punto 9); "non-pertinente" o
  "non-adatta" (si chiede di scrivere il problema). Un pericolo visto nella
  foto (gas, fili scoperti, acqua vicino alla corrente, caldaia annerita) porta
  l'avviso di sicurezza; quello del dizionario sul testo resta prima.
- Senza testo, la descrizione della ricerca è la frase dell'IA su cosa si vede
  (massimo 8 parole, senza contatti).
- La foto resta **nel browser** (sessionStorage, mezz'ora) e "Chiedi un
  preventivo" la allega già alla richiesta se la descrizione è quella della
  ricerca, con "Abbiamo aggiunto la foto della tua ricerca: se non serve,
  toglila." Si carica su Cloudinary solo all'invio, come le altre foto.
- `problem_descriptions.withPhoto` segna le ricerche con foto (per contarle); i log
  dell'API scrivono i token di ogni foto, per confrontare il costo vero con la stima.
- **Spenta** finché `PHOTO_SEARCH_ENABLED` non è `true` su Render (serve anche
  `ANTHROPIC_API_KEY`): senza, niente pulsante e la rotta risponde 404. Si
  accende al lancio solo se il banco di prova con le foto supera la soglia
  (checklist di lancio, punto 44).
- Informativa privacy (punto 4) aggiornata.

**Perché**: chi non sa dare un nome alla cosa o è poco pratico a scrivere
fotografa più volentieri; la foto nella richiesta aiuta il professionista a
fare un preventivo più preciso. Costo stimato con Haiku 5.5: circa 0,1-0,15
centesimi di dollaro a ricerca con foto.

**Verifica**: test in `apps/api/src/problem-match/problem-photo.test.ts`
(interruttore, tipo del file, foto che non c'entra, dati personali, pericolo
visto, id scaduto, salvataggio con `withPhoto`). Percorso provato nel browser
con un'API finta: home con la foto, risultati con `foto=`, richiesta con la
foto già allegata (foto in `anteprime/ricerca-foto/` nella cartella del
progetto). Il banco di prova con foto vere da thread di forum si fa prima del
lancio, con le foto solo nella cartella del progetto (mai nel repository).

**Primo giro del banco di prova** (13/11, 124 foto, Haiku 5.5): sotto la
soglia. Testo + foto 90,99% (soglia 91%), solo foto 74% (soglia 80%), 10 su 10
entro 6 s, 2 pericoli del gas mancati con il testo. Correzioni alle istruzioni
della foto: "gas" comprende anche la fiammella che si spegne e i fuochi che non
si accendono; "non-pertinente" solo se nella foto non c'è niente di una casa;
crepe nei muri al muratore, legno al falegname, elettrodomestici anche se
perdono acqua. Esito e risposte nella cartella del progetto
(`analisi/ricerca-foto/esito-banco.md`). Si rifà il banco con
`apps/api/scripts/banco-foto.mjs`.

**Secondo giro** (13/11): testo + foto 92%, solo foto 84%, 10 su 10 entro
6 s, pericoli con testo 18/18; 8 prove su 237 fallite per un 503 o una
risposta rotta di Anthropic (`analisi/ricerca-foto/esito-banco-2.md`). Ora la
domanda all'IA si rifà una volta se resta tempo nell'attesa di 8 secondi, e
documenti, targhe e numeri di telefono sono "dati-personali" anche senza
niente di una casa. Con la sola foto restano 7 pericoli non segnalati,
quasi tutti invisibili nella foto: lo dicono i giudici.

**Pericoli con la sola foto** (decisione di Luca del 13/11): per la soglia
contano solo i pericoli che si vedono nella foto (colonna `pericolo_visibile`
della chiave, da confermare coi giudici); quelli che si capiscono solo dal
testo, come la fiammella che si spegne, contano nella prova testo + foto.

**Terzo giro** (13/11, `analisi/ricerca-foto/esito-banco-3.md`): solo foto
83%, 99% entro 6 s, dati personali riconosciuti; testo + foto 86% per 7
risposte mancate di Anthropic (503 di fila), 90,6% senza quelle. Ora il
secondo tentativo aspetta 0,8 s dopo un errore di Anthropic, il log dice il
motivo di una risposta senza dati e la risposta può essere più lunga (1536
token). Se l'IA non risponde e il cliente ha scritto qualcosa, la home cerca
con le parole senza mostrare errori.
