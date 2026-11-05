# Prova "carta chiusa a metà" stabile

**Richiesta**: Luca, 05/11 ("si entrambe le migliorie"): rendere stabile la
prova `e2e/carta/iscrizione-carta.spec.ts` "pagina della carta chiusa a metà",
che ogni tanto falliva da sola nel job `iscrizione-carta`, trovando la causa
vera, senza rilanciarla né saltarla e senza indebolire i controlli.

**Cosa c'era davvero** (due cause diverse):

1. **PR #245, giro del 05/11**: due tentativi su due falliti. La registrazione
   della prova mostra che, dopo il clic sul link "indietro" di Stripe, il
   browser di prova (Chrome senza finestra 156) apre il nostro sito in una
   scheda larga e alta 0 che non disegna più nulla: la pagina c'è tutta, con
   "Non hai finito di aggiungere la carta", ma ogni testo risulta "non
   visibile". La correzione del 02/11 (`keepPhoneScreen`, rimettere le misure
   del telefono con `setViewportSize`) non bastava: nella registrazione la
   scheda resta 0x0 anche dopo. Non è un difetto del sito (un browser vero ha
   sempre una finestra) e in locale, con lo stesso Chrome e una vera pagina
   Stripe di prova, non si ripete. In quel giro il clic partiva mentre Stripe
   stava ancora caricando i suoi riquadri.
2. **Ramo principale, giro del 05/11 mattina**: la prova non è nemmeno partita.
   Lo scaricamento della Stripe CLI da GitHub era arrivato rotto ("gzip: stdin:
   not in gzip format") e `curl | tar` non riprovava.

La sandbox Stripe condivisa con il sito di prova (proposta di un'altra sandbox
nel thread "Provare il sito come un nuovo utente") non c'entra con questi due
errori: il primo è del browser, il secondo dello scaricamento.

**Decisione**:

- La prova torna indietro solo con la pagina di Stripe pronta (modulo della
  carta mostrato), come farebbe una persona; stessa attesa già usata prima di
  scrivere la carta (`waitCheckoutReady`).
- In più controlla che il link "indietro" di Stripe porti esattamente al
  nostro `cancel_url` (`/dashboard/abbonamento?annullato=1`).
- `keepPhoneScreen` tolta (non funzionava). Al suo posto `pageWithScreen`: se
  la scheda resta larga 0 per 5 secondi, la prova apre lo stesso indirizzo in
  una scheda nuova con lo stesso accesso e lì fa gli stessi controlli
  (messaggio e pulsante "Attiva i mesi gratis", poi il database). Lo scrive
  nel resoconto della prova ("scheda 0x0 al ritorno… riaperta"), così si vede
  quante volte capita.
- CI: la Stripe CLI si scarica prima in un file con `curl -f --retry 4`, poi
  si apre con `tar`.

**Verifica**: `tsc` di `e2e` verde; `pageWithScreen` provata a parte con una
scheda che dice di essere larga 0 (riaperta, messaggio visibile, annotazione
scritta) e con una scheda normale (resta la stessa). La prova intera gira solo
in CI con la chiave Stripe di prova.

## Migliorie (Luca, 05/11: "effettua le migliorie che ritieni")

- **Stessa protezione sulle altre prove che tornano da Stripe** (4242, 3155,
  0341): `backOnSite` aspetta l'indirizzo di ritorno (`?attivato=carta`) e poi
  passa da `pageWithScreen`; i controlli (messaggio, database, Stripe) sono
  gli stessi di prima.
- **Impronta dei programmi scaricati nei controlli**: Stripe CLI (CI),
  osv-scanner e gitleaks (Sicurezza) si scaricano in un file e si controllano
  con `sha256sum -c` contro l'impronta presa dai file ufficiali della versione
  (`stripe-linux-checksums.txt`, `osv-scanner_SHA256SUMS`,
  `gitleaks_8.21.2_checksums.txt`): se il file non è quello pubblicato il job
  si ferma. Cambiando versione si aggiorna anche l'impronta. Anche osv-scanner
  e gitleaks riprovano fino a 4 volte.
