# Passaparola: "Porta un collega", link dei partner, bollino con le stelle, promemoria della recensione

**Richiesta**: Luca ha fatto provare la skill `referrals` (thread "Provare la
skill degli inviti", 09/11/2026) e ha scelto le migliorie da fare: "si tutti
i punti applicati a noi tranne la 5 e 6, per il punto 1 porta un collega
senza dargli benefici". Restano fuori l'email del giorno del lancio a tutti
i professionisti (5) e l'email dopo 7 giorni a chi non usa il link (6).
Seguito di `2026-11-08-canale-del-professionista.md`.

**Decisioni**:
- **"Porta un collega", senza premi** (Luca: "ci sono già 3 mesi gratis").
  In "Il tuo link" un messaggio già pronto con `/per-professionisti?invito=<codice>`,
  lo stesso codice del link personale. Il messaggio non promette premi né
  l'offerta del momento, che può cambiare. Chi apre l'invito vede "Ti ha
  invitato X" (la skill: chi viene invitato deve vedere di chi si fida). Il
  codice resta nella scheda del browser (`invite_code`, sessionStorage,
  nella pagina Cookie) e va con la registrazione, anche con Google:
  `User.invitedByProfessionalId`. Il professionista vede quanti colleghi si
  sono iscritti, mai chi. Un codice sbagliato, di un profilo eliminato o di
  un partner tolto si ignora: l'iscrizione non si blocca mai per un invito.
- **Link dei partner** (punto 9: commercialisti e associazioni di
  artigiani): in Admin → Andamento → "Link dei partner" un super admin crea
  un link per partner (`InvitePartner`, codice di 7 caratteri, così non
  coincide mai con un link personale di 6) e vede quanti professionisti si
  iscrivono da lì. Nessuna commissione. "Togli" ferma il link per le
  iscrizioni nuove, gli iscritti di prima restano contati. Registro azioni
  per creazione e chiusura.
- **Da dove arrivano i professionisti** (Admin → Andamento): due voci nuove,
  "Invitati da un collega" e "Dal link di un partner". Un invito conta più
  della provenienza della visita.
- **Quante persone aprono il link**: la visita al profilo arrivata da
  `?link=1` conta anche in `ProfileViewDay.linkCount` (una volta per scheda
  del browser, come le visite; esclusi i robot, il titolare, gli admin e gli
  account di prova). In "Il tuo link": "In questo periodo 12 persone hanno
  aperto il tuo link. Da lì: 3 richieste…", dal giorno del lancio (CLAUDE.md §5
  punto 17). Contato dal browser e non da `/p/<codice>`, così l'anteprima
  dei link di WhatsApp non conta come una persona.
- **Bollino con le stelle per il sito del professionista**: `/p/<codice>/bollino.svg`,
  un'immagine con il voto medio di tutte le recensioni visibili (mai una
  selezione) e il loro numero, o "Chiedi un preventivo su …" finché non ce
  ne sono. Il codice da incollare è un'immagine dentro il link personale:
  nessuno script e nessun cookie sul sito del professionista. Il CDN di
  Vercel la tiene un'ora.
- **Indirizzo del sito nel PDF del preventivo**: "inviato tramite
  Professionisti (indirizzo del sito)". Un preventivo girato a un parente
  porta al sito.
- **Un solo promemoria della recensione** (`REVIEW_REMINDER`,
  `ReviewReminderService`, ogni giorno alle 11): a chi ha confermato da sé il
  lavoro terminato e non ha recensito, 3 giorni dopo, una volta sola
  (`Booking.reviewReminderSentAt`), al massimo entro 14 giorni. Uguale per
  tutti, senza guardare voti, chat o pagamenti (regole di Google e
  Trustpilot: niente richieste solo ai contenti) e senza premi. Esclusi: le
  segnalazioni aperte e i lavori chiusi d'ufficio, che hanno già avuto due
  promemoria e l'email di chiusura con la recensione. Argomento "Lavoro
  terminato" delle notifiche, nel riassunto della sera se acceso.
- **"Consiglialo a un amico"**: sotto "Recensione inviata", solo con 4 o 5
  stelle, il pulsante "Consiglia X" condivide il profilo del professionista
  (condivisione del telefono, o copia del link). Si consiglia la persona e
  non il sito: la gente si fida di chi ha lavorato bene. Si chiede dopo la
  recensione, mai prima, così la recensione resta libera.
- **Privacy** (punto 9): una frase sull'invito, l'unico dato legato alla
  persona (chi ti ha invitato), con il legittimo interesse e senza premi.

Migrazione `20261109160000_passaparola` (solo colonne e tabelle nuove).

**Verifica**: typecheck di API e sito, lint, 1413 prove dell'API (nuove:
aperture e colleghi in "Il tuo link", inviti di collega e partner, invito
alla registrazione, promemoria della recensione), prove di shared (codici,
messaggio senza promesse, bollino senza script); migrazione applicata su un
Postgres vero senza differenze con lo schema, query del promemoria e dei
partner provate lì; prova nel browser `e2e/tests/canale-professionista.spec.ts`
estesa (codice del bollino, SVG, "Porta un collega", "Ti ha invitato").
