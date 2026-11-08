# Rubrica "I miei clienti" (08/11/2026)

**Richiesta** (collaudo prima del lancio dell'08/11, funzione nuova n. 7,
`collaudo/2026-11-08/esperto-E10-prodotto.md`; "sì" di Luca a tutte tranne la
n. 12): una rubrica del professionista con i clienti del sito e dei lavori
esterni, storico, note e "Proponi una data". È il motivo per restare
(CLAUDE.md §7.4: la retention viene dal gestionale).

**Decisione**

- Pagina `/dashboard/clienti`, voce "I miei clienti" nel gruppo "Lavoro" della
  tendina dell'account (non nella colonna laterale, che ha già 7 icone più
  "Da completare", massimo 8, §334).
- Clienti del sito solo con almeno un lavoro accettato e non annullato
  (CLAUDE.md §5 punto 9) e mai chi ha chiuso l'account. Clienti dei lavori
  aggiunti in Agenda raggruppati per telefono (ultime 9 cifre), altrimenti per
  nome; il nome mostrato è quello scritto più per intero.
- Ogni scheda: lavori terminati, ultimo lavoro, totale incassato (importo
  finale sul sito, prezzo scritto per gli esterni), prossimo appuntamento in
  evidenza; "Chiama", "Storico e nota" (contatti, storico con "Apri" verso la
  scheda del lavoro o l'Agenda, nota privata fino a 2000 caratteri).
- "Proponi una data" per i clienti del sito: si scelgono giorno e ora e il
  messaggio si prepara nella chat dell'ultimo lavoro, con il link per
  chiedere il preventivo al professionista (`/preventivo?professionista=…`,
  lo stesso di "Prenota di nuovo"). Lo manda il professionista: nessun
  invio automatico e nessuna prenotazione creata dal sito (§5.18).
  Per i clienti esterni "Aggiungi un lavoro" apre il modulo dell'Agenda già
  compilato con nome, telefono e indirizzo.
- Ricerca per nome, telefono (anche senza spazi) o via; filtri "Dal sito" e
  "Aggiunti da te" solo quando ci sono entrambi.
- Nota: tabella `professional_client_notes` (migrazione
  `20261108220000_rubrica_clienti`), chiave `u:<account>` o `e:<telefono o
  nome>`; si salva solo per un cliente della propria rubrica. Rotte
  `GET /professional-clients/me`, `PUT /professional-clients/me/note`.
- Date lette in UTC come in tutta l'agenda (ora italiana scritta come UTC).

**Verifica**: `client-book.test.ts` (contatti solo dopo l'accettazione, account
chiusi esclusi, stesso numero = stesso cliente, ordine),
`professionalClients.test.ts` in shared, `e2e/tests/rubrica-clienti.spec.ts` su
telefono e computer (cliente non accettato escluso, ordine, ricerca, storico,
nota salvata, messaggio pronto in chat, modulo dell'Agenda compilato), axe
senza errori gravi.
