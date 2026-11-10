# Giorni cambiati a mano quando si salva "La tua settimana"

**Richiesta** (Luca, 10/11/2026, thread "Gestire le eccezioni quando si salva la
settimana"): "quando si modificano gli orari di disponibilità dell'agenda con
'La tua settimana' i giorni con gli orari precedentemente modificati rimangono
col bollino 'eccezione'". Dopo il salvataggio i giorni cambiati a mano in
"Giorno per giorno" restavano con i vecchi orari e il bollino, e lo diceva solo
una riga in fondo ("I giorni cambiati a mano... restano com'erano").

**Decisione** (proposta da esperto UX, da confermare con Luca)
- Prima di salvare la settimana di tutti i mesi, se ci sono giorni cambiati a
  mano che la settimana nuova cambierebbe, una finestra li elenca ("Hai 2 giorni
  cambiati a mano": data, orari di oggi barrati → orari nuovi, i primi 5 e poi
  "e altri N") con due scelte: **Cambia anche questi** (verde) e **Lasciali
  così**. La X chiude senza salvare. Sul telefono la finestra sale dal basso.
- I giorni con lavori già fissati non si toccano mai, neanche con "Cambia anche
  questi": se ce ne sono, la finestra lo dice in una riga. Neanche i giorni
  chiusi.
- Nessuna finestra quando non ci sono giorni cambiati a mano, per un mese solo
  (§327) o alla prima attivazione della settimana: tutto come prima.
- Un giorno cambiato a mano ma di nuovo uguale alla settimana tipo perde da
  solo il bollino "eccezione": sia salvando la settimana (anche nel giro di ogni
  notte) sia salvando "Giorno per giorno". Prima restava "eccezione" anche con
  gli stessi orari. Vale anche per un giorno salvato per un mese solo che è
  uguale alla settimana: da lì cambia con lei.
- Resta la decisione del §328: nessun tasto "Torna agli orari soliti" sul
  singolo giorno.

**Come**
- `weekTemplateSync` (`packages/shared/src/agendaTools.ts`) restituisce anche
  `manualDays` (giorni cambiati a mano diversi dalla settimana nuova),
  `bookedDaysKept` e `adoptIds` (fasce da riprendere come della settimana);
  con `applyToManual` cambia anche i giorni cambiati a mano.
- `POST /agenda/week-template/preview` fa gli stessi conti senza salvare;
  `PUT /agenda/week-template` accetta `{ template, applyToManual }` (e ancora la
  sola settimana, come prima).
- `weekTemplateDatesKept` riceve la settimana attiva: un giorno con le sue
  stesse fasce resta suo.
- Finestra in `apps/web/src/components/agenda/ManualDaysDialog.tsx`.

**Verifica**
- 5 prove nuove in `apps/api/src/agenda/week-template-sync.test.ts` (elenco,
  "Cambia anche questi", giorno con lavori mai toccato, eccezione uguale che
  perde il bollino, salvataggio di Giorno per giorno).
- Nuova prova nel browser in `e2e/tests/settimana-tipo.spec.ts`; prove
  `agenda*` e `settimana-tipo` verdi in locale da telefono e computer.
- Foto in `agenda/eccezioni-settimana/` della cartella del progetto.
