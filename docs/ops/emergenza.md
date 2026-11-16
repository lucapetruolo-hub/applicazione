# Se cade il sito: cosa faccio

La pagina da aprire per prima, anche dal telefono. Rimanda alle guide di
dettaglio. Nata il 16/11/2026
(docs/changelog/2026-11-16-backup-e-piano-di-emergenza.md).

**Regola d'oro: prima rimettere in piedi, poi capire il perché.** Annotare
subito l'ora in cui te ne sei accorto: serve per il ripristino e per un
eventuale avviso al Garante.

## 1. Capire cosa è giù (2 minuti)

| Controllo | Se risponde bene | Se no |
|---|---|---|
| `https://professionisti-api-eu.onrender.com/health/db` | `{"status":"ok","database":"ok"}` | API o database giù: vai al punto 2 |
| Il sito (`https://applicazione-web.vercel.app`) | La home si apre | Sito giù: vai al punto 3 |
| https://status.render.com, https://www.vercel-status.com, https://status.stripe.com | Tutto verde | È un guasto loro: aspettare, avvisare (punto 6) |
| Sentry → Issues | Nessun errore nuovo | L'errore nuovo dice dove guardare |

## 2. API o database giù

1. Render → `professionisti-api-eu` → **Events**: l'ultimo deploy è rosso o è
   appena cambiato qualcosa? → **Rollback** al deploy di prima
   ([rollback.md](rollback.md), 1-2 minuti).
2. `/health` risponde ma `/health/db` no: è il database. Render →
   `professionisti-db-eu`: è sospeso, pieno o scaduto? Il piano deve essere
   **Basic o superiore**: il piano Free non ha backup e dopo 30 giorni si
   spegne (è successo il 05/11/2026).
3. Una variabile cambiata per sbaglio: Render → Environment, confrontare con
   [variabili.md](variabili.md) e con la copia nel gestore di password.
4. Carta di pagamento rifiutata: Render → Billing. Rimettere una carta valida.

## 3. Sito giù (Vercel)

Vercel → progetto → **Deployments** → l'ultimo che funzionava → **⋯ →
Instant Rollback** ([rollback.md](rollback.md), meno di un minuto). Se l'errore nasce da una
`NEXT_PUBLIC_*` cambiata, rimetterla com'era e fare **Redeploy**.

## 4. Dati cancellati o rovinati

Non toccare altro: [ripristino.md](ripristino.md). Si sceglie un istante
**prima** dell'errore e Render crea un database nuovo accanto al vecchio.
Poi Stripe → Events → **Resend** degli eventi arrivati dopo quell'istante.

## 5. Sospetto di intrusione o chiave finita in giro

Una chiave è finita in un messaggio, in un commit o in un file condiviso,
oppure vedi accessi o pagamenti strani.

1. **Cambiare subito la chiave toccata** sul servizio che l'ha emessa, poi
   incollare quella nuova su Render o Vercel (l'API riparte da sola, il sito
   vuole un Redeploy). Ordine se non sai quale è uscita: Stripe
   (`STRIPE_SECRET_KEY` e i segreti dei webhook), `JWT_SECRET` (fa uscire
   tutti: tutti rifanno l'accesso), Resend, Cloudinary, Google, Didit,
   Openapi, Anthropic, Turnstile.
2. **Mai cambiare `FISCAL_DATA_KEY`**: senza quella vecchia, IBAN e codici
   fiscali diventano illeggibili. Se è uscita, chiedere a un thread di
   cifrare di nuovo i dati con una chiave nuova, tenendo anche la vecchia.
3. Cambiare le password ed espellere le sessioni aperte su GitHub, Render,
   Vercel, Stripe e Gmail. Controllare che la verifica in due passaggi sia
   ancora accesa e che non ci siano nuovi utenti o chiavi che non conosci.
4. Admin del sito: `/admin/utenti`, togliere i ruoli che non riconosci;
   registro azioni per vedere cosa hanno fatto.
5. Annotare cosa è successo, quando e quali dati erano esposti: serve per il
   punto 6.

## 6. Chi avvisare

| Chi | Quando | Come |
|---|---|---|
| **Garante privacy** | Dati personali usciti, persi o modificati da chi non doveva, a meno che sia improbabile un rischio per le persone: **entro 72 ore** da quando te ne accorgi (art. 33 GDPR) | Modulo online su garanteprivacy.it ("Violazione dati personali"). Si può mandare incompleto e aggiungere il resto dopo |
| **Le persone colpite** | Se il rischio per loro è alto, per esempio IBAN, codici fiscali o password usciti (art. 34 GDPR) | Email a ciascuno: cosa è successo, cosa rischiano, cosa devono fare |
| Clienti e professionisti | Sito fermo più di un'ora | Avviso sulla home e, se serve, email |
| Stripe | Pagamenti strani o chiave Stripe uscita | Stripe → Support |
| Avvocato | Ogni caso del punto 5 | Il prima possibile, prima di scrivere alle persone |

Anche quando non si avvisa il Garante, ogni violazione va scritta nel
**registro delle violazioni** (art. 33.5 GDPR): data, cosa è successo, dati
toccati, cosa si è fatto. Va tenuto fuori dal repo, che è pubblico: per
esempio un foglio nella cartella del progetto.

## 7. Dopo

- Scrivere in tre righe cosa è successo e perché, e cosa si cambia perché non
  ricapiti (una voce in `docs/changelog/`).
- Se si è fatto un ripristino: controllare la quadratura in Admin → Finanza.
- Correggere questa pagina dove i passi non tornavano.

## Le copie di sicurezza (dove stanno)

| Cosa | Dove | Per quanto |
|---|---|---|
| Database | Render, backup automatici e ripristino a un istante (solo piano Basic o superiore) | Ripristino a un istante: 3 giorni sul workspace Hobby, 7 su Professional. Backup scaricabili: 7 giorni |
| Database, copia esterna | Da preparare (proposta: una copia cifrata a settimana in UE, fuori da Render) | 30 giorni, poi si cancella da sola |
| Codice | GitHub, più la copia sul Mac | Sempre |
| Chiavi e variabili | Gestore di password di Luca ([protezione-account.md](protezione-account.md)) | Sempre |
| Pagamenti, email, verifiche | Restano da Stripe, Resend e Didit | Secondo i loro contratti |

La Privacy (punto 5) dice che i dati cancellati restano nelle copie di
sicurezza fino a 30 giorni: una copia nuova non può durare di più senza
cambiare anche la Privacy.
