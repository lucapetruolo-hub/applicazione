# Fatture e fisco: correzioni del collaudo pre-lancio (gruppo 5)

**Richiesta**: controllo completo pre-lancio dell'08/11/2026 con dieci
esperti (`collaudo/2026-11-08/esperto-E5-fiscale.md` nei file del progetto).
Luca: "sì a tutto quello che ritieni" → gruppo 5, fatture e fisco, con le
migliorie "sì" del tema. E5-01 (nota di credito collegata alla fattura
giusta) ed E5-03 (ritenuta col pagamento online) aspettano le risposte del
commercialista (domande N1 e N2 in `analisi/domande-commercialista-avvocato.md`).

**Decisioni e motivo**:
- **E5-05, gli account di prova non fanno fatture**: giro del mese,
  abbonamenti e pacchetti saltano i profili di prova (`User.testAccountAt`) e
  di esempio (`isDemo`). In Admin → Finanza, sotto i dati della società, la
  riga "Dopo 'Fatture da' ci sono N movimenti di account di prova: non
  diventano fatture". Così un numero della serie COM/ABB non si brucia su un
  soggetto inventato e lo SdI non scarta nulla.
- **E5-02, recupero del giro del 1°**: dal 2 al 15 del mese, ogni mattina
  alle 7:30, `recoverMonthly` emette le fatture delle trattenute del mese
  prima che mancano (riavvio alle 7 del 1°, errore su un professionista) e
  manda il riepilogo del mese solo a chi le riceve ora. Il 10, se ne manca
  ancora qualcuna, avviso alla Finanza con i nomi. Una fattura del mese già
  emessa non si tocca: i movimenti arrivati dopo vanno nel mese successivo
  (come prima, ma ora non contano più come "emesse"). "Emetti le fatture
  del mese" avvisa se si è oltre il 15 del mese dopo (art. 21 c. 4 DPR
  633/72) e ora manda anche il riepilogo a chi riceve la fattura.
  E5-02 era tra i punti "dopo il commercialista", ma non dipende da nessuna
  domanda aperta: la scadenza del 15 è di legge, quindi è fatto subito.
- **E5-04, residenza fiscale all'estero**: l'XML e l'IVA del 22% sono fatti
  per l'Italia. Finché il commercialista non risponde (domande 55 e N7), chi
  ha la residenza o la sede fuori dall'Italia non attiva abbonamento,
  pacchetti né pagamenti online (messaggio "scrivici dalla pagina
  Contatti", detto anche nel modulo dei dati fiscali) e non riceve fatture
  automatiche: la Finanza riceve un avviso per farla a mano.
- **E5-06, nota di credito per l'abbonamento rimborsato**: un rimborso dalla
  Dashboard di Stripe (`charge.refunded` sul nostro conto) di un
  abbonamento, una quota di passaggio o un pacchetto crea una TD04 della
  serie ABB collegata alla fattura del pagamento (trovata con
  `invoicePayments` o con il payment intent), per la sola parte nuova
  rimborsata. Testi della pagina: "Nota di credito: ti abbiamo rimborsato
  questo importo sulla carta". Senza dati della società o con un errore,
  avviso alla Finanza.
- **E5-07**: l'anno della ricevuta occasionale segue la sua data a ogni
  salvataggio e al PDF (prima restava quello del primo salvataggio, e una
  ricevuta datata 3 gennaio finiva nel riepilogo dell'anno prima).
- **E5-09**: trimestri e anni DAC7 all'ora di Roma, come estratti e fatture.
- **Miglioria "sì"**: in "Fatture e documenti" avviso al lavoratore
  occasionale quando le ricevute dell'anno arrivano a 4.000 € e quando
  superano 5.000 € (contributi INPS sulla parte in più, art. 44 c. 2 D.L.
  269/2003).
- **Non fatti nel codice**: E5-08 (condominio, domanda N3), E5-10 (fattura
  scartata non correggibile, N4), E5-11 (ordine delle ABB, N5): aspettano il
  commercialista. Checklist di lancio punto 14(a): "Fatture da" mai prima
  dell'ultima prova.

**Verifica**: `apps/api/src/accounting/fisco-collaudo.test.ts` (prove,
estero, recupero e avviso del 10, ritardo dopo il 15, note di credito
intere e in due volte, testi, trimestre DAC7 a mezzanotte di Roma, avviso
dei 5.000 €); tutte le prove di `apps/api` (1300) e di `packages/shared`,
typecheck e lint di api e web.
