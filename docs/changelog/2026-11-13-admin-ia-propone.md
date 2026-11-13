# Admin: l'IA propone la decisione in ogni caso, con Approva e Modifica

**Richiesta** (Luca, 13/11/2026, thread "Automatizzare l'admin e semplificare
le scritte"): seconda PR della proposta approvata
(`/mnt/project-files/analisi/admin-automatico/proposta.md`). Dopo il banco dei
40 casi (`/mnt/project-files/analisi/admin-automatico/banco/esito-banco-ia.md`:
l'IA alla cieca era d'accordo con la prima scelta di Luca in 21 casi su 30 e
con la sua scelta finale in 26 su 30) Luca ha approvato quattro cose: le regole
uscite dalle sue risposte nelle istruzioni dell'IA, "Chiedi all'autore di
correggere" anche per le recensioni, "già avvisato N volte" nel caso, le bozze
di risposta ai messaggi con i percorsi veri dei pulsanti. Poi due decisioni:
"io direi di dare sempre il suo punto di vista, con i pulsanti per approvarlo
o modificarlo" (niente periodo in ombra né soglia del 95%) e "fai dare anche
la valutazione sui soldi, tanto poi decido sempre io, l'IA però deve conoscere
le nostre linee guida e regole".

**Decisione**
- Nuova tabella `admin_case_advice` (migrazione solo additiva
  `20261113170000_ia_propone_casi`, che aggiunge anche
  `reviews.correctionRequestedAt`): una proposta per caso con decisione,
  motivo, regola, spiegazione per l'autore o bozza, e, a caso chiuso, la
  decisione dell'admin e se era la stessa.
- `CaseAdviceService` (`apps/api/src/admin/case-advice.service.ts`): ogni 10
  minuti (`@ScheduledJob`) chiede a Claude Haiku una proposta per ogni caso
  aperto che non ce l'ha, al massimo 20 per giro. Spento senza
  `ANTHROPIC_API_KEY`: le pagine funzionano come prima. I testi passano da
  `anonymizeProblemText` e sono trattati solo come dati.
- Casi: segnalazioni di contenuti (con quante decisioni ci sono già state
  contro l'autore), richieste di rivedere una segnalazione, recensioni
  trattenute, messaggi dal sito (solo una bozza, mai inviata da sola: "Copia
  la risposta" o "Scrivi l'email"), e i casi di soldi: problemi sul lavoro
  da decidere, richieste di rivederli, rimborsi chiesti, contestazioni di un
  pagamento e, con il sì di Luca alla miglioria proposta, contestazioni in banca ("manda le prove" o "non mandarle") e saldi non pagati ("aspetta" o "chiudi il saldo"). Quando la proposta è di non fare nulla, al posto dei pulsanti c'è una frase che dice cosa succede.
- Istruzioni: `CASE_ADVICE_RULES` (regole del sito con quelle uscite dalle
  risposte di Luca), `SITE_GUIDE` (dove sono i pulsanti, per le bozze),
  `MONEY_RULES` (rimborsi a livelli 100/50/20, mancata presentazione sempre
  100%, prove e foto, misure decise dal sito e non dall'IA, decisione non
  vincolante, pagamento diretto senza rimborso, intermediario).
- In ogni caso la proposta si vede subito (`CaseAdviceBox`), con il motivo.
  "Approva" decide come propone l'IA passando dagli stessi servizi del
  pulsante a mano (registro delle azioni, email all'autore con misura, regola
  e motivazione, DSA art. 17); "Modifica" compila il modulo di sempre. Nei
  casi di soldi "Approva la proposta" compila il modulo e apre la conferma di
  sempre (chi riceve cosa, quanto): nessun soldo si muove con un solo tocco.
  Niente "approva tutti". In Da fare la riga mostra "L'IA propone: …".
- Recensioni: nuova conseguenza "Chiedi all'autore di correggere la
  recensione": il cliente può cambiarla una volta da Le mie richieste.
- Si conta per tipo, sulle ultime 100 decisioni, quante proposte l'admin ha
  deciso così come erano: per la moderazione dai servizi stessi, per i soldi
  leggendo lo stato del caso (anche quando si decide dalle pagine della
  Finanza). Le decisioni automatiche e gli accordi tra le parti non contano.
  Nuova pagina Impostazioni → **Proposte dell'IA** (`/admin/proposte-ia`)
  con i numeri e le ultime volte in cui l'admin ha deciso diversamente.
- Promemoria in Scadenze e controlli al 13/12/2026 (nella stessa migrazione): rileggere le volte in cui l'admin ha deciso diversamente e migliorare le istruzioni (miglioria scelta da Luca).
- Ognuno vede le proposte dei casi del suo ruolo (`CASE_ADVICE_KIND_SCOPE`):
  moderazione per segnalazioni, recensioni e messaggi, finanza per rimborsi e
  contestazioni, tutti per i problemi sul lavoro.

- Nelle scritte dell'Admin si scrive "IA" (Luca, 13/11/2026: "il computer" faceva pensare a una regola fissa del sito): il controllo delle scritte semplici non la segna più. È più chiaro dire che è un'IA, e la legge europea sull'IA chiede di dirlo.

**Perché** proposta sempre visibile e non un periodo in ombra: è la scelta di
Luca. Il rischio è fidarsi troppo della proposta (detto una volta a Luca); per
questo il motivo è sempre scritto, i casi di soldi passano sempre dalla
conferma con cifre e nomi, e i numeri per tipo dicono dove l'IA sbaglia.

**Verifica**
- Prova dell'IA sui casi di soldi
  (`/mnt/project-files/analisi/admin-automatico/banco/prova-ia-soldi-esito.txt`):
  8 casi scritti apposta, due giri. Primo giro 8 su 8 come atteso; nel
  secondo, con le spiegazioni più corte, un lavoro con difetti piccoli e la
  versione contraria del professionista diventa "chiedi informazioni"
  invece di "rimborso del 20%". Contestazioni in banca e saldi non pagati:
  4 casi, 4 come atteso.
- Test: `apps/api/src/admin/case-advice.test.ts` (pulizia della risposta,
  regole dei soldi nelle istruzioni, giro dopo le informazioni chieste, come
  si legge la decisione di un caso di soldi, numeri per tipo, chi vede cosa).
  `pnpm lint` del sito.
