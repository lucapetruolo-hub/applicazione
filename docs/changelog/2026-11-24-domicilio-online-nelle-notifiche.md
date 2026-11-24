# A domicilio o online nelle notifiche delle richieste

**Richiesta** (Luca, 24/11/2026, durante la prova con la carta 4242, foto del
pannello Notifiche): "Le nuove richieste devono specificare se si tratta di
online o domicilio", e "controllare anche nelle e-mail". Le fasce dell'agenda
sono separate (4 a domicilio e 4 online): il professionista deve capirlo prima
di aprire la richiesta.

**Decisione**:
- Funzione comune `jobPlaceLabel` in `packages/shared/src/jobPlace.ts`:
  "Idraulico a domicilio a Marcianise" oppure "Idraulico online" (online la
  città non si scrive: il lavoro non si fa lì). Senza il tipo, le notifiche di
  prima restano col testo di sempre.
- **Nuove richieste** (`NEW_LEAD`, tutti e 5 i punti di invio in
  `guided-requests.service.ts`): il tipo entra nel dato della notifica
  (`serviceMode`). Campanella e popup: "Richiesta urgente solo per te: Idraulico
  a domicilio a Marcianise". Email: lo stesso nell'oggetto (quindi anche nel
  riassunto della sera e del mattino), nel testo e una riga in grassetto
  "**Dove:** a casa del cliente, a Marcianise." / "**Dove:** online, a
  distanza: non devi andare dal cliente."
- **Preventivo accettato** (`QUOTE_ACCEPTED`): campanella "ha accettato il tuo
  preventivo (a domicilio) · ..." tra parentesi, perché "online" da solo si
  confondeva con "Paga online"; email con la riga "Dove: A domicilio/Online" nel
  riquadro (online il "Lavoro" non porta più la città).
- **Lavori cercati** (`BOARD_NEARBY`, `BOARD_CLAIM_ARRIVED`, solo sul sito):
  stessa forma tra parentesi.
- **Push e WhatsApp**: le notifiche push non ci sono ancora (Expo Push
  rimandato con l'app); le nuove richieste non vanno su WhatsApp per la regola
  di `CLAUDE.md` §5 punto 13 (un tipo nuovo va approvato da Meta e si paga a
  ogni invio): nessun cambio lì.

**Verifica**: prove `packages/shared/src/jobPlace.test.ts` e
`apps/api/src/email/templates/new-lead-email.test.ts` (oggetto, testo e riga
"Dove" per domicilio, online e senza tipo; riquadro del preventivo accettato);
typecheck di API e sito. Foto prima/dopo della campanella (computer e
telefono, sito acceso in locale con il database) e delle email in
`anteprime/domicilio-online-notifiche/` della cartella del progetto.

## Secondo giro (24/11, "sì" di Luca alle tre migliorie e a "Da rispondere ora")

- **Oggetto dell'email "preventivo accettato"**: "Il cliente ha accettato il
  tuo preventivo · Idraulico a domicilio" (o "online"); senza il tipo resta
  quello di prima.
- **Icona nella campanella e nel popup**: casa per un lavoro a domicilio,
  videocamera per uno online (le stesse dei filtri della ricerca), al posto
  dell'icona dell'argomento, per nuove richieste, preventivo accettato e Lavori
  cercati (`notificationTopicStyle.ts`).
- **Riepilogo della sera su WhatsApp**: ogni lavoro dice "a domicilio a
  Latina" oppure "online" (`whatsappJobWhere`). Cambia solo la variabile, non
  il testo del modello da far approvare a Meta; aggiornati gli esempi in
  `docs/whatsapp-modelli.md`. Il comune resta entro i 30 caratteri dei nomi
  anche dopo "a domicilio a ".
- **"Da rispondere ora" in Oggi**: titolo "Idraulico a domicilio · Marcianise"
  o "Idraulico online" (con la zona se il cliente l'ha scritta) e una riga
  "Ricevuta oggi alle 11:52 · Per gio 26 nov, 08:00–13:00" (o "Per questa
  settimana", "Con calma, senza fretta"; l'urgente ha già il bollino).
- **Scheda della richiesta online senza città** (foto di Luca): niente più
  "Idraulico ·" né "Zona: (indirizzo nascosto)" vuoti. Online la zona si
  mostra solo se il cliente l'ha scritta, senza "(indirizzo nascosto)": online
  non c'è un indirizzo da nascondere.
- Chiesto in un lavoro a parte: "Clienti per orario" separato tra domicilio e
  online nell'agenda.

**Verifica**: prove WhatsApp (`whatsapp-rules.test.ts`, 63 passate) ed email
(79 passate); typecheck e lint del sito; foto prima/dopo di Oggi, della scheda
online e della campanella con le icone (computer e telefono) in
`anteprime/domicilio-online-notifiche/`.
