# "Serve cambiare?": pulsanti al posto dei link sottolineati

**Richiesta** (Luca, 24/11/2026, con una foto della scheda del lavoro fissato):
"quei tre tasti, Proponi un'altra data, Scrivi un messaggio, Annulla il lavoro,
non sono uniformati agli altri".

**Decisione**: nella scheda del cliente (`ChangeLinks` in
`apps/web/src/app/le-mie-richieste/_components/BookingSection.tsx`) i tre link
sottolineati diventano pulsanti a pillola piccoli (`CardButton compact`), con
bordo e senza riempimento; "Annulla il lavoro" (o "Salta questa volta") per
ultimo, con testo e bordo rossi. Le frasi sul preavviso restano sotto. Scartato
lo spostamento nel menu tondo della scheda: chi deve spostare o annullare non
li troverebbe.

**Motivo**: erano gli unici link sottolineati della scheda; nella scheda del
professionista le stesse azioni sono già pulsanti `CardButton`, quindi lì non
cambia nulla e ora le due schede sono uguali.

**Verifica**: prove `preventivo-accettato`, `sposta-e-terminato-in-anticipo`,
`lavori-ricorrenti`, `schede-lavoro` e `voci-prezzo-colonna` verdi in locale su
telefono e computer; foto in
`/mnt/project-files/anteprime/serve-cambiare-pulsanti/`.
