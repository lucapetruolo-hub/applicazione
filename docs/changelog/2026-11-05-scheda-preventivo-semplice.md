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
  "Prezzo finale"/"IVA inclusa"; le voci solo se sono più di una, scelta di
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
