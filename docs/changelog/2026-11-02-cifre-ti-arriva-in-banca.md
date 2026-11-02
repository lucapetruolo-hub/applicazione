# Cifre "Ti arriva in banca" dopo lo sblocco (collaudo F-21)

**Richiesta** (collaudo del 29/10, difetto F-21): dopo lo sblocco le cifre di
Marco non tornano. F12: pagato 30,00 €, trattenuta 2,56 €, "Ti arriva in
banca 0,00 €" (atteso 27,44 €). F13: pagato 380,00 €, trattenuta 32,45 €, in
banca 291,57 € (mancano 55,98 €). Proposta del collaudo: le tre cifre devono
tornare, e un'altra voce va scritta con il suo nome.

**Cosa succedeva.** Allo sblocco il bonifico non supera quanto resta davvero
sul conto Stripe del professionista, tolti i soldi ancora bloccati per gli
altri lavori (§268). La parte mancante (`takenByStripe`) veniva tolta dal
bonifico ma non era salvata né mostrata, quindi la scheda mostrava
pagato − trattenuta ≠ in banca. Due cause per cui il conto era più
basso del previsto, trovate nel codice:

1. **Una contestazione per ogni addebito.** Acconto e saldo sono due
   addebiti. La carta di prova 0259 li contesta tutti e due (F22 di Paola:
   due addebiti da 40 €, trattenuta 6,84 € = 3,42 € × 2). Stripe prende ogni
   cifra dal saldo del professionista, ma il sito contava solo la prima
   contestazione (`disputeRecoveredEurCents > 0` faceva saltare la seconda):
   i 40 € della seconda risultavano ancora "bloccati per Paola" e abbassavano
   i bonifici degli altri lavori.
2. **Trattenuta restituita contata come presa da Stripe.** Quando il lavoro
   si chiude a meno di quanto pagato, allo sblocco la piattaforma restituisce
   la trattenuta in più, ma il saldo si leggeva prima della restituzione: la
   differenza sembrava presa da Stripe e restava ferma sul conto (per esempio
   Rita: 1.999 € pagati, lavoro a 300 €, avrebbe ricevuto 129,29 € invece di
   274,38 €).

**Decisione.**
- `JobPayment.disputeFunds`: quanto ha preso ciascuna contestazione dai soldi
  del lavoro (−1 quando è sistemata); la stessa notizia di Stripe arrivata due
  volte conta una volta. Vinta o persa, si sistema solo la parte di quella
  contestazione.
- Allo sblocco il saldo letto conta anche la trattenuta che sta per tornare.
- Salvati allo sblocco `releaseTakenByStripeEurCents` e
  `releaseDebtRecoveredEurCents` (anche per gli sblocchi già fatti, dal
  registro delle azioni). Nella scheda del professionista due righe nuove,
  solo se diverse da zero: "Ripreso per un rimborso di un lavoro precedente"
  e "Già preso da Stripe per un altro lavoro (rimborso o contestazione)".
  Così pagato − rimborsato − trattenuta − queste righe = in banca.

**Non verificato sui dati veri.** La chiave di prova in sola lettura data al
thread apre un conto Stripe vuoto (nessun conto collegato, nessun addebito),
non quello usato da Render: i movimenti del conto di Marco non si sono potuti
leggere. Le due cause spiegano almeno 40 € dei 83,42 € mancanti in tutto; il
resto va confermato con una chiave dello stesso ambiente Stripe del sito.

**Verifica.** Test nuovi in `direct-charges.test.ts`: seconda contestazione
contata solo per i soldi che restano, stessa contestazione due volte,
trattenuta restituita allo sblocco (fallisce senza la correzione), parte presa
da Stripe salvata. `pnpm --filter @professionisti/api test` (1143 test) e
typecheck verdi.

## Secondo giro: ogni contestazione si chiude da sola

**Richiesta** di Luca: "effettua le prime due migliorie" (chiusura di ogni
contestazione per conto suo; rifare F12, F13 e F22 al centesimo).

**Decisione.**
- `JobPayment.disputeStatuses`: lo stato di ciascuna contestazione. Apertura e
  chiusura di ognuna si segnano una volta sola (anche con due notizie quasi
  insieme); la seconda contestazione avvisa anche lei team e professionista.
  Persa, la sua cifra si somma ai rimborsi delle altre; il pagamento resta
  "Contestato" e i soldi fermi finché ce n'è una aperta.
  `stripeDisputeId`/`stripeDisputeStatus` mostrano quella ancora aperta.
- Admin → Contestazioni: le prove mandate alla banca vanno anche all'altra
  contestazione aperta dello stesso lavoro.
- F12, F13 e F22 rifatti in una prova automatica con le trattenute lette su
  Stripe (dal lato piattaforma): su F13 a Marco 340,71 € con la riga
  "Già preso da Stripe per un altro lavoro" di 6,84 €, cioè la trattenuta dei
  due addebiti contestati di Paola, che Stripe ha preso dal suo saldo insieme
  agli 80 €; prima mancavano 55,98 € senza spiegazione. I 6,84 € tornano a lui
  se le contestazioni si chiudono (persa: trattenuta restituita; vinta: tutta
  la cifra di nuovo sul conto).

**Verifica.** 4 test nuovi (due contestazioni chiuse una alla volta, avviso
della seconda, prove a tutte e due, conto di Marco al centesimo).
`pnpm --filter @professionisti/api test` 1147 verdi, typecheck verde. La
prova dal vivo su Stripe resta da fare dopo l'unione, con una chiave in sola
lettura dell'ambiente di Render per leggere il saldo di Marco.
