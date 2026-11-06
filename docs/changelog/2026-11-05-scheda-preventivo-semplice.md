# Scheda del preventivo ricevuto più semplice

**Richiesta** (Luca, 05/11/2026, da "Le mie richieste" con un preventivo da
50 € e acconto online del 20%): la scheda del preventivo è confusionaria e,
scegliendo il pagamento online, non si capisce che online si paga solo
l'acconto (10 €) e il resto a lavoro finito. Deve essere semplice e utile.

**Cosa non andava** (valutazione da esperto UX):
- "Totale indicativo" accanto a "Prezzo finale" si contraddicevano; con una
  sola voce il prezzo compariva due volte (Manodopera 50 € e Totale 50 €).
- Il pagamento era un paragrafo, con la cifra nascosta in "Acconto
  accettando (20% del massimo): 10,00 €"; il resto (40 €) non c'era.
- "Prima di accettare" ripeteva con chi, quando, prezzo e modo di pagamento
  ma non diceva quanto si paga adesso; "Accetta e paga l'acconto" senza cifra.
- Il messaggio del professionista in fondo, il preavviso staccato, la fattura
  chiesta prima ancora di decidere.

**Decisione** (proposta prima/dopo approvata da Luca):
- Scheda: il messaggio del professionista subito sotto il nome; poi un solo
  riquadro bianco con quattro righe, **Quando**, **Prezzo** (totale grande con
  "Tutto compreso"/"IVA inclusa"; le voci solo se sono più di una, scelta di
  Luca), **Pagamento** ("10,00 € ora online, 40,00 € a lavoro finito", con
  "al professionista" se il saldo è diretto e "il resto, fino a" con una
  forbice; "Scopri di più" piccolo al posto di "Come funziona il pagamento
  online", scelta di Luca) e **Annullare** ("Avvisa almeno 24 ore prima").
- Prima di accettare: con chi e quando in una riga, poi un riquadro con
  "Paghi ora, online 10,00 €", "A lavoro finito 40,00 €" e "Totale"; la
  richiesta della fattura si fa qui.
- Il pulsante dice la cifra: "Accetta e paga 10,00 €". Con il pagamento
  diretto resta "Accetta con obbligo di pagare" (decisione di Luca, collaudo
  A-07). Nella scelta tra più modi, sotto ogni modo online le stesse cifre al
  posto della percentuale.
- Le cifre le calcola un solo punto (`paymentSplit` in
  `apps/web/src/components/PaymentChoice.tsx`), con lo stesso acconto del
  server (`onlineDepositEurCents`, sul massimo del preventivo).
- "Il professionista ha cambiato il prezzo" in ottone scuro (l'ottone pieno
  sul chiaro non si leggeva).

**Verifica**: `pnpm typecheck` e `pnpm lint` di `apps/web`; prove nel browser
`preventivo-accettato`, `schede-lavoro` e `tastiera`; foto della scheda e del
passo "Prima di accettare" da telefono e da computer in
`analisi/scheda-preventivo/` dei file del progetto.

## Documenti: il preventivo in PDF e tutto scaricabile

**Richiesta** (Luca, 05/11/2026): un documento con il riassunto del
preventivo che il cliente può scaricare, dalla voce "Documenti" del menu
della richiesta; e "i documenti attualmente presenti in quel menu non sono
scaricabili, risolvi".

**Decisione**:
- "Documenti" nel menu della richiesta compare appena arriva un preventivo
  (prima solo con il lavoro accettato), per il cliente e per il
  professionista che l'ha mandato. Nessun menu nuovo nella scheda: si
  riusa la voce che c'era (regola delle procedure standard).
- In cima alla finestra la parte **Preventivo**: il PDF di ogni preventivo
  ricevuto (dopo l'accettazione solo quello accettato). Lo prepara il
  server con pdfkit come le fatture (`apps/api/src/accounting/quote-pdf.service.ts`,
  `GET /documents/quotes/:quoteId/pdf`): stato, data di invio, chi esegue il
  lavoro, la richiesta, quando, le voci e il totale, il pagamento con le
  cifre di ora e di dopo, il preavviso e il messaggio del professionista.
  Nessun contatto del cliente (CLAUDE.md §5 punto 9).
- Ogni documento della finestra si scarica con un tocco: fatture ed
  estratti del professionista (prima erano link a pagine), e per il
  cliente il **Riepilogo dei pagamenti** in PDF
  (`GET /documents/jobs/:bookingId/payments/pdf`), con scritto che non è
  una fattura né una ricevuta.
- Le cifre di ora e di dopo sono in `packages/shared`
  (`quotePaymentSplit`), usate dalla scheda e dal PDF.

**Verifica**: prova in locale del PDF del preventivo per cliente e
professionista (un altro utente riceve 404) e dello scaricamento dalla
finestra; prove nel browser `preventivo-accettato`, `schede-lavoro`,
`tastiera`, `elimina-richiesta`, `fisco-schede`, `stelle-preventivi`: 63
passate; `packages/shared/src/quotePaymentSplit.test.ts`.

## Bollino "Verificato" nel preventivo (06/11/2026)

**Richiesta** (Luca): il bollino "Verificato" c'era nella scheda in alto ma
non nel preventivo, dove il cliente decide: sembrava un professionista
diverso. **Decisione**: `verified` (stessa regola `publicVerified` della
scheda) nei preventivi della richiesta del cliente e bollino accanto al
nome, con il suo fumetto. Scartata da Luca la riga "Non ti va bene? Proponi
un'altra data" sotto la data: il pulsante c'è già.
