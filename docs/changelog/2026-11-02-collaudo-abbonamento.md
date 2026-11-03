# Abbonamento: testi, date e fatture (collaudo, gruppo 9)

**Richiesta** (Luca, 2/11/2026): correggere il gruppo 9 del collaudo del
29/10/2026 ("Abbonamento: testi e fatture"), dopo la PR #190.

**Difetti e correzioni**

- **D-02, E-02** (abbonamento pagato senza fattura sul sito): il pagamento
  prima del lancio non c'è più (PR #190, E-01). In più, ogni mattina alle
  6:15 un recupero rilegge i pagamenti di Stripe degli ultimi 12 giorni e fa
  la nostra fattura a quelli che non l'hanno (webhook perso, dati della
  società messi dopo la data di partenza). 12 giorni: il termine della
  fattura immediata (art. 21 DPR 633/1972). Prima della data di partenza in
  Admin → Finanza non fa nulla (`BillingService.issueMissedInvoices`).
- **G-02** (il PDF di Stripe si chiama "Fattura" ma non lo è): "Cambia la
  carta" apre il portale di Stripe con una configurazione che mostra solo la
  carta, senza lo storico dei documenti di Stripe (`solo-carta-v1`, creata
  al primo uso e ritrovata dai metadati). Sotto il pulsante del Checkout di
  Stripe una riga dice che la fattura la facciamo noi, in Fatture e
  documenti.
- **E-13** (nessun avviso dopo il pagamento): nuovo avviso
  `SUBSCRIPTION_PAID` (campanella ed email, "Account e sicurezza") per un
  livello scelto o una quota di passaggio pagati, con l'importo e dove sta
  la fattura; il tocco porta a Fatture e documenti. Il rinnovo dice anche
  che la fattura è pronta.
- **D-05, E-08, C-10** (mese gratuito o 3 mesi, date diverse):
  - prima del lancio la pagina non mostra più "Lavori dal 29 ottobre al
    27 novembre", ma "Lavori accettati finora" e "Fino al lancio non c'è
    limite";
  - sotto il pulsante di Stripe, che conta "89 giorni gratuiti", la data di
    fine, il prezzo dopo e che si annulla dal sito;
  - "Cambia la carta" solo a chi ha dato la carta;
  - riepilogo a 0 €: "Mesi gratis" al posto di "Mese gratuito".
- **C-09** ("4 su 3" senza spiegazione): vedi sopra. `MySubscription.limitsActive`
  dice se il limite vale (pagamenti accesi e sito lanciato).
- **O-01** (annullato, "resta attivo", "ogni mese in automatico" insieme):
  con il rinnovo spento in alto "Livello Plus fino al 27 gennaio 2027" e
  "Rinnovo spento: dopo quella data non paghi più nulla"; le caselle Rinnovo,
  Cambio di livello e Annulli cambiano con lo stato (mesi gratis senza carta,
  con la carta, pagato, rinnovo spento); con il rinnovo spento sparisce
  "Annulli quando vuoi".
- **O-13** (cambio di livello che non si capisce): casella breve "Paghi una
  volta sola la differenza fino al rinnovo, più una piccola quota" (nei mesi
  gratis: il primo mese meno i 19 € di Base); il riquadro "Se passi oggi"
  dice "Paghi una volta 141,88 € + IVA (173,09 € IVA inclusa)" e sotto "Dal
  27 gen 99 € al mese + IVA".
- **D-06, O-08** (tetto di 2.000 € online): nel preventivo "Il limite si
  toglie dopo 10 lavori pagati online senza contestazioni e 4 mesi dal
  primo"; una riga con "Perché" dove si attivano i pagamenti online; nuovo
  punto 5 "Limite per i primi lavori" in /per-professionisti/pagamenti, con
  anche i 3.000 € bloccati in tutto.

**Verifica**

- Test nuovi: avviso del pagamento (quota di passaggio, rinnovo, carta a
  0 €), recupero delle fatture mancate, riga del Checkout, portale solo
  carta creato una volta e ritrovato; frase del tetto aggiornata.
- Test dell'API (1142) e di shared verdi; typecheck e lint di API e sito puliti.

**Dopo, su richiesta di Luca (2/11)**: nei Termini, punto "Chi compare",
"mese gratuito finito senza un livello scelto" diventa "dal lancio: mesi
gratis senza la carta o finiti senza un livello", come le regole in vigore
(offerta dei mesi gratis con la carta). Solo la parola, nessuna regola
nuova: nessuna versione nuova dei Termini.

**Dopo, su richiesta di Luca (2/11): pacchetto per il commercialista.**
`apps/api/scripts/pacchetto-commercialista.ts` crea con dati inventati un PDF
per ogni documento (fatture COM e ABB, nota di credito, estratto, ricevute
del lavoro occasionale, riepilogo dell'anno, DAC7) e l'XML delle quattro
fatture; il pacchetto con le domande aperte è in
`analisi/pacchetto-commercialista/` dei file del progetto. I quattro XML
passano lo schema ufficiale FatturaPA 1.2.2. Preparandolo sono venuti fuori
due errori nell'XML, corretti: il simbolo dell'euro spariva dalle descrizioni
(ora "EUR", senza spazi doppi) e il capitale sociale scritto all'italiana in
Admin → Finanza ("10.000,00 €") sarebbe stato scartato dallo SdI (ora
"10000.00"; nel PDF "10.000,00 €"). Test in `accounting.test.ts`.

Sempre il 2/11, su richiesta di Luca: nel PDF della fattura del mese la
riga finale finiva da sola su una seconda pagina. Ora, quando nell'ultima
pagina resterebbe solo qualche riga, il PDF si impagina di nuovo con meno
spazio tra i blocchi e si tiene la versione con meno pagine
(`renderDocumentPdf`, test in `documents-pdf-sdi.test.ts`). Email di Stripe
(checklist 14c, decisione di Luca): restano accese sia le ricevute sia le
"fatture finalizzate", come doppio controllo per il commercialista.
