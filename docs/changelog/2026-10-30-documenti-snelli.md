# Documenti più snelli: solo ricevuta ed estratto

**Richiesta**: Luca, 30/10/2026, dopo le migliorie del gruppo 2 del collaudo:
"ci stiamo addossando troppe responsabilità e scelte, vorrei qualcosa di più
snello e funzionale". Sulla scheda ha scelto "Sì, solo ricevuta ed estratto".

**Decisione**:

- **Niente più copia della fattura per chi ha la partita IVA.** La fattura vera
  la fa col suo programma, e la nostra copia era un secondo documento da
  tenere allineato: numero, data, aliquota IVA, bollo. Ora il sito gli dà solo
  i dati del cliente da copiare, nella scheda del lavoro e nella richiesta di
  fattura. La pagina della copia risponde "Con la partita IVA la fattura la fai
  col tuo programma".
- **Resta la ricevuta per il lavoro occasionale**, col numero dato da noi.
  - Si può cambiare il nome e il codice fiscale del cliente.
  - La ritenuta del 20% vale se il cliente ha la partita IVA, e si può togliere.
  - Ci sono le diciture "fuori campo IVA" e il promemoria della marca da bollo
    da 2 € oltre 77,47 €.
- **Il bollo** non è una scelta nostra: sulla ricevuta resta solo il
  promemoria, e lo mette chi la dà.
- **Resta l'estratto del mese**. Per chi ha la partita IVA la colonna del
  documento al cliente dice "Fattura del professionista (dal suo programma)".
- **Elenchi e riepilogo dell'anno**: contano solo le ricevute, cioè "Ricevute
  date ai clienti" in Fatture e documenti, il riepilogo per il commercialista,
  l'avviso del 15 dicembre e Admin → Documenti ai clienti, che perde il filtro
  per tipo. Il riquadro dei lavori pagati online senza documento compare solo
  a chi fa le ricevute.
- **Il cliente** di un professionista con la partita IVA legge nei documenti
  del lavoro "La fattura te la manda il professionista".
- **Database**: la migrazione `20261030100000_documenti_ai_clienti`, non
  ancora unita né in produzione, ora aggiunge solo nome, codice fiscale e
  ritenuta. Data e aliquota IVA della copia della fattura sono tolte. Le
  vecchie copie delle fatture (`kind = INVOICE`) restano nel database ma non si
  mostrano più.

**Verifica**:
- In tutto 1037 prove dell'API verdi, comprese le nuove per il 409 con la
  partita IVA e per `ownInvoice` nei documenti del lavoro.
- Test dei permessi in locale: 320 rotte, nessun problema. proA ora lavora in
  modo occasionale e la ricevuta è un documento `RECEIPT`.
- Controlli dei tipi del sito verdi, `pnpm lint` verde.
