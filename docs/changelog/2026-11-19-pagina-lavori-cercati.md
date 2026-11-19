# Pagina "Lavori cercati" con tutti i mestieri e tre collegamenti

**Richiesta (Luca, 19/11/2026):** "ma non è ancora raggiungibile dalla
homepage?". La bacheca (`docs/changelog/2026-11-18-bacheca-cliente.md`) si
raggiungeva solo dal fondo di "Offri i tuoi servizi", con i soli mestieri del
sito: gli 8 lavori che il sito non ha (antennista, vetraio, spurghi…) non
avevano nessun link. Sulla scheda Luca ha scelto "Sì, pagina e tre
collegamenti".

**Cosa cambia**
- Nuova pagina `/lavora-con-noi` "Lavori cercati": tutti i mestieri del sito e,
  a parte, "Lavori che nessuno fa ancora sul sito", con accanto quante
  richieste aspettano (da `GET /request-board/summary`), l'interruttore
  dell'email del lunedì e l'iscrizione.
- Collegamenti: piede del sito ("Per i professionisti" → "Lavori cercati"),
  riga dei mestieri in fondo a "Offri i tuoi servizi" ("Altri lavori
  cercati"), menu "Il mio account" del professionista (gruppo "Lavoro", non
  nella colonna laterale che resta a 7 voci).
- Briciole di pane delle pagine per mestiere e provincia con "Lavori cercati";
  la pagina nella sitemap (vuota finché il sito è privato).

**Motivo:** chi fa un mestiere che il sito non ha ancora deve poter trovare
le richieste che lo aspettano, che sono quelle che entrano subito in bacheca.

**Verifica:** typecheck e lint del sito, foto da telefono della pagina con e
senza richieste.
