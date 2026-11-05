# Anteprima del professionista sulla mappa come su miodottore.it

**Richiesta** (Luca, 05/11/2026, con la foto dell'anteprima di miodottore.it):
migliorare la scheda che compare toccando un professionista sulla mappa.

**Decisione** (`MapPreview` in `apps/web/src/components/ResultsMap.tsx`), su
telefono e computer:
- foto verticale arrotondata (64×85, come le schede della lista), nome in
  grassetto con la spunta "Verificato" (il fumetto di sempre), mestieri, città
  e distanza su una riga, cinque stelle con voto e numero di recensioni
  ("Nessuna recensione ancora" se non ce ne sono);
- sotto una riga sottile, "Primo orario libero: Oggi 5 nov" (o Domani, o il
  giorno della settimana) nella modalità cercata, con i primi due orari e
  "Altro". Un orario apre la richiesta di preventivo già compilata, lo stesso
  indirizzo delle schede della lista (`slotHref` in `ResultsListWithMap.tsx`);
  "Altro" apre il profilo sull'agenda di quel giorno. Senza orari: "Nessun
  orario libero nei prossimi giorni";
- toccando il resto si apre il profilo (con i parametri della ricerca, come
  dalla lista); da tastiera il nome è un link vero;
- angoli 20px, ombra più morbida, larga al massimo 440px, X in alto a destra.

**Verifica**: `next build` + `next start` con API e Google Maps finti
(Playwright, iPhone 13 e 1280×800): anteprima con foto, spunta, stelle, orari
di oggi e di domani; il tocco su "09:00" apre
`/preventivo?…&data=…&fasciaOraria=09:00-10:00&modalita=HOME…`.
