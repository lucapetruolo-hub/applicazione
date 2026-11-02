# Collaudo del 29/10, gruppo 5: recensioni e abusi

**Richiesta**: Luca, 2/11/2026: correggere i difetti del gruppo 5 del
collaudo (`collaudo/2026-10-29/riepilogo.md` nella cartella del progetto):
P-01, A-16, P-03, F-07, I-04, P-07, I-10, I-11, e in Admin vedere e
nascondere le recensioni dalla scheda dell'utente.

## Già fatti in altre PR

- **F-07** risposta del professionista alle recensioni: PR #194 (gruppo 1).
- **I-04, P-07** telefono, email e "paga fuori" in chat prima
  dell'accettazione: bloccati per tutti nella PR #212 (Protezioni), scelta di
  Luca del 2/11.
- **Recensioni dalla scheda dell'utente in Admin** (vedere, "Nascondi",
  "Rimetti visibile"): PR #197.

## A-16 stelle già a 5

Riproposte una volta le stelle vuote. **Decisione di Luca (2/11)**: restano
a 5 di serie. Non cambiato; non riproporlo.

## P-01 recensione finta in 10 minuti

Un professionista creava un secondo account cliente (stessa casella Gmail con
il "+", stesso telefono e indirizzo), si mandava una richiesta, fissava il
lavoro a un orario già passato e si lasciava 5 stelle.

**Decisione**: con un segnale di recensione finta la recensione non si
pubblica subito ma resta **in controllo** (`Review.heldAt`, `heldReasons`,
migrazione `20261102140000_recensioni_in_controllo`). Segnali
(`apps/api/src/reviews/review-hold.ts`):

- stesso telefono di cliente e professionista (anche quello della richiesta
  o dell'indirizzo di lavoro);
- stesso indirizzo con il civico;
- stessa casella email (maiuscole, "+qualcosa" e punti di Gmail non contano,
  `emailMailbox`);
- lavoro fissato quando l'orario era già passato;
- cliente iscritto da meno di 2 giorni e nessun pagamento online (il
  pagamento diretto non lascia traccia di soldi).

Restano fuori gli account di prova. La recensione in controllo è nascosta
(`hiddenAt`, quindi fuori da profilo, ricerca, home e media), non arriva
l'avviso al professionista e lui non la vede nella sua pagina. Il cliente in
"Le mie recensioni" legge "La pubblichiamo dopo un breve controllo, di
solito entro 2 giorni".

In Admin compare nella coda "Da fare" ("Recensione da controllare", scadenza
2 giorni) e porta alla scheda di chi l'ha scritta, scheda Recensioni:
"In controllo" con i motivi, **Pubblica** (torna visibile, media ricalcolata,
avviso al professionista, registro azioni) o **Nascondi** (la strada delle
segnalazioni di #197: l'autore riceve misura, motivo e come contestare).

Termini, punto 4: una recensione con segnali di possibile falsità la
controlla una persona prima di pubblicarla. Voce `2026-11-02` in
`TERMS_CHANGES` (senza avviso prima del lancio).

## P-03 stesso codice fiscale e stessa partita IVA su un secondo account

**Decisione**: al salvataggio dei dati fiscali, un codice fiscale o una
partita IVA già legati a un altro account attivo vengono rifiutati: "Questa
partita IVA è già legata a un altro account: ogni persona o impresa può
averne uno solo. Accedi con quello, oppure scrivici da Contatti se pensi che
sia un errore." "IT12345678903" e "12345678903" sono la stessa. Non contano
gli account chiusi, dimostrativi e di prova. Con un solo account per partita
IVA anche il posto tra i primi 100 e i mesi gratis valgono una volta.
Termini, punto 2: un solo account professionista per persona o impresa. Gli
account doppi già esistenti restano segnalati in Admin (segnale "Stesso
codice fiscale o partita IVA").

## Mesi gratis una volta per partita IVA

**Richiesta di Luca (2/11)**: "Fai miglioria dei mesi gratis per la partita
iva". Chiudendo l'account la partita IVA si liberava: ci si poteva iscrivere
di nuovo e riavere i mesi gratis.

**Decisione**: i mesi gratis spettano una volta per persona o impresa. Al
salvataggio dei dati fiscali, se un account chiuso (non dimostrativo né di
prova) con la stessa partita IVA o lo stesso codice fiscale li aveva già
avuti, al nuovo account si tolgono (`SubscriptionsService.revokeUsedFreeMonths`):
anche quelli in attesa; quelli in corso finiscono oggi, o al lancio se il
lancio non c'è ancora stato (prima del lancio non si paga mai). Se la carta
è già data, la prova su Stripe si chiude alla stessa data
(`BillingService.endStripeTrial`, registrata all'avvio per non creare un giro
tra i moduli) e parte Base. Avviso sul sito e per email
(`SUBSCRIPTION_FREE_MONTHS_USED`, argomento Abbonamento) con cosa succede e
come annullare; riga nel registro azioni. Termini, punto 4, e voce
`2026-11-02` in `TERMS_CHANGES`.

## I-10 la stessa richiesta mandata due volte

**Decisione**: la stessa richiesta (stesso testo, senza contare maiuscole,
spazi e punto finale; stessa categoria; stesso professionista, o stessa città
per una richiesta generale) mandata di nuovo entro 30 minuti non parte: "Hai
già mandato questa richiesta a … pochi minuti fa: la trovi in Le mie
richieste", con il link. Una richiesta eliminata dal cliente non conta.

## I-11 due lavori dello stesso mestiere alla stessa ora

**Decisione**: un avviso, non un blocco (si possono avere davvero due lavori
insieme). Sul preventivo da accettare, se la fascia si sovrappone a un
appuntamento confermato dello stesso mestiere in un'altra richiesta: "A
quell'ora hai già un appuntamento con …. Se accetti questo, ricordati di
annullare l'altro." (`sameTimeBooking` in `packages/shared`).

## Verifica

- Test: `review-hold.test.ts` (scenario del collaudo con tutti e 5 i
  segnali, pagamento online, indirizzo senza civico, caselle email),
  `reviews.service.test.ts` (recensione in controllo senza avviso né media),
  `tax-id-unique.test.ts` (anche i mesi gratis già usati),
  `free-months-once.test.ts`, doppio invio in `chosen-professionals.test.ts`,
  `sameTimeBooking.test.ts`.
- API 1156 test verdi, shared 27; typecheck e lint di API e sito.
- `prisma migrate diff` dalle migrazioni allo schema: nessuna differenza.
