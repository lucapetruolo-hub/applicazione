# Campi obbligatori del profilo: città bianca ed errore che porta al campo

**Richiesta** (Luca, 19/11/2026, da iPhone sul Profilo pubblico in modifica):
"Città in cui operi" sembrava già cliccata; quando si preme "Salva profilo" e
manca un campo obbligatorio, toccando il messaggio di errore si deve arrivare
a quel campo.

**Decisione**:
- "Città in cui operi" ha il fondo bianco e il bordo degli altri campi
  (`guided-city guided-city-inline`, come la città in Account, §349): prima il
  campo di ricerca dei comuni aveva il fondo grigio del tema di Tamagui e
  sembrava già scelto o spento.
- L'errore del salvataggio sta dentro la riga di "Salva profilo" (`SaveBar`,
  nuove prop `error` e `onErrorPress`), quindi si vede anche quando la riga
  resta attaccata al fondo dello schermo: prima stava in fondo alla pagina e
  chi premeva "Salva" in alto non lo vedeva.
- Se l'errore riguarda un campo del modulo è un pulsante, con "Vai al campo ›":
  scorre fino al campo (morbido, salvo "riduci movimento"), ci mette il
  cursore, l'indice in alto passa da solo alla parte giusta; una prestazione
  chiusa con un prezzo sbagliato si riapre. Gli errori del server restano
  testo semplice.
- Toccando un campo di ricerca (come la città) da telefono, la pagina lo
  porta sotto l'header e anche sotto l'indice del profilo (`data-barra-ferma`
  in `AutocompleteList.web.tsx`): prima il campo finiva coperto dall'indice.
- I controlli seguono l'ordine della pagina (nome, città, mestieri, anni di
  esperienza, prezzi delle prestazioni): se manca più di un campo, l'errore
  porta al primo che si incontra. Prima la città veniva dopo i mestieri.

**Verifica**: `e2e/tests/campi-obbligatori-profilo.spec.ts` (telefono e
computer): città bianca come l'indirizzo; nome e città vuoti, l'errore porta
al nome; poi alla città, con l'errore visibile in fondo allo schermo; poi agli
anni di esperienza, con "Esperienza" attiva nell'indice.

## Secondo giro (migliorie approvate da Luca, 19/11)

- Il campo dell'errore ha il **bordo rosso** (e `aria-invalid`) finché resta
  sbagliato: nome, città, mestieri (riquadro rosso attorno alle tessere),
  anni, prezzo della prestazione.
- **L'errore sparisce da solo** appena il campo è corretto: il messaggio non è
  più salvato come testo ma ricalcolato dal campo (`profileProblem` in
  `apps/web/src/app/dashboard/profilo/page.tsx`). Gli errori del server
  restano finché non si salva di nuovo.
- **"Le mie richieste"**, modifica di una richiesta: la città è bianca con il
  bordo degli altri campi, come nel profilo (prima grigia).

**Verifica**: la stessa prova controlla anche il bordo rosso della città, che
sparisce insieme all'errore appena la città è scritta, e `aria-invalid` sugli
anni.
