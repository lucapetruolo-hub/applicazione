# Collaudo, gruppo 1: soldi online e rimborsi

## Richiesta

Luca ha chiesto di fare tutti i gruppi di correzione del collaudo del 29/10
(`/mnt/project-files/collaudo/2026-10-29/riepilogo.md`, piano in
`piano-correzioni.md`). Questo è il gruppo 1, i soldi online e i rimborsi,
con i rilievi del thread sul riordino dell'Admin che toccano gli stessi
punti.

## Decisione

Pagamenti del cliente:

- **I-02** Pagamento doppio dell'acconto: la pagina di pagamento è una sola
  per preventivo (`Quote.depositCheckoutSessionId`, riusata se cifra, modo e
  cliente sono gli stessi). Un secondo pagamento arrivato comunque viene
  registrato una volta sola e rimborsato subito, con l'email "avevi pagato due
  volte".
- **I-01** Acconto sotto 50 centesimi (minimo di Stripe): il preventivo non
  lo offre online e la conferma lo rifiuta.
- **F-01** "Lavoro terminato" solo dal giorno dell'appuntamento, per
  professionista e cliente (come l'Agenda, §311).
- **F-04, F-02, P-05** Cifre giuste prima del bonifico (trattenuta in
  proporzione a quanto pagato); la parte pagata in più del prezzo finale
  torna subito al cliente alla chiusura.
- **F-06, F-09** Testi: la chiusura dice quanto paga il cliente e quanto
  arriva al professionista; un annullamento dice quanto torna; con una
  segnalazione o una contestazione in banca aperte i soldi si dicono "fermi".
- **F-08** Un appuntamento annullato non si riapre se è già passato o se
  l'orario è stato preso.

Segnalazioni:

- **F-03** Rimborso concordato in chat: il professionista propone una cifra,
  il cliente la accetta con un tocco, il rimborso parte da Stripe e la
  segnalazione si chiude.
- **F-20** Le righe automatiche della chat non contano come risposta del
  professionista; la proposta di rimborso sì.
- Quando una segnalazione passa al nostro team o arriva un ricorso, gli admin
  ricevono un avviso. Con un solo admin il ricorso lo può decidere lui.

Admin (riordino):

- Rimborsi: la conferma è una finestra con cifra, nome del cliente e del
  professionista, motivo obbligatorio e pulsante col nome dell'azione
  ("Rimborsa 50 €"). Il rifiuto arriva a chi l'aveva chiesto col motivo
  (`JOB_REFUND_REJECTED`). Se Stripe sbaglia dopo "Approva" il rimborso torna
  da decidere; due tocchi insieme rimborsano una volta sola.
- Segnalazioni: le percentuali di rimborso mostrano anche gli euro;
  "Accogli" e "Respingi" chiedono conferma in una finestra che dice misura,
  rimborso in euro e a chi. La finestra (`CancelBookingModal` con
  `noteMinLength`) è quella da riusare per le altre azioni pericolose
  dell'Admin.
- La scadenza delle prove di una contestazione in banca è in evidenza sulla
  scheda da preparare (in rosso negli ultimi 3 giorni).
- "Pagamenti online" del professionista: i soldi contestati in banca non sono
  più tra i "Bloccati" (come nell'estratto del gruppo 2) e compaiono a parte.

Restano aperti, in attesa di Luca: P-02 (anticipo massimo) e P-04 (giorni dei
soldi fermi). F-21 e G-14 (cifre dei bonifici) servono i dati di Stripe.

## Verifica

Test nuovi: `issue-refund-agreement.test.ts`, `refund-decision.test.ts`,
`job-issue-chat-reply.test.ts` e casi in `online-limit-completion`,
`destination-charges`, `direct-charges`, `online-payments`. Tutta la suite
API, typecheck del sito e `pnpm lint` passano.
