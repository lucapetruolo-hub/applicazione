# Controllo di tutti i PDF per clienti e professionisti

**Richiesta** (Luca, 16/11/2026): controllare come farebbe un professionista
di alto livello tutti i PDF che il sito dà a clienti e professionisti:
chiarezza per persone comuni, dati che servono al commercialista, resa
grafica.

**Cosa si è controllato** (16 documenti, generati con dati di prova; anteprime
in `anteprime/pdf/` dei file del progetto): fatture COM e ABB e note di
credito, estratto del mese, ricevuta occasionale (a privato, a partita IVA,
copia per il cliente), riepilogo dell'anno delle ricevute, riepilogo DAC7,
preventivo (partita IVA e lavoro occasionale), riepilogo dei pagamenti del
cliente, "I tuoi dati", scheda per i partner.

**Decisione**: corretti i punti sicuri, senza toccare le scelte già prese
(ricevuta come modello del professionista, bollo solo come promemoria):

- Ricevuta: la ritenuta cita la norma ("Ritenuta d'acconto 20% (art. 25 DPR
  600/1973)"); il riquadro del cliente si chiama "Cliente" invece di
  "Ricevuto da" (sulla copia per il cliente sembrava che il denaro lo avesse
  ricevuto lui). Stesse parole nell'anteprima sul sito.
- Riepilogo dell'anno: una ricevuta a una partita IVA sopra 77,47 € mostra
  ritenuta e bollo insieme (prima solo la ritenuta); il totale è detto
  "compensi lordi, prima della ritenuta"; sopra 5.000 € l'avviso dei
  contributi INPS, che c'era già sulla pagina ma non nel PDF per il
  commercialista.
- Fatture COM/ABB: "Copia di cortesia in PDF" accanto a dove sta l'originale
  elettronico.
- Estratto: "Trattenute (con IVA)", come nel riepilogo DAC7.
- DAC7: un trimestre senza pagamenti online mostra il trattino, non "0,00 €".
- Riepilogo dei pagamenti del cliente: dice quale lavoro (mestiere e giorno
  dell'appuntamento) e il rimborso ha il segno meno (prima sembrava un altro
  pagamento).
- "I tuoi dati": prezzi e importi in italiano ("Prezzo da" invece di "Price
  min") e "scaricata l'8 novembre".

**Secondo giro** (Luca, 16/11/2026, "Preventivo su una sola pagina quando la
seconda ha solo poche righe: sì"): se l'ultima pagina di un PDF occupa al
massimo un terzo di pagina (prima 90 punti, ora 260), si stringono gli spazi
e, se non basta, anche titoli e totale in evidenza un po' più piccoli; si
tiene la versione con meno pagine. Il preventivo da privato di prova passa da
2 pagine a 1; quello con tre voci, pagamento online e messaggio resta su 2,
perché la seconda pagina ha davvero contenuto.

Le domande per commercialista e avvocato nate dal controllo sono in
`analisi/domande-commercialista-avvocato.md` (sezione del 16/11/2026).

**Verifica**: test in `documents-pdf-sdi.test.ts`, `quote-pdf.service.test.ts`
e `data-export-pdf.test.ts`; PDF rigenerati e riguardati uno per uno.
