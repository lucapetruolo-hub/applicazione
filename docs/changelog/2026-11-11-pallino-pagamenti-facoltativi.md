# Pallino sull'icona dell'utente: non per i soli pagamenti online

**Richiesta** (Luca, 11/11/2026): "quando mancano solo i pagamenti online che
sono facoltativi, leva il pallino rosso dall'icona dell'utente in alto a
destra, va bene lasciarlo all'interno del menu".

**Decisione**: in `AccountMenu.tsx` il pallino accanto alla foto in alto a
destra (e la frase "qualcosa da completare" per il lettore di schermo) si
accende solo se c'è qualcosa da fare oltre al passo dei pagamenti online:
agenda vuota o un passo obbligatorio del percorso (dati fiscali, abbonamento,
verifica identità). Il passo facoltativo è `OPTIONAL_JOURNEY_MENU_HREF` in
`SetupJourney.tsx`. Dentro la tendina, nel menu laterale e nella scheda
"Pagamenti" il pallino sulla voce resta, come chiesto.

**Motivo**: il pallino in alto vuol dire "devi fare qualcosa"; per un passo
facoltativo era un falso allarme fisso, che toglie forza ai pallini veri. È
coerente con Oggi, dove il solo passo dei pagamenti resta una riga piccola e
non il riquadro in cima (§334, `2026-11-05-completa-profilo-in-evidenza.md`).

**Verifica**: lint e controllo dei tipi di `apps/web`; prova a mano col
professionista che ha fatto tutti i passi tranne i pagamenti.
