# "Scarica le fatture del mese" in Admin → Finanza

**Richiesta** (Luca, 24/11/2026, thread "Emettere fatture elettroniche ai
professionisti"): un pulsante in Admin → Finanza che dia in un solo file zip
le fatture del mese da girare al commercialista, in qualunque programma lavori
(Aruba, Fatture in Cloud…). Prima controllare che non ci sia già: non c'era
(si scaricava solo l'XML di una fattura alla volta).

**Decisione**: `GET /admin/invoices/month/:month/zip` (scopo `FINANCE`, come
tutta la contabilità admin) con tutte le nostre fatture emesse nel mese
(`MANOVIA_TO_PROFESSIONAL`, `ISSUED`, serie `ABB` e `COM`, note di credito
comprese), ordinate per serie e numero:
- `xml/ABB-2026-0003.xml`: il file della fattura elettronica, quando c'è;
- `pdf/ABB-2026-0003.pdf`: sempre, lo stesso PDF del sito;
- `da-sistemare.txt`: solo se qualche fattura non ha ancora l'XML (dati
  fiscali del professionista incompleti, non ancora inviata), con il motivo;
- `riepilogo.csv`: una riga per fattura (numero, data, tipo documento TD01/
  TD24/TD04, servizio, fattura collegata, professionista, partita IVA, codice
  fiscale, imponibile, IVA, totale, XML sì/no, stato SdI), punto e virgola e
  importi all'italiana come l'estratto; le note di credito col meno, così la
  somma della colonna è il netto del mese (`monthInvoicesCsv` in
  `packages/shared/src/accounting.ts`).

Lo zip lo scrive `apps/api/src/common/zip.ts` senza dipendenze nuove (file
"stored", senza compressione: XML e PDF di un mese sono pochi MB). Ogni
download va nel registro azioni ("Fatture del mese scaricate in zip"), perché
dentro ci sono i dati fiscali dei professionisti. Pulsante accanto a
"Controlla che i conti tornino", con lo stesso campo Mese. L'esito dei
pulsanti del mese (giro rifatto, conti, zip) ora compare sotto quei pulsanti e
non in cima alla pagina.

**Invio automatico al commercialista della società** (migliorie approvate da
Luca lo stesso giorno, "far cliccare una spunta"): riquadro "Commercialista
della società" in Admin → Finanza con email e spunta "Manda ogni mese le fatture
al commercialista" (`PUT /admin/invoices/accountant`, nel registro azioni; colonne
`accountantEmail`, `accountantZipAt`, `accountantZipMonth` di
`platform_invoice_settings`, migrazione solo additiva). Con la spunta
`CompanyAccountantService.sendMonthly` manda il 5 del mese alle 9 lo zip del
mese prima in allegato. Perché il 5: le fatture delle trattenute partono il 1°,
quelle saltate si recuperano dal 2 al 15, e il commercialista ha ancora tempo
per la liquidazione IVA del 16. Mai due volte lo stesso mese (il mese si segna
prima di mandare e si rimette se l'invio non riesce); mese senza fatture =
niente email; zip oltre 25 MB = niente email ed errore nei log (Resend accetta
al massimo 40 MB). Sotto la spunta si vede l'ultimo mese mandato.

**Altre due migliorie approvate da Luca** (stesso giorno): se il 5 l'invio non
riesce (o lo zip è troppo grande) gli admin della Finanza ricevono l'avviso
`ADMIN_FEE_RECONCILIATION` con `kind: "accountant-zip"` (tipo già esistente,
nessun argomento nuovo); pulsante **"Mandalo adesso"** nel riquadro
(`POST /admin/invoices/accountant/send/:month`, nel registro azioni) che manda
subito le fatture del mese scritto nel campo Mese, anche senza spunta e anche
se quel mese era già partito, perché lo chiede un admin. Finché Resend non ha
il dominio, l'email parte solo verso l'indirizzo di Luca.

**Motivo**: il commercialista può comunque prendere le fatture dal cassetto
fiscale dell'Agenzia delle Entrate; lo zip serve se preferisce un file solo
o se una fattura non è ancora passata dallo SdI (domanda C13 nel file delle
domande al commercialista).

**Verifica**: `company-accountant.test.ts` (invio del 5, spunta spenta,
niente doppioni, mese rimesso se l'invio non riesce, testo dell'email),
`zip.test.ts` (nomi, CRC, nomi con accenti, zip vuoto) e
`fatture-del-mese-zip.test.ts` (XML e PDF, fattura senza XML nel
`da-sistemare.txt`, mese sbagliato o vuoto); zip aperto anche con `zipfile`
di Python. Prova a mano in locale con due fatture COM di ottobre:
download riuscito da computer e telefono, foto in
`anteprime/fatture-del-mese-zip/`.
