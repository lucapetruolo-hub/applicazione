# Giorni cambiati a mano quando si salva "La tua settimana"

**Richiesta** (Luca, 10/11/2026, thread "Gestire le eccezioni quando si salva la
settimana"): "quando si modificano gli orari di disponibilità dell'agenda con
'La tua settimana' i giorni con gli orari precedentemente modificati rimangono
col bollino 'eccezione'". Dopo il salvataggio i giorni cambiati a mano in
"Giorno per giorno" restavano con i vecchi orari e il bollino, e lo diceva solo
una riga in fondo ("I giorni cambiati a mano... restano com'erano").

**Decisione** (proposta da esperto UX, approvata da Luca)
- Prima di salvare la settimana di tutti i mesi, se ci sono giorni cambiati a
  mano che la settimana nuova cambierebbe, una finestra li elenca ("Hai 2 giorni
  cambiati a mano": data, orari di oggi barrati → orari nuovi; con molti giorni l'elenco
  scorre e i pulsanti restano in vista) con due scelte: **Cambia anche questi** (verde) e **Lasciali
  così**. La X chiude senza salvare. Sul telefono la finestra sale dal basso.
- I giorni con lavori già fissati non si toccano mai, neanche con "Cambia anche
  questi": se ce ne sono, la finestra lo dice in una riga. Neanche i giorni
  chiusi.
- Nessuna finestra quando non ci sono giorni cambiati a mano o alla prima
  attivazione della settimana: tutto come prima.
- Un giorno cambiato a mano ma di nuovo uguale alla settimana tipo perde da
  solo il bollino "eccezione": sia salvando la settimana (anche nel giro di ogni
  notte) sia salvando "Giorno per giorno". Prima restava "eccezione" anche con
  gli stessi orari. Vale anche per un giorno salvato per un mese solo che è
  uguale alla settimana: da lì cambia con lei.
- Migliorie approvate da Luca ("si, cura la grafica"):
  - con più giorni ognuno ha la sua spunta (tutti spuntati di partenza),
    "3 di 4 scelti" e "Scegli tutti / Togli tutti"; il pulsante dice quanti
    ne cambia ("Cambia 3 giorni", "Cambia tutti e 4"); un giorno senza spunta
    mostra "resta così". Con un giorno solo, niente spunta: due pulsanti;
  - la stessa domanda anche salvando la settimana per un mese solo
    ("dalla settimana di dicembre 2026");
  - un giorno della settimana tipo rimasto con gli orari di prima per un
    lavoro fissato ora mostra "eccezione" (prima sembrava della settimana).
- Seconda miglioria scelta da Luca ("Effettua seconda miglioria"): chiudendo
  la finestra con la X, sotto la settimana compare "Settimana non salvata.
  Quando vuoi, premi di nuovo "Salva la settimana"", così è chiaro che non è
  cambiato nulla. Non scelta: messaggio verde con i giorni cambiati e lasciati.
- Resta la decisione del §328: nessun tasto "Torna agli orari soliti" sul
  singolo giorno.

**Come**
- `weekTemplateSync` (`packages/shared/src/agendaTools.ts`) restituisce anche
  `manualDays` (giorni cambiati a mano diversi dalla settimana nuova),
  `bookedDaysKept`, `adoptIds` (fasce da riprendere come della settimana) e
  `demoteIds` (fasce rimaste diverse per un lavoro fissato);
  con `applyToManual` cambia anche i giorni cambiati a mano.
- `POST /agenda/week-template/preview` fa gli stessi conti senza salvare;
  `PUT /agenda/week-template` e `PUT /agenda/week-template/month` accettano
  `applyToManual` (`true`/`false` o le date spuntate); il primo accetta ancora
  la sola settimana, come prima. L'anteprima riceve anche il mese.
- `weekTemplateDatesKept` riceve la settimana attiva: un giorno con le sue
  stesse fasce resta suo.
- Finestra in `apps/web/src/components/agenda/ManualDaysDialog.tsx`.

**Verifica**
- 7 prove nuove in `apps/api/src/agenda/week-template-sync.test.ts` (elenco,
  "Cambia anche questi", solo i giorni spuntati, giorno con lavori mai toccato e segnato come eccezione, eccezione uguale che
  perde il bollino, salvataggio di Giorno per giorno).
- Nuova prova nel browser in `e2e/tests/settimana-tipo.spec.ts`; prove
  `agenda*` e `settimana-tipo` verdi in locale da telefono e computer.
- Foto in `agenda/eccezioni-settimana/` della cartella del progetto.
