# Errore di rete in italiano: mai più "Failed to fetch"

**Richiesta** (Luca, 19/11/2026): "quando ho provato a registrarmi come
professionista, mi ha dato una volta errore "failed to fetch", dopo è andato".
Poi: "sì a tutte le correzioni e migliorie".

**Causa**: "Failed to fetch" è il messaggio inglese del browser quando la
chiamata all'API non arriva (rete o server irraggiungibile). Il client
(`packages/api-client/src/client.ts`) riprovava da solo solo le letture; per le
scritture rilanciava il `TypeError` del browser e circa 150 punti del sito
mostrano `err.message` così com'è. Probabile occasione: alle 14:30 era stata
unita la #426 (con migrazione) e l'API su Render è ripartita nei minuti della
registrazione (14:38). L'API è sul piano Starter, non si addormenta. I log di
Render non erano leggibili dal thread: l'orario è un indizio, non una prova.

**Decisione**:
- Nel client ogni `TypeError` di `fetch` (e della lettura della risposta)
  diventa `ApiError` con stato 0, codice `NETWORK` e la frase
  `NETWORK_ERROR_MESSAGE` ("Non riusciamo a collegarci al sito. Controlla la
  connessione e riprova: se il sito si sta aggiornando, bastano pochi
  secondi."). Un annullamento voluto (`AbortError`) resta com'è. Si sistemano
  insieme tutti i moduli del sito e dell'app.
- Pagamenti (acconto e saldo, abbonamento, pacchetti di visibilità): se la
  rete cade prima di aprire Stripe, la frase dice che nessun pagamento è
  partito (`PAYMENT_NETWORK_ERROR_MESSAGE`). Accettazione del preventivo: la
  risposta può essersi persa dopo l'accettazione, la frase dice che si
  ricontrolla (`ACCEPT_NETWORK_ERROR_MESSAGE`) e "Le mie richieste" si ricarica
  subito e dopo 3 secondi.
- Accesso, registrazione (professionista e cliente, anche dentro la richiesta)
  e Google: una riprova da sola dopo 2 secondi (`retryOnNetworkError`), poi la
  frase con il pulsante "Riprova" (`FormErrorNotice`). Registrazione con email
  e password (`apps/web/src/lib/registerDespiteNetwork.ts`): se il primo invio
  era arrivato e l'account c'è già, il secondo viene rifiutato (token anti-bot
  già usato o "Esiste già un account") e si entra con l'email e la password
  appena scritte, invece di mostrare un errore.
- Richiesta di preventivo (Luca, 19/11: "sì" alla miglioria): una riprova da
  sola dopo 2 secondi senza mai mandarla due volte
  (`apps/web/src/lib/sendRequestDespiteNetwork.ts`). Il server rifiutava già
  lo stesso testo per la stessa categoria entro 30 minuti; ora il rifiuto ha il
  codice `DUPLICATE_REQUEST_CODE`. Se arriva dopo una rete caduta vuol dire che
  il primo invio era arrivato: si mostra "Richiesta inviata" con i numeri presi
  da "Le mie richieste". Poi la frase con "Riprova".
- Invio del preventivo (Luca, 19/11: "sì"): una riprova da sola dopo 2
  secondi (`RequestCard.tsx`). Ripetere è sicuro: `createOrUpdate` aggiorna lo
  stesso preventivo, e uguale non avvisa il cliente; ora non scrive nemmeno
  "Il professionista ha modificato il preventivo" nella cronologia.
- Caricamenti diretti di foto e video (`apps/web/src/lib/mediaUpload.ts`):
  stessa frase di rete del resto del sito al posto di "Connessione interrotta".
- `AuthContext`: l'errore di rete nuovo non scollega (come prima il
  `TypeError`).
- Andamento del sito in Admin: gli invii non riusciti si contano anche per
  "Accesso" e "Apertura del pagamento" (nessuna migrazione: `form` è testo).
- Skill `deploy-ops`: dopo il lancio le PR con migrazione si uniscono fuori
  dagli orari di punta.

**Verifica**: prove del client (`packages/api-client/src/client.test.ts`:
registrazione, pagamento e accettazione senza rete, annullamento, riprova solo
per la rete); prova nel browser `e2e/tests/errore-di-rete.spec.ts` (accesso
senza rete con "Riprova", registrazione con la risposta persa che entra
nell'account creato, richiesta con la risposta persa salvata una volta sola; dopo la #432, preventivo con la risposta persa: uno solo, riprova partita, nessun avviso in più al cliente e nessuna riga "modificato" in chat);
prova del doppione col codice in `chosen-professionals.test.ts`; typecheck, lint, prove dell'andamento in Admin.

## Seguito: "Invia comunque" dopo l'avviso del doppione

**Richiesta** (Luca, con la foto dell'avviso "Hai già mandato questa richiesta
a … pochi minuti fa"): "Non dovrebbe lo stesso darmi la possibilità di
inviarla lo stesso dopo l'avviso?"

**Decisione**: dopo l'avviso il pulsante diventa "Invia comunque" e l'avviso
lo dice in una riga; premendolo il sito manda `sendAnyway: true` e il server
non blocca. La riprova da sola dopo una rete caduta non lo manda mai, così
resta impossibile creare due richieste per sbaglio. In più non è un doppione
una richiesta con lo stesso testo ma modalità, indirizzo, civico, data o
orario diversi: è un altro appuntamento.

**Motivo**: il blocco serve contro i doppi tocchi e le reti che saltano, non
contro chi vuole davvero rimandare la richiesta.

**Verifica**: `chosen-professionals.test.ts` ("Invia comunque" parte; indirizzo
o modalità diversi partono); `e2e/tests/errore-di-rete.spec.ts` (seconda
richiesta uguale: avviso, "Invia comunque", due richieste salvate; la
richiesta con la risposta persa resta una sola); typecheck e lint.
