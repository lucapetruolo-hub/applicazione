# Richiesta a un professionista: la scelta della data come l'agenda del profilo

**Richiesta** (Luca, 18/11/2026): quando il cliente chiede un preventivo a un
professionista scelto, la scelta della data appariva diversa dall'agenda del
profilo pubblico: "perché non visualizzarlo come appare nella schermata
pubblica del professionista?".

**Valutazione** (UX): la griglia a colonne del profilo non va copiata nel
modulo (da telefono 4 colonne, orari su due righe, tanti trattini; per
*scegliere* dentro un modulo l'elenco a giorni è più comodo e più leggibile col
lettore di schermo; lo stesso elenco lo usa il professionista nel preventivo e
in "Proponi un'altra data", decisione di Luca del 10/11,
2026-11-10-date-del-preventivo.md). Le differenze vere erano altre: pillole
bianche contro verde chiaro, settimane da lunedì (un mercoledì la prima pagina
aveva 4 giorni) contro giorni da oggi, giorni vuoti e fasce al completo nascosti,
scritte "18 nov" contro "18 Nov".

**Decisione** (Luca ha detto sì alle proposte 1, 2 e 3):
1. `WeekSlotPicker` con l'aspetto dell'agenda del profilo: pillole verde chiaro
   (`cianografiaVelo`/`cianografiaScuro`, 14px grassetto), sette giorni alla
   volta **da oggi** (non più da lunedì), giorni senza orari con "Nessun
   orario" (come i trattini del profilo), fasce al completo in grigio e non
   cliccabili (prop `fullSlots`, nel modulo del cliente), scritte "Mer 18 Nov".
   Le fasce stanno in colonne uguali (4 in fila da computer, 2 da telefono),
   così lo stesso orario resta incolonnato da un giorno all'altro. Frecce
   "Giorni precedenti"/"Giorni successivi" come nel profilo.
2. Arrivando da un orario cliccato nel profilo, il modulo mostra una scheda
   "Gio 19 Nov · 10:00–11:00 / A domicilio · scelto dall'agenda" con "Cambia"
   (stesse classi della scheda "Chi ti serve"); "Cambia" apre l'elenco. Se
   l'orario sparisce (cambio A domicilio/Online, orario non più libero) torna
   l'elenco e ci resta.
3. Stesso aspetto nel preventivo del professionista e in "Proponi un'altra
   data": arriva da solo, il componente è lo stesso.

Con più professionisti scelti la scelta della data non c'è (nessuna agenda
unica): nulla cambia.

**Verifica**: typecheck e `pnpm lint` di `apps/web` puliti; prova
`e2e/tests/date-preventivo.spec.ts` aggiornata (scritte, 7 giorni, frecce,
scheda con "Cambia"). Foto prima/dopo da telefono e computer nella cartella del
progetto `anteprime/scelta-data/` (le "dopo" con un'agenda di prova a fasce di
un'ora, una al completo).
