# Admin: protezioni sulle azioni pericolose e contatti in chat

**Richiesta**: terza PR del riordino dell'Admin approvata da Luca il 30/10/2026
("Protezioni", `analisi/admin-riordino/analisi-e-proposta.md` §8); il 02/11/2026
Luca ha chiesto anche un controllo dei messaggi in chat all'invio e ha scelto
"Bloccare per tutti".

**Decisione**:
- **Contatti in chat** (`TimelineService.addUpdate`,
  `chatContactKind`/`chatContactBlockedMessage` in
  `packages/shared/src/adminSignals.ts`): prima che il cliente accetti un
  preventivo di quel professionista (nessuna `Booking` della coppia), un messaggio
  con telefono, email, link o "WhatsApp" non parte, per il cliente e per il
  professionista. Il controllo è sul server, così vale anche per l'app; il sito
  mostra la riga "I contatti si scambiano dopo l'accettazione del preventivo:
  togli il numero di telefono per inviare il messaggio." e lascia il testo nel
  campo. Dopo l'accettazione la chat è libera. Stesso principio di CLAUDE.md §5
  punto 9. Il controllo del mattino sugli account sospetti resta per chi aggira.
- **Finestra unica di conferma** (`apps/web/src/components/admin/AdminConfirmModal.tsx`,
  sopra `CancelBookingModal`): dice cosa succede prima del clic.
  - Ruoli di amministratore: motivo obbligatorio (minimo 10 caratteri,
    `adminActionReasonSchema`), anche sul server, nel registro azioni.
  - Chiudere una zona delle richieste generali: motivo obbligatorio, nel
    registro e nella riga della zona ("Chiusa a mano: …").
  - DAC7 "Segna come inviato" (non si annulla, fa partire l'avviso a ogni
    professionista): conferma con il numero di protocollo della ricevuta
    dell'Agenzia delle Entrate (miglioria scelta da Luca il 02/11/2026), salvato
    sul periodo (`submissionProtocol`, migrazione `20261102120000_dac7_protocollo`),
    mostrato in tabella e nel registro come prova dell'invio.
  - "Rimanda avviso ai professionisti": conferma.
  - "Emetti le fatture del mese" e "Rimanda"/"Rigenera" allo SdI: conferma.
- **Registro azioni**: anche DAC7 segnato come inviato, avviso rimandato,
  fatture emesse a mano e fattura rimandata allo SdI, con chi l'ha fatto
  (`audit-label.ts`).
- **Promemoria**:
  - DAC7: il 10, 20, 27 e 30 gennaio, se l'anno prima non è segnato come
    inviato e qualcuno ha compensi, notifica ed email alla Finanza
    (`ADMIN_DAC7_DUE`, `Dac7Service.remindAnnualDeadline`). In "Da fare" la riga
    "DAC7 … da inviare" con scadenza 31 gennaio, e gli anni da correggere.
  - Fatture ferme allo SdI (`apps/api/src/accounting/sdi-stuck.ts`): non
    partite dopo un giorno o inviate da più di 5 giorni senza esito. Solo con
    l'invio allo SdI acceso. Ogni lunedì alle 8 notifica alla Finanza e riga in
    "Da fare".

**Verifica**: test unitari (contatti bloccati per tutti e due e liberi dopo
l'accettazione, promemoria DAC7 con i giorni che mancano e senza avviso se già
inviato o senza compensi, ruoli con il motivo); `e2e/tests/admin-protezioni.spec.ts`
su telefono e computer (numero bloccato in chat e testo rimasto nel campo, poi
libero dopo l'accettazione; ruoli e chiusura di una zona con conferma, motivo
obbligatorio e registro); `admin-persone`, `admin-da-fare`, `admin-due-passaggi`
verdi.
