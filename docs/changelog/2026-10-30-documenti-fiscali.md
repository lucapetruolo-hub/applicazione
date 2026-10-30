# Documenti fiscali e conti del mese (collaudo del 29/10, gruppo 2)

**Richiesta**: Luca, 30/10/2026: "Fai tutti i gruppi di correzione". Questo è
il gruppo 2 del piano (`collaudo/2026-10-29/piano-correzioni.md`):
ricevute e copie di cortesia, estratto del mese, riepilogo dell'anno,
Statistiche e DAC7. G-12, G-14 e G-15 sono arrivati dal gruppo 1 perché
toccano l'estratto.

## Ricevuta e copia di cortesia

- **Solo a lavoro terminato** (B-02, C-02, C-03): prima il pagamento nasceva
  all'accettazione con il massimo del preventivo, quindi il documento diceva
  "Pagato" prima del lavoro e con la cifra sbagliata. Ora pagina, PDF,
  elenco, riepilogo dell'anno e promemoria di dicembre contano solo i lavori
  `COMPLETED`, con l'importo finale. Prima della fine la scheda del lavoro dice
  "la prepari qui dopo Lavoro terminato".
- **Voci del preventivo** (B-03, D-15): le righe vengono dalle voci finali del
  lavoro quando la somma torna, altrimenti "Lavoro: categoria".
- **Numero e data della fattura vera** (D-14, G-03): per la copia della
  fattura il PDF si scarica solo con numero e data scritti dal
  professionista. La data non può essere nel futuro, ed è quella che va nel
  riepilogo dell'anno.
- **Nome e codice fiscale del cliente** (C-05, D-04, G-07): presi dai dati
  per la fattura, poi dal nome di chi riceve il lavoro o dall'account.
  Il professionista li può cambiare. Senza nome il PDF non parte.
- **Aliquota IVA** 22, 10, 5 o 4% sulla copia della fattura.
- **Ricevuta a chi ha la partita IVA** (C-04, G-06): ritenuta d'acconto del
  20% di serie ("Compenso lordo / Ritenuta / Netto pagato"), niente codice
  fiscale di una persona su una società, e il consiglio sulla Certificazione
  Unica solo a schermo, mai stampato sul documento.
- **Diciture della ricevuta occasionale** (G-08): art. 67 TUIR e "fuori
  campo IVA (art. 5 DPR 633/1972)"; per il forfettario la nota "non soggetto
  a ritenuta" quando il cliente chiede la fattura con la partita IVA.
- **Ricevuta, non fattura** (C-01): con un professionista "Lavoro
  occasionale" il cliente vede "Chiedi la ricevuta", senza PEC né codice
  destinatario. Valgono anche per le email e le notifiche.
- **Chi l'ha fatta** (G-11): in testa al PDF c'è il nome del professionista,
  mentre "Preparato con …" va in piccolo in fondo.
- Nuova migrazione `20261030100000_documenti_ai_clienti`, con cinque colonne in
  `courtesy_documents`: `ownDate`, `customerName`, `customerTaxCode`,
  `vatRatePercent` e `withholding`.

## Estratto del mese

- **Rimborsi** (G-12): ogni rimborso al cliente ha la sua riga col segno meno,
  presa dal registro delle modifiche. Anche una contestazione in banca persa
  ha la sua riga. La riga del lavoro dice "Rimborsato al cliente" e "Pagato
  online" è già al netto dei rimborsi.
- **Contestazioni in banca** (G-15): la riga dice "Contestato in banca: può
  tornare al cliente". Finché la banca non decide, quei soldi restano fuori
  da "Pagato online" e da "Ancora bloccati". Una frase sotto i totali spiega
  cosa resta fuori.
- **Stesse cifre di "Pagamenti online"** (G-14, G-13): la nota di ogni lavoro
  e "Ancora bloccati" vengono da `toJobPaymentSummary` e
  `professionalPayoutTotals`, le stesse funzioni della scheda del lavoro e
  della pagina "Pagamenti online". Così la correzione del gruppo 1 (F-04) vale
  anche qui.
- **Una data sola** (D-10): la riga del lavoro ha la data del primo movimento
  del mese, la stessa del foglio di calcolo.
- **Pagamento e documento abbinati** (G-04): nel foglio di calcolo ogni
  pagamento ha il cliente e il documento dato (oppure "non fatto sul sito").
- **Fattura delle trattenute** (G-16): prima che partano le nostre fatture
  non si promette "il 1° del mese dopo".
- L'email al commercialista ha due righe in più quando servono: i rimborsi e
  i pagamenti contestati.

## Riepilogo dell'anno, Statistiche, DAC7, testi

- **Riepilogo dell'anno** (C-06, G-10): contiene solo i lavori terminati e
  mostra l'importo del documento dato al cliente. L'importo di oggi è a parte
  se è cambiato. Il foglio di calcolo ha in più codice fiscale o partita IVA,
  data d'incasso e ritenuta.
- **Statistiche** (D-11, G-01): il lavoro conta dalla data di "Lavoro
  terminato" del professionista, non dall'ultima modifica. Resta la conferma
  di entrambi, una decisione già presa da Luca. Sotto il numero c'è scritto
  dove trovare i soldi incassati senza la conferma del cliente.
- **DAC7** (C-12): "Li aggiorniamo ogni notte: un lavoro chiuso oggi compare
  qui domani".
- **Fatture e documenti** (G-05, G-09): "passale al tuo commercialista, sono
  costi della tua attività" al posto di "non devi fare nulla", e la spunta
  "Mandagli l'estratto" ora corrisponde a quella che c'è davvero.

## Non toccato

- G-02 (la ricevuta di Stripe dell'abbonamento) non è nel gruppo 2.
- Il bollo sulla copia del forfettario (D-15, parte) resta com'è: chi lo paga
  va proposto a Luca.

**Verifica**: 1035 prove dell'API verdi, con le nuove
`accounting/statements.test.ts` (rimborso, contestazione aperta e persa,
bloccati uguali a "Pagamenti online") e quelle di copia, ricevuta e
riepilogo in `documents-pdf-sdi.test.ts`. Controlli dei tipi di API e sito
verdi, `pnpm lint` verde.
