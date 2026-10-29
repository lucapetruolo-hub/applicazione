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
- **Quarto giro** (Luca: "il giorno prima gli arrivano tutti gli
  appuntamenti del giorno successivo?", poi "si può scegliere l'ora?" e
  "aggiungiamo anche 21"):
  - al professionista non arriva più un messaggio per appuntamento 24 ore
    prima, ma **un solo riepilogo la sera prima**: "giovedì 5 novembre hai
    3 lavori, il primo alle 08:30 a Latina", con il pulsante dell'agenda.
    Un messaggio invece di tanti; al cliente resta il suo promemoria; le
    email non cambiano (una per appuntamento);
  - l'ora la sceglie il professionista in Notifiche, sotto l'interruttore:
    18, 19, 20 o 21 (preimpostate le 18; `User.whatsappDigestHour`,
    `POST /whatsapp/me/digest-hour`). Le 21 sono già ore di silenzio, ma il
    riepilogo parte lo stesso perché l'ora l'ha scelta lui. Un giro ogni
    mezz'ora dalle 18 alle 21:30, se il server dormiva; una sola volta per
    persona e giorno;
  - provato nell'agenda del professionista l'invito "Ricevi la sera prima
    il riepilogo dei lavori su WhatsApp" e tolto su richiesta di Luca: rompe
    la struttura dell'agenda già sistemata. Il professionista accende il
    riepilogo da Notifiche.
- **Quinto giro** (Luca: "si pagano per invii o per caratteri? Allora un
  riepilogo più dettagliato e curato"): Meta fa pagare a messaggio, non a
  caratteri, quindi il riepilogo elenca ogni lavoro su una riga: titolo in
  grassetto "I tuoi 3 lavori di giovedì 5 novembre", poi "• 08:30 ·
  Perdita sotto il lavandino · Latina" (ora, prima riga della descrizione
  senza contatti né vie, altrimenti il mestiere, e il comune o "online"),
  "Buon lavoro!". Quattro modelli (1, 2, 3, 4 o più con "e altri N"), stesso
  costo di prima. Mai nome o via del cliente: restano nell'agenda.
- **Sesto giro** (Luca): provata l'apertura "Buonasera, Professionisti ti
  ricorda gli appuntamenti per domani, *MARTEDÌ 13 OTTOBRE*" con elenco
  numerato; Luca ha preferito la versione di prima con solo l'ora in
  grassetto: "*I tuoi 3 lavori di giovedì 5 novembre*", "• *08:30* ·
  Perdita sotto il lavandino · Latina". Il riepilogo scade a mezzanotte:
  rimasto indietro, non parte il giorno stesso dei lavori.
- **Settimo giro** (Luca, 29/10: "sì entrambe", poi "il promemoria qualche
  ora prima che entri nelle 24 ore"):
  - promemoria al cliente con "*Promemoria: giovedì 5 novembre alle
    10:30*" in grassetto, poche righe e i pulsanti "Ci sarò" e "Non posso
    più" (oltre ad "Apri la richiesta" e "Non ricevere più"): i pulsanti non
    costano, si paga sempre un messaggio;
  - la risposta arriva dal webhook come risposta al nostro promemoria
    (`context.id`), vale solo dal numero a cui era partito e per un lavoro
    ancora da fare. "Ci sarò" va nella cronologia della richiesta e nella
    campanella del professionista (`BOOKING_CLIENT_CONFIRMED`, solo sito);
    "Non posso più" anche per email (`BOOKING_CLIENT_CANT_COME`) e non
    annulla nulla da sé, perché c'è di mezzo l'acconto: al cliente torna il
    link per annullare o cambiare data e, se vale ancora, fino a quando
    riavrebbe l'acconto. Una volta sola per lavoro
    (`Booking.clientConfirmedAt`/`clientCantComeAt`). La risposta al cliente è
    testo libero, gratuito entro 24 ore, nel registro come `BOOKING_REPLY`
    e fuori dai tetti (`BookingRepliesService`);
  - con un acconto pagato online che resta al professionista se si annulla
    dentro il preavviso (`Quote.lateCancelKeepsDeposit`) il promemoria
    parte 6 ore prima che il preavviso inizi, mai tra le 21 e le 8 (allora
    alle 20 della sera prima), con il giorno e l'ora entro cui annullare
    (modello `promemoria_appuntamento_acconto`, `depositReminders`). Con 24
    ore di preavviso sostituisce quello del giorno prima; con 48 o 72 ore
    parte anche quello, perché tre giorni prima è presto per ricordarsene.
    Senza acconto nulla cambia;
  - nella richiesta completa del professionista (Richieste, scheda del
    lavoro) una riga con la risposta del cliente, l'ultima se ha cambiato
    idea: "Il cliente ha confermato che ci sarà" con la spunta, o "Il
    cliente ha risposto al promemoria che non può più esserci: scrivigli in
    chat" in rosso (Luca, 29/10);
  - "Ho sbagliato" (Luca, 29/10: "può essere che il cliente abbia sbagliato
    a premere"): la risposta del sito a "Ci sarò" o "Non posso più" ha un
    pulsante "Ho sbagliato" (messaggio con pulsante, gratuito come la
    risposta). Dopo "Ci sarò" toglie la conferma; dopo "Non posso più" dice
    al professionista, anche per email, che il cliente ci sarà
    (`BOOKING_CLIENT_CANT_COME_UNDONE`). Vale solo sotto quella risposta;
    anche premere l'altro pulsante del promemoria corregge, perché conta
    l'ultima risposta.
- Ottavo giro (Luca, 29/10: "Effettua le 4 migliorie", scelte tra quelle di
  un esperto di promemoria; non scelti il secondo promemoria 2 ore prima e
  la lista d'attesa):
  - **email del giorno prima con "Ci sarò" e "Non posso più"**: l'email
    arriva a tutti, WhatsApp solo a chi lo accende. I pulsanti aprono
    `/promemoria/<link firmato>` (`booking-reply-token.ts`, chiave legata a
    `JWT_SECRET`), che registra la risposta solo con un tocco, mai aprendo
    il link (gli antivirus della posta aprono i link da soli), con "Ho
    sbagliato". Stessa logica di WhatsApp (`BookingRepliesService`, canale
    in `Booking.clientReplyChannel`). Con l'acconto in gioco anche l'email
    parte 6 ore prima del preavviso, con la scadenza per annullare
    (`sendDepositReminders`, `Booking.clientDepositReminderAt`), e quella
    del giorno prima non riparte se è uscita da meno di 18 ore;
  - **"Non posso più" apre "Proponi un'altra data"**: spostare un
    appuntamento già fissato prima non esisteva (solo chat o annullare). Il
    cliente sceglie un orario libero dell'agenda o una data a mano;
    il professionista accetta e l'appuntamento si sposta con acconto e
    pagamento com'erano, oppure rifiuta e resta com'era. Spostato
    l'appuntamento, i promemoria della data vecchia non valgono più (anche
    i pulsanti premuti dopo) e ripartono per la nuova
    (`forgetBookingReminders`). Il link di WhatsApp e della pagina del
    promemoria porta a `&cambiaData=1`;
  - **il professionista vede il promemoria**: nella scheda del lavoro
    "Promemoria WhatsApp letto (data): il cliente non ha ancora risposto",
    o consegnato, inviato, mandato per email (`clientReminder`,
    `AppointmentReplyStatus.tsx`);
  - **numeri in Admin → WhatsApp**: quanti confermano, quanti dicono "Non
    posso più", quanti non rispondono, da WhatsApp o dall'email, e lavori
    saltati tra chi aveva confermato e chi no (`reminderEffect`).

- Nono giro (Luca, 29/10: "La proposta della nuova data deve passare per
  le modifiche standard che già ci sono nelle richieste non creiamo altre
  strade, rendiamo il lavoro semplice e snello nelle procedure"): tolta la
  strada separata dell'ottavo giro (indirizzi `/bookings/:id/reschedule`,
  `BookingRescheduleService`, il pannello del cliente, le notifiche
  `BOOKING_RESCHEDULE_*` e tre colonne del lavoro, migrazione
  `20261029150000_spostamento_sul_preventivo`). Ora l'altra data per un
  appuntamento fissato passa dalla stessa "Proponi un'altra data" dei
  preventivi: stessa scelta della data per il cliente
  (`QuoteDateChooser.tsx`, preso da `QuoteCard`), stessi indirizzi
  (`POST /quotes/:id/propose-date`, `confirm-proposed-date`, `reject-proposed-date`), la
  proposta sta sul preventivo (`clientProposedDate`), stesse notifiche
  `QUOTE_DATE_PROPOSED`/`CONFIRMED`/`REJECTED` (con `booked: true` il
  testo dice che si sposta l'appuntamento), stesso riquadro "Il cliente ha
  richiesto una modifica" e pulsanti "Accetta nuova data" / "Rifiuta la
  proposta" per il professionista. Il preventivo resta accettato
  (cambiarlo di stato avrebbe toccato pagamenti, documenti e recensioni);
  sul lavoro resta solo `rescheduleRequestedAt`, che dice che la proposta
  riguarda l'appuntamento fissato (i preventivi accettati di prima possono
  avere ancora una vecchia `clientProposedDate`). Accettando si
  ricontrolla che la fascia nuova sia libera, come per ogni data proposta.
- Decimo giro (Luca, 29/10: "Effettua le 3 migliorie"):
  - **Agenda**: la data proposta compare "In attesa" (tratteggiata, come i
    preventivi) nella griglia, nei puntini del mese e nell'elenco, con chi
    deve rispondere;
  - **promemoria dopo 12 ore** senza risposta, uno solo, a chi deve
    rispondere, mai tra le 21 e le 8 (`DateChangeRemindersService`,
    `Booking.rescheduleReminderAt`, stesse notifiche con `reminder: true`);
  - **"Modifica" del professionista anche sull'appuntamento fissato**,
    come nella trattativa del preventivo: propone un'altra data e il
    cliente risponde con "Accetta nuova data", "Proponi un'altra data" o
    "Rifiuta" (`BookedDateChangeAnswer.tsx`), dagli stessi indirizzi
    `confirm-proposed-date` e `reject-proposed-date` (ora anche per il
    cliente, solo quando tocca a lui). Chi ha proposto la data sta in
    `Booking.rescheduleProposedBy`; al professionista le risposte del
    cliente arrivano come `QUOTE_DATE_CONFIRMED_BY_CLIENT` e
    `QUOTE_DATE_REJECTED_BY_CLIENT` (le notifiche hanno una sola pagina per
    tipo, quelle di sempre portano alle richieste del cliente). Migrazione
    `20261029170000_spostamento_risposte`.

- Unione con la nuova pagina Notifiche (PR #186, 29/10): la scheda
  WhatsApp sta tra "Mentre sei sul sito" e "Cosa ti avvisiamo". Una sola
  ora della sera per sito, email e WhatsApp (decisione di Luca): il
  riepilogo dei lavori su WhatsApp usa `notificationPrefs.digestHour`
  (`notificationDigestHour`, di serie le 19 invece delle 18), la tendina
  dell'ora nella scheda WhatsApp è tolta con il suo indirizzo
  (`POST /whatsapp/me/digest-hour`), e la migrazione
  `20261029190000_una_sola_ora_della_sera` copia l'ora scelta prima per
  WhatsApp nelle preferenze, se lì non ce n'era una. Le risposte del cliente
  al promemoria stanno nell'avviso "Appuntamenti".

Modelli da far approvare a Meta: `docs/whatsapp-modelli.md`.

## Verifica

- `apps/api/src/whatsapp/*.test.ts`: 44 prove (ore di silenzio con ora
  solare e legale, cellulare/fisso, STOP, ordine degli stati, firma,
  lettura del webhook, invio alla Cloud API, regole dei modelli, una sola
  volta per evento, motivi di chi non parte, tetti, nuovi tentativi, codice
  giusto/sbagliato/scaduto/troppi).
- Tutte le prove dell'API verdi, typecheck e lint di API e sito.
- Ottavo giro: prove del link firmato, delle risposte dall'email,
  dell'email dell'acconto (ora, una volta sola, niente doppione il giorno
  prima), dei promemoria dimenticati dopo lo spostamento e dei numeri
  delle risposte. Pagina del promemoria controllata a schermo sul telefono
  nei quattro stati.
- Nono giro: `apps/api/src/quotes/booked-date-change.test.ts` (proposta
  sull'appuntamento fissato, stessa data rifiutata, appuntamento annullato,
  accetta con promemoria e risposte da capo, fascia piena, rifiuta, niente
  da accettare senza proposta).
- Decimo giro: "Modifica" del professionista accettata o rifiutata dal
  cliente, nessuno accetta la propria proposta, promemoria dopo 12 ore a
  chi tocca, una volta sola e mai di notte
  (`date-change-reminders.service.test.ts`). 1004 prove dell'API verdi.
- Scheda WhatsApp di Notifiche controllata a schermo, su computer e
  telefono, nei cinque stati (spento, da attivare, codice mandato, attivo,
  numero fisso).
