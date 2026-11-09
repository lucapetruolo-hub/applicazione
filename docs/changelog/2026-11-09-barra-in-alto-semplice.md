# Barra in alto più semplice (09/11/2026)

**Richiesta di Luca:** "non pensi sia un po' confusionaria lì in alto a destra?"
(pagina dei risultati su computer: A domicilio/Online, "Cosa ti serve?",
"Città", "Cerca", email dell'account con tendina e "Richiedi preventivo"
tutti in fila, con due pulsanti verdi uno accanto all'altro).

**Decisione (scelta di Luca sulla proposta con prima/dopo):**

1. Ricerca della barra in alto (`SearchBar` compatta, solo pagine `/cerca`)
   in una sola pillola bianca: "A domicilio ▾" a sinistra, che apre un
   piccolo elenco A domicilio / Online (frecce e Invio da tastiera, Esc o
   clic fuori per chiudere), poi "Cosa ti serve?", "Città" e una lente verde
   tonda al posto del pulsante "Cerca". Sotto i 1281 px il modo resta solo
   icona, come prima (§349), e i campi si stringono.
2. Account (`AccountMenu`): solo la foto o l'iniziale con la freccina, in un
   piccolo riquadro tondo, su tutte le pagine. Il nome resta per il lettore
   di schermo e in testa alla tendina. Da telefono solo il tondino (a 320 px
   la riga non ci stava).
3. Un solo pulsante verde con la scritta, "Richiedi preventivo"; nella
   ricerca senza risultati non compare, perché nella pagina c'è già "Invia
   la richiesta" (`body:has(.empty-search-results)` in `globals.css`).

**Verifica:** foto a 320, 375, 390, 1024, 1280 e 1440 px, con e senza
accesso, con e senza risultati: nessuno scorrimento orizzontale, nessuna
sovrapposizione tra pillola, campanella e account.

## Secondo giro (stesso giorno, richieste di Luca)

- Il tondino dell'account va **per ultimo in fondo a destra**, dopo
  "Richiedi preventivo", ed è più grande (38 px, riquadro da 46 px): lo
  schema di Airbnb, la tendina si apre sotto il bordo destro.
- "Servizi" nel menu della home con la stessa freccina sottile della barra e
  alla stessa misura delle altre voci (prima 14 px contro 16 px).
- Da telefono, nella pagina dei risultati, la casella "Tutti i professionisti"
  diventa la stessa pillola: icona del modo a sinistra, lente verde a destra
  al posto della scritta "Modifica", su fondo bianco come la barra.

Verifica: foto a 320, 390, 1024 e 1440 px, con la tendina aperta; nessuno
scorrimento orizzontale.
