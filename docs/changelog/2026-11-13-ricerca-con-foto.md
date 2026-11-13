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
