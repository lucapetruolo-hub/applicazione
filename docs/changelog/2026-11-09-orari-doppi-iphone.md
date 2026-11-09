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
il campo resta uguale, con l'icona dell'orologio. Safari per iPhone non si può
avviare qui: prova su iPhone vero dopo l'unione.
