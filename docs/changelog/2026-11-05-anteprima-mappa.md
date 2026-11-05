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

## Le tre migliorie (Luca, 05/11/2026: "effettua le 3 migliorie")

- **Segnaposto evidenziato**: il segnaposto dell'anteprima aperta diventa
  pieno di verde, un po' più grande, con un alone, e sta sopra gli altri.
- **Cuoricino "Salva" sulla foto**, lo stesso delle schede della lista
  (`renderSave`; per chi non è entrato porta all'accesso come nelle schede).
- **Scorrere da un professionista all'altro**: col dito verso sinistra o
  destra sull'anteprima (da telefono), con le frecce accanto a "2 di 6" sui
  computer col mouse. Si scorre solo tra chi si vede nella mappa, nell'ordine
  della lista; l'anteprima entra dal lato giusto (niente movimento con "riduci
  movimento" attivo).

**Verifica**: stessa prova con Playwright: segnaposto evidenziato (1),
scorrimento col dito da "Rossi Impianti 1 di 8" a "Idraulica Bianchi 2 di 8"
senza aprire il profilo, freccia su computer da "Termo Verdi" ad "Acqua Sicura
4 di 9", cuoricino che porta all'accesso con `salva=` come nelle schede.

## Scheda segnata in lista (Luca, 05/11/2026: "miglioria due sì, ma in modo leggero")

Da computer, con l'anteprima aperta sulla mappa, la scheda dello stesso
professionista nella lista ha un bordo verde sottile (2px, `.results-card.map-selected`
in `ResultsListWithMap.tsx`). La pagina non scorre da sola; il bordo sparisce
quando si chiude l'anteprima e segue lo scorrimento tra i professionisti.
Da telefono la lista è sotto la mappa a schermo intero, quindi niente.

**Verifica**: Playwright a 1280×800: una scheda segnata al tocco sul
segnaposto, pagina ferma alla stessa altezza, nessuna scheda segnata dopo la X.
