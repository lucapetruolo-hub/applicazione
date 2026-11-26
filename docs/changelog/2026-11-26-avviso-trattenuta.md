# Avviso di trattenuta e tipo del codice del cliente

**Richiesta** (risposte del commercialista del 25/11/2026, riportate da Luca il
26/11 nel thread "Preparare la cartella per il commercialista"; Luca: "si"):
- "una fattura al mese va bene, tenendo conto che dobbiamo dargli un documento
  ogni qual volta effettuiamo la trattenuta";
- riepilogo dell'anno delle ricevute: "inseriamo se si tratta di CF o P.IVA".

**Decisione**:
- Nella finestra "Documenti" del lavoro il professionista scarica
  l'**Avviso di trattenuta** in PDF (`GET /documents/jobs/:bookingId/fees/pdf`,
  `QuotePdfService.feeNoticeForProfessional`): pagamenti online del lavoro,
  nostre trattenute (anche quelle restituite) con la fattura COM o la nota "Va
  nella fattura delle trattenute di…", totale, e la scritta che non è una
  fattura (vale la fattura elettronica del mese nel cassetto fiscale). Si
  aggiorna a ogni pagamento. Le trattenute del lavoro hanno `fee: true` in
  `JobDocumentMovement`.
- Le email "Acconto pagato" e "Saldo pagato" al professionista mostrano la
  trattenuta (7% + IVA, la stessa che Stripe trattiene) e dicono dove sono
  l'avviso e la fattura.
- Riepilogo dell'anno delle ricevute: "C.F." o "P.IVA" davanti al codice del
  cliente nel PDF, colonna "Tipo di codice" nel foglio (`customerTaxIdKind`).

**Motivo**: la fattura mensile (fattura differita) resta quella valida; il
professionista ha comunque un documento per ogni trattenuta, come chiesto dal
commercialista.

**Verifica**: test nuovi in `quote-pdf.service.test.ts` e
`documents-pdf-sdi.test.ts`; test dell'API tutti verdi (1795); typecheck di
API e sito.
