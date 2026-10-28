# Promemoria su WhatsApp con Meta (28/10/2026)

**Richiesta** (Luca): "procedi ed effettua tutte le migliorie, poi valuta
quali notifiche tenere accese su WhatsApp, teniamole al minimo, sicuramente
l'antinoshow". Prima, sempre il 28/10: "va bene solo Meta in attesa dei
dati della società" (WhatsApp con Meta diretto, Cloud API, niente Twilio né
SMS). Analisi dei costi in `/mnt/project-files/analisi/messaggi-sms-whatsapp/`.

## Decisione: quali messaggi su WhatsApp

Solo quelli in cui arrivare in tempo cambia qualcosa. Domanda usata per
ognuno: "cosa succede se arriva 4 ore dopo via email?".

| Messaggio | A chi | Perché sì |
|---|---|---|
| Promemoria il giorno prima | cliente e professionista | anti no-show, il motivo per cui esiste il canale |
| "Sto arrivando" | cliente | il cliente deve essere in casa adesso |
| Appuntamento annullato | chi non l'ha annullato | evita il viaggio a vuoto o l'attesa inutile |
| Codice del numero | chi accende i promemoria | serve a confermare che il numero è suo |

Restano su sito ed email: nuova richiesta, nuovo preventivo, data
confermata o proposta, chat, pagamenti, fatture, abbonamento. Nuova
richiesta al professionista era metà del costo stimato e il sito la
segnala già in tempo reale. Mai nulla di promozionale. I clienti dei
lavori esterni dell'agenda non ricevono nulla (domanda 70 per l'avvocato).

## Come funziona

- **Fornitore dietro un'interfaccia** (`apps/api/src/whatsapp/whatsapp-provider.ts`),
  oggi `MetaWhatsAppProvider` (Cloud API, `graph.facebook.com/v23.0`).
  Senza `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` su Render non
  parte nulla e non si scrive nulla; la scheda in Notifiche dice "In arrivo".
- **Numero confermato con un codice** su WhatsApp (modello di
  autenticazione, 6 cifre, 10 minuti, 5 tentativi, 1 minuto tra due invii,
  5 al giorno). Solo cellulari (`libphonenumber-js`): un fisso è rifiutato
  prima di spendere. Il numero vale finché non cambia: cambiato in
  Account, i promemoria si fermano fino al nuovo codice.
- **Consenso**: frase prima del pulsante "Mandami il codice" ("Inserendo
  il codice accetti di ricevere questi messaggi"); il codice giusto
  accende i promemoria e salva data e ora (`whatsappOptInAt`).
- **Spegnere**: interruttore in Notifiche, pulsante "Non ricevere più"
  sotto ogni messaggio, oppure "STOP"/"basta" scritto in risposta. I
  messaggi in attesa non partono più.
- **Ore di silenzio 21-8** (ora italiana): il promemoria aspetta le 8.
  Partono subito solo il codice, "sto arrivando" e un annullamento entro
  24 ore. Per questo il promemoria scrive il giorno per intero ("giovedì
  5 novembre alle 10:30"), mai "domani".
- **Tetti**: `WHATSAPP_DAILY_LIMIT` messaggi al giorno per il sito (500 se
  manca, con avviso su Sentry), 6 al giorno per persona (codici esclusi).
- **Registro** `outbound_messages`: un messaggio per evento (chiave unica,
  come un pagamento), esito dal webhook (partito, consegnato, letto, non
  consegnato), costo stimato dalla rate card di Meta (0,0248 € utility e
  autenticazione, variabili `WHATSAPP_PRICE_*_MICRO_EUR`), motivo di chi
  non parte. Il numero non si salva: si rilegge all'invio. I parametri del
  testo si cancellano dopo l'invio.
- **Errori**: numero senza WhatsApp o modello rifiutato non si riprovano;
  rete e limiti di Meta 3 volte a 10 minuti.
- **Webhook** `GET/POST /whatsapp/webhook`, firma `X-Hub-Signature-256`
  con `WHATSAPP_APP_SECRET` sul corpo così com'è arrivato.
- **Admin → WhatsApp** (`/admin/whatsapp`, area Finanza): costo del mese,
  consegnati, non consegnati, motivi, ultimi 50 messaggi e "Servono?":
  lavori saltati con e senza promemoria consegnato al cliente (90 giorni,
  dal lancio, senza account di prova).
- **Notifiche**: tolta la colonna "SMS" (mai partito nulla); WhatsApp ha
  una scheda sua con un interruttore solo.
- Le scritte "SMS" del sito ("Come funziona", Sicurezza) restano finché il
  canale non si accende (decisione di Luca del 28/10): all'accensione
  vanno cambiate in WhatsApp (checklist di lancio, punto 22).

- **Secondo giro** (Luca: "effettua le 2 migliorie"):
  - in Account, sotto il telefono, una riga dice che quel numero riceve i
    promemoria WhatsApp; cambiandolo, la riga avvisa che si fermano finché
    non si conferma quello nuovo in Notifiche;
  - sotto un appuntamento in arrivo del cliente il link "Ricevi il
    promemoria anche su WhatsApp", solo a canale acceso e promemoria
    spenti, che porta alla scheda WhatsApp di Notifiche (`#whatsapp`);
  - la terza proposta (promemoria ai clienti dei lavori esterni) aspetta la
    domanda 70 per l'avvocato: segnata nel punto 22 della checklist di
    lancio.
- **Terzo giro** (Luca: "scriviamo che è stato mandato il codice di
  conferma al numero, e se non è giusto un pulsante Modifica"):
  - mentre si aspetta il codice la scheda scrive "Abbiamo mandato su
    WhatsApp il codice di conferma di 6 cifre a" con il numero intero (prima
    era nascosto in parte), e sotto "Non è il tuo numero? Modifica";
  - "Modifica" anche accanto al numero prima di mandare il codice e a
    promemoria attivi, e "Cambia numero"/"Aggiungi il cellulare" per fisso o
    numero mancante: si scrive il numero nella scheda stessa, senza passare
    da Account, e il codice parte subito al nuovo;
  - un solo numero per persona, quello dell'account (il numero è unico tra
    gli account e lo vede l'altra parte dopo un appuntamento confermato,
    detto in piccolo sotto il campo). Niente secondo numero solo per
    WhatsApp: chi ne ha due sceglie quello su cui vuole tutto.

Modelli da far approvare a Meta: `docs/whatsapp-modelli.md`.

## Verifica

- `apps/api/src/whatsapp/*.test.ts`: 44 prove (ore di silenzio con ora
  solare e legale, cellulare/fisso, STOP, ordine degli stati, firma,
  lettura del webhook, invio alla Cloud API, regole dei modelli, una sola
  volta per evento, motivi di chi non parte, tetti, nuovi tentativi, codice
  giusto/sbagliato/scaduto/troppi).
- Tutte le prove dell'API verdi, typecheck e lint di API e sito.
- Scheda WhatsApp di Notifiche controllata a schermo, su computer e
  telefono, nei cinque stati (spento, da attivare, codice mandato, attivo,
  numero fisso).
