# Il professionista vede come paga il cliente, e il nome dell'account nei "Dettagli cliente"

**Richiesta** (Luca, 19/11/2026): "nella finestra del professionista di quando
un cliente accetta il suo preventivo, indicagli anche che metodo di pagamento
ha accettato il cliente". Poi: "in dettaglio cliente, quando il nome nel
preventivo è diverso dall'account, dove ora c'è il nome cliccabile lì sempre il
nome account, e poi sotto l'altro nome non cliccabile con nome sulla richiesta".

**Decisione**:
- Popup ed elenco delle notifiche ("Il cliente ha accettato il tuo
  preventivo"): in coda una frase corta col tipo di pagamento: "Ti paga
  direttamente", "Paga online con la carta: acconto già pagato", "Acconto già
  pagato online, il resto lo paga a te", "Ha già pagato tutto online con la
  carta". Con l'acconto online il lavoro nasce solo a pagamento riuscito
  (§240), quindi "già pagato" è vero quando il professionista lo legge.
- Email "Preventivo accettato": riga "Pagamento" nel riquadro, con le cifre
  del preventivo (es. "Acconto di 40,00 € già pagato online con la carta. Il
  resto (160,00 €) online con la stessa carta a lavoro finito").
- Mai le cifre della carta del cliente al professionista: solo il tipo.
- Un solo testo, `acceptedPaymentForPro` in `packages/shared/src/onlinePayments.ts`;
  l'API lo mette nella notifica (`paymentMethod`, `paymentShort`, `paymentLine`).
  Le notifiche già arrivate prima restano com'erano (niente riga).
- "Dettagli cliente" (Richieste e lavori): il nome in grassetto con la freccia
  è sempre quello dell'account e apre il suo profilo; se nella richiesta c'è
  un altro nome (chi riceve il professionista), sotto c'è "Nome sulla
  richiesta: …", non cliccabile. Prima in grassetto andava il nome della
  richiesta e sotto "Richiesta dall'account di …"
  (`2026-11-18-dettagli-cliente-chiari.md`): Luca preferisce il contrario.
  Stesso nome con maiuscole o spazi diversi = nessuna riga in più.

**Secondo giro** (sì di Luca alle migliorie):
- Popup, notifiche ed email: in testa il nome dell'account ("Marco Verdi ha
  accettato il tuo preventivo"); nell'email il nome scritto nella richiesta
  va in una riga a parte "Nome sulla richiesta", solo se diverso. Prima il
  popup diceva il nome della richiesta.
- Agenda, pannello dell'appuntamento: titolo col nome dell'account, sotto
  "Nome sulla richiesta: …" se diverso. Nel calendario le caselle restano col
  nome di chi riceve il professionista (non richiesto).
- La riga del pagamento nel riquadro "Preventivo accettato" resta al thread
  del collaudo (conto a righe).

**Verifica**: prova `e2e/tests/pagamento-scelto-al-pro.spec.ts` (telefono e
computer: popup con "Ti paga direttamente", nome dell'account cliccabile e
"Nome sulla richiesta", anche nel pannello dell'Agenda), test di `acceptedPaymentForPro`, dell'email e della
notifica in `bookings.service.test.ts`. Foto in
`anteprime/pagamento-scelto-al-pro/` della cartella del progetto.
