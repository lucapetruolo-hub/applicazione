# Orari scritti due volte su iPhone

**Richiesta** (Luca, 09/11/2026, foto da Safari su iPhone): in Agenda, nella
finestra della fascia di venerdì 13 novembre, gli orari si leggevano
"08:0008:00" e "13:0013:00" dentro due riquadri grigi che sembravano spenti.

**Causa**: `ItalianTimeInput` (e `ItalianDateInput`, stesso schema) lasciano il
campo nativo per il selettore del telefono e scrivono sopra l'ora in italiano.
Il testo nativo era nascosto con `color: transparent`, ma il colore passato nello
stile in linea dalla pagina lo sovrascriveva; e Safari per iPhone scrive il
valore in `::-webkit-date-and-time-value`, non in `::-webkit-datetime-edit`.
L'aspetto nativo di iOS dava anche il grigio e una larghezza maggiore di quella
chiesta (i due riquadri si toccavano e coprivano il trattino).

**Decisione**: il colore va solo al testo scritto sopra; il campo nativo ha
`appearance: none`, testo trasparente (`-webkit-text-fill-color`) e
`::-webkit-date-and-time-value` nascosto, con un'altezza minima perché il campo
vuoto non si schiacci. Vale per tutti i campi ora e data del sito (Agenda,
settimana tipo, lavoro esterno, preventivi, richieste, "I miei clienti").

**Verifica**: lint e typecheck di `apps/web`; in Chromium (telefono e computer)
il campo resta uguale, con l'icona dell'orologio. in più la prova
nuova con WebKit qui sotto. Prova su iPhone vero dopo l'unione.

## Migliorie approvate da Luca (stesso giorno)

**Prova con il motore di Safari nei controlli**: nuovo progetto Playwright
`iphone-safari` (WebKit, iPhone 14) e nuovo giro `agenda-browser (iphone-safari)`
nella CI, che installa WebKit invece di Chromium. Gira solo
`e2e/tests/iphone-campi-orario.spec.ts`: nella finestra della fascia e in
"Aggiungi un tuo lavoro" il testo del campo nativo deve essere trasparente,
senza aspetto nativo, il campo non deve uscire dal suo riquadro e inizio e
fine non si devono sovrapporre. Provata in locale: con il codice di prima
fallisce (colore del testo nativo visibile), con la correzione passa. WebKit
per Linux non è identico a Safari per iPhone, ma controlla le stesse regole.

**Passi da 15 minuti** negli orari della fascia (`step={900}`), come nella
settimana tipo: nel selettore di Chrome e Android i minuti vanno a 00, 15,
30, 45. Safari per iPhone ignora il passo e mostra tutti i minuti; un orario
scritto a mano resta comunque valido (nessun modulo che lo blocchi).
