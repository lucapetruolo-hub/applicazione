# Preventivo: l'importo dell'acconto mentre si scrive la percentuale

**Richiesta** (Luca, 18/11): quando il professionista sceglie l'acconto online,
fargli vedere subito l'importo che sta chiedendo in base alla percentuale che
scrive.

**Decisione**:
- Sotto "Acconto online __ % dell'importo massimo" una riga che si aggiorna a
  ogni tasto: "Il cliente paga subito 70,00 € con la carta (25% di 280 €, il
  prezzo massimo)."
- Stessa regola che il sito usa poi davvero (`quoteDepositEurCents`): la
  percentuale si calcola sul totale massimo di tutte le voci, diritto di
  chiamata compreso, arrotondata al centesimo. Con la forbice la riga dice "il
  prezzo massimo"; con un prezzo unico no.
- Al 100% con una forbice: "Il cliente paga subito 180,00 € con la carta, il
  prezzo minimo. Il resto, se serve, a lavoro finito." (decisione di Luca del
  13/11, docs/changelog/2026-11-13-tutto-online-forbice.md). La vecchia riga
  generica sulla forbice resta solo finché non ci sono prezzi.
- Lavoro ricorrente: "a visita".
- Senza prezzi: "Scrivi i prezzi delle voci: qui vedi quanto paga subito il
  cliente con la carta."
- Sotto 0,50 € (minimo di Stripe): la riga in ocra scuro dice l'importo e
  cosa fare, prima ancora di premere Invia. Percentuale non valida: nessuna
  riga, l'errore lo dà l'invio come prima.
- Letta dal lettore di schermo quando cambia (`aria-live="polite"`).

**Come**: `depositPreviewLine` in `packages/shared/src/onlinePayments.ts` (con
prove in `onlinePayments.test.ts`), usata da `RequestCard.tsx`.

**Verifica**: prove di `packages/shared` verdi, typecheck e lint del sito.
Foto prima/dopo da telefono e computer in `anteprime/importo-acconto/` (25%,
100% con forbice, senza prezzi, sotto il minimo).

**Secondo giro** (sì di Luca a due migliorie; no al netto dopo la trattenuta e
ai pulsanti veloci 20/30/50%):
- Il tetto dei 2.000 € online si vede mentre si scrive, in ocra scuro sotto la
  riga dell'importo, con la stessa frase dell'invio (`onlineLimitProblem`).
  Finché c'è l'avviso, la riga grigia che spiega il tetto si nasconde per non
  dirlo due volte.
- Dopo la casella solo "%": "dell'importo massimo" da telefono andava a capo da
  solo, e la riga nuova già dice su quale cifra si calcola.
- Coordinato con "Semplificare l'accettazione del preventivo" (PR #403): stesso
  calcolo (`quoteDepositEurCents`) e stesse parole ("subito", "il resto, se
  serve"), nessun conflitto tra i due rami.
- Foto: `anteprime/importo-acconto/dopo2-*.png`.

**Terzo giro: acconto sul prezzo minimo** (decisione di Luca, 18/11: "facciamo
tutto sul minimo, correggi dappertutto"; motivo: chiedendo il 70% sul massimo
il lavoro poteva costare meno dell'acconto e serviva un rimborso al cliente,
di cui Stripe non restituisce la commissione).
- `quoteDepositEurCents` e `onlineDepositEurCents` (packages/shared) ora
  calcolano la percentuale sul **prezzo minimo** di tutte le voci. Al 100% resta
  il minimo, come già deciso il 13/11. Con un minimo di 0 € l'acconto è 0 e il
  pagamento online non si offre (sotto lo 0,50 € di Stripe).
- Stesso calcolo ovunque, perché tutti usano queste funzioni: modulo del
  professionista, scheda e riepilogo del cliente, pagamento su Stripe
  all'accettazione (`bookings.service`), PDF del preventivo, email, controllo
  "acconto sotto 0,50 €" (`onlineDepositTooLowProblem`, `clientPaymentOffer`).
  Il tetto dei 2.000 € conta l'acconto sul minimo per "Acconto online e saldo
  diretto" e il prezzo massimo per "tutto online" (il saldo può arrivare lì).
- Scritte: modulo ("70% di 180 €, il prezzo minimo"), testo del cliente "Paghi
  ora un acconto del 20% del prezzo minimo", FAQ "Cos'è l'acconto?", pagina
  /per-professionisti/pagamenti ("da 1 a 100% del prezzo minimo"), Termini
  (sezione pagamenti) con la nuova versione 2026-11-18 in `termsChanges.ts`
  (senza avviso: prima del lancio), docs/prodotto.md.
- Preventivi già accettati: l'acconto è già salvato in `JobPayment`, non cambia.
  Preventivi inviati e non ancora accettati: il cliente paga il nuovo importo
  (più basso o uguale); il controllo "il preventivo è cambiato durante il
  pagamento" protegge chi era già su Stripe.
- Prove aggiornate: shared (224), API (1632), più typecheck e lint.
- Foto: `anteprime/importo-acconto/minimo-*.png`.

**Quarto giro: le due scelte online restano anche al 100%** (sì di Luca, 18/11;
cambia la decisione del 13/11). Con l'acconto sul minimo, al 100% con una
forbice "Acconto online e saldo diretto" non coincide più con "tutto online":
il cliente paga il minimo con la carta e l'eventuale differenza direttamente al
professionista. Quindi:
- `quotePaymentOffer` unisce le due scelte solo al 100% con un **prezzo unico**
  (lì sono davvero uguali); legge le voci del preventivo, che server, PDF e
  pagina del cliente gli passano già.
- Testo per il cliente con "acconto e saldo diretto" al 100%: "Paghi ora con la
  carta il prezzo minimo. Se il prezzo finale è più alto, la differenza la paghi
  direttamente al professionista a lavoro finito." La riga con le cifre dice
  "direttamente al professionista" invece di "con la stessa carta".
- Nel modulo l'avviso "non vedrà Acconto online e saldo diretto" compare solo al
  100% con un prezzo unico.
