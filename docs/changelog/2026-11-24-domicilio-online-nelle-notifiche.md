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
