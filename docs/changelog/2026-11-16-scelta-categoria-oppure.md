# Scelta della categoria: "Oppure: …" sotto la categoria suggerita

**Richiesta** (Luca, 16/11/2026, thread "Modernizzare la scelta della
categoria"): "Effettua la prima miglioria", cioè due pillole "Oppure: …"
sempre visibili sotto la scheda suggerita (seguito di
`2026-11-16-scelta-categoria-migliorie.md`).

**Decisione**:
- Con un solo mestiere nella scheda, sotto compare "Oppure:" con i due
  mestieri con cui si confonde più spesso (`CATEGORY_ALTERNATIVES` in
  `packages/shared/src/categories.ts`, per esempio Idraulico → Climatizzazione
  e caldaie, Muratore e ristrutturazioni). Un tocco sostituisce il mestiere
  della scheda, senza aprire "Cambia". Mai uno già in "Può servire anche";
  se ne manca uno si prende il più cercato.
- Bordo pieno e icona piccola: sostituisce. Il "+ Fabbro" di "Può servire
  anche" resta tratteggiato: aggiunge una richiesta.
- Con due o tre mestieri scelti niente "Oppure" (non si capirebbe quale
  sostituisce).

**Motivo**: la scheda unica nasconde le alternative, e chi non si accorge
dell'errore non apre "Cambia". Le due più probabili in vista correggono
l'errore più comune con un tocco.

**Verifica**: `e2e/tests/richiesta-preventivo.spec.ts` ("Oppure: due mestieri
sempre in vista…", telefono e computer): due pillole, il tocco sostituisce e
l'Oppure si aggiorna. Foto `7-suggerita-con-oppure-*` e
`8-suggerimento-nel-dubbio-*` in `anteprime/scelta-categoria/dopo/` del progetto.
