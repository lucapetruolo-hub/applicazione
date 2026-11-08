# Controllo pre-lancio dell'8/11, gruppo 7: uso del sito per clienti e professionisti

**Richiesta di Luca (08/11/2026)**: «sì a tutto quello che ritieni, tranne per
le funzioni nuove la n.12», sul riepilogo del controllo completo prima del
lancio (`collaudo/2026-11-08/riepilogo.md` nella cartella del progetto). Questo
è il gruppo 7: E6-04…E6-28 del rapporto `esperto-E6-ux.md`, più le migliorie
"sì" dello stesso tema. Restano ad altri gruppi: E6-10, E6-20, E6-21 (gruppo 1,
testi rotti) ed E6-14 (gruppo 8, accessibilità).

## Cosa cambia

**Cliente**
- E6-04: in home, mentre si scrive il problema, il suggerimento "Trova chi ti
  serve" sta nella pagina e spinge giù "Città" invece di coprirlo, sotto gli
  800 px (`listInFlowOnPhone` di `Autocomplete`).
- E6-05: profilo pubblico sotto i 360 px (o con il testo ingrandito): foto
  sopra e nome sotto a tutta larghezza (`.profile-identity` in `globals.css`).
- E6-06: nell'elenco delle chat l'ultima riga automatica si legge per chi la
  guarda ("Hai inviato la richiesta di preventivo.", "Hai annullato il
  lavoro."), come già dentro la chat. La funzione è passata in
  `packages/shared/src/timelineText.ts` e la usa anche l'API.
- E6-08: segnaposto vicini sulla mappa raggruppati in uno solo con il numero,
  secondo lo zoom; toccandolo si apre l'anteprima con le frecce per gli altri
  (`groupNearbyPins` in `ResultsMap.tsx`).
- E6-11: l'inoltro della richiesta diretta si spiega una volta sola, al passo
  3, con l'ora precisa ("Se non risponde entro le 18:05…"); tolta la frase dal
  passo 2 e "senza scadenza". Le funzioni dei tempi sono passate da
  `lead-routing.ts` a `packages/shared/src/requestForward.ts`;
  `formatClockDeadline` in `requestDeadline.ts`.
- E6-12: una sola frase sulla fattura: "Ti serve la fattura? La fa il
  professionista: spunta qui e gli passiamo nome, codice fiscale e
  indirizzo…"; tolta la riga "La ricevuta del pagamento non è la fattura".
- E6-15: sulla richiesta "Novità" (non "Nuovo"), e a scheda aperta solo "Da
  leggere" sul preventivo.
- E6-16: "Lascia una recensione" da Le mie recensioni apre subito la finestra
  (`?recensione=<id>`).
- E6-17: Le mie richieste e Richieste e lavori con 5 schede, le stesse parole
  per tutti e due (Tutte · Da rispondere · In attesa · Fissati · Terminati);
  Annullate, Chiuse e Archiviate nei Filtri ("Altre richieste"), e la scheda
  scelta lì compare nella riga finché è aperta. "Da rispondere" raccoglie anche
  le modifiche chieste.
- E6-18: la barra fissa "Richiedi un preventivo" sparisce prima che il
  pulsante grande entri nello schermo.
- E6-19: cuore "Salva" e "+N" dei bollini con un bersaglio del tocco di 44×44
  (area invisibile, niente si sposta).
- E6-25: /urgente con le tessere dei mestieri compatte sul telefono (tre per
  riga): restano tutte in vista (scelta di Luca), ma "Avanti" sale di molto.

**Professionista**
- E6-07: Statistiche con la stessa regola delle altre pagine: "Lavori
  terminati" ed "Entrate" contano i lavori segnati "Lavoro terminato" dal
  professionista (prima serviva anche la conferma del cliente, e le
  Statistiche dicevano 1 dove Oggi diceva 3); "Lavori fissati nel periodo" con
  la spiegazione che conta anche quelli poi terminati o annullati.
- E6-09: parole del glossario dappertutto (pagine, email, messaggi della chat,
  errori): "Da rispondere", "Appuntamento:", "ha annullato il lavoro",
  "Lavori terminati", "lavori fissati", "Dove si fa il lavoro", "Lavoro di
  nuovo fissato" al posto di "Prenotazione riaperta", ecc. Il controllo
  `apps/web/scripts/controlla-glossario.mjs` (in `pnpm lint`) ferma
  "intervento", "prenotazione", "Da quotare", "lavoro completato/ottenuto" nei
  testi nuovi. Unica eccezione: il prefisso salvato nel database delle
  segnalazioni del professionista (`glossario: ok`).
- E6-11: "Rispondi entro le 18:05: poi va anche ad altri, ma puoi rispondere
  lo stesso" al posto di "Rispondi entro 2 ore…".
- E6-22: modificando un preventivo già inviato il pulsante dice "Salva le
  modifiche", con la riga "Il cliente riceve il preventivo aggiornato".
- E6-23: durata oltre 5 giorni con un campo numerico al posto del menu di 25
  voci.
- E6-24: Notifiche: spazio tra "Singoli avvisi" e "tutti e N attivi" per il
  lettore di schermo; tolte le caselle "presto" dei canali che non funzionano;
  la scheda WhatsApp ("In arrivo") in fondo alla pagina.

## Non cambiato, e perché

- E6-13 (una casella del pagamento non spuntata): le caselle sono già
  `<input type="checkbox">` dentro la loro etichetta, tutta la riga si tocca;
  non riprodotto.
- E6-26 (email di supporto provvisoria): già nella checklist di lancio, si
  cambia con il dominio.
- E6-27 (dati del passo 2): la precompilazione da nome, cognome e telefono
  dell'account c'è già; resta vuota solo se l'account non li ha salvati.
- E6-28 (errore CORS su `/categories/popular`): l'API manda le intestazioni
  CORS anche sugli errori; quella risposta arriva dal proxy di Render durante
  un riavvio. Il 400 del telefono in chat è il blocco voluto.
- Parola "SMS" nel controllo automatico: non aggiunta, le scritte "SMS"
  restano finché WhatsApp non è acceso (decisione di Luca); la frase della
  home è del gruppo 1.

## Verifica

- `pnpm lint` (web e API), typecheck di web, API e ui, 1286 test dell'API, test
  di `packages/shared` (nuovi: frasi della chat per chi legge, ora
  dell'inoltro), build del sito: tutto verde.
- Home a 390 px con "si è rotto lo scaldabagno" scritto: "Città" resta
  visibile sotto il suggerimento e si tocca (prova con il browser).
