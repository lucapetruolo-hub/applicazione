# Richieste archiviate facili da ritrovare

**Richiesta** (Luca, 10/11/2026, thread "Capire come vedere le richieste
archiviate"): "Come fa il cliente o professionista a vedere le richieste
archiviate?". Si trovavano solo da **Filtri** → tendina "Richieste in corso e
terminate" → **Archiviate**: dal collaudo dell'8/11 (E6-17) le schede in vista
erano cinque e "Archiviate" era finita lì dentro, dove nessuno la cerca perché
archiviare non è un filtro. In più "Archivia" faceva sparire la scheda senza
dire dove era andata (il cliente aveva almeno la riga "La ritrovi in
Archiviate" sotto la voce, il professionista no). Proposte cinque migliorie,
Luca: "Effettua tutte e 5 le migliorie".

**Decisione** (uguale per `/le-mie-richieste` e `/dashboard/richieste`, da
telefono e da computer):
1. Dopo "Archivia", per 8 secondi come "Richiesta eliminata", il messaggio
   "Richiesta archiviata." con **Annulla** e **Vedi archiviate**
   (`ArchivedNotice` in `apps/web/src/components/RequestCardPersonalActions.tsx`,
   stesso evento sulla finestra di "Richiesta ripristinata").
2. In fondo all'elenco, solo se ce ne sono, "Hai N richieste archiviate ·
   Vedi" (`ArchivedCountRow`). "Vedi" apre la scheda e riporta in vista le
   schede di stato (senza movimento con "riduci movimento" del sistema).
3. "La ritrovi in Archiviate" sotto "Archivia" anche per il professionista, e
   per il cliente anche quando c'è già un lavoro fissato (la riga ora sta in
   `buildPersonalStateActions`, non più solo in `GuidedRequestCard`).
4. Nei Filtri la tendina ha l'etichetta in vista **Mostra** e la prima voce
   "In corso e terminate" (prima solo `aria-label="Altre richieste"`).
5. **Archiviate** torna sesta scheda sempre in vista; nei Filtri restano
   Annullate e Chiuse. Va contro la scelta del collaudo dell'8/11 (cinque
   schede): Luca ha scelto di farlo sapendolo. Sul telefono la riga delle
   schede scorre con le frecce di `CategoryCarousel`, come prima.

**Verifica**: `e2e/tests/richieste-archiviate.spec.ts` (cliente e
professionista, telefono 390 px e computer 1280 px): scheda in vista, riga
sotto "Archivia", messaggio, Annulla, Vedi archiviate, riga in fondo, tendina
"Mostra" senza "Archiviate", axe senza errori gravi. `pnpm typecheck` e
`pnpm lint` di `apps/web` verdi.
