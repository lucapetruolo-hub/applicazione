# Lavori più cercati in home

**Richiesta** (Luca, 07/11/2026): oltre alle categorie, una sezione in home con
i servizi più richiesti (idea H10 del confronto con miodottore). L'08/11 Luca
ha approvato anche le migliorie 1 e 2: i tocchi sulle pillole non contano
come ricerche, l'elenco si cambia in Admin.

**Decisione**:
- Dentro "Di cosa hai bisogno?", sotto le schede delle categorie, il blocco
  **"Lavori più cercati"**: 8 pillole bianche con l'icona del mestiere
  (stesso aspetto dei "Servizi più richiesti" in fondo ai risultati,
  `PopularServicesLinks`), componente `apps/web/src/components/PopularJobs.tsx`.
  Su computer due righe; da telefono tre righe che scorrono di lato, per non
  allungare la pagina con otto righe una sotto l'altra.
- Ogni pillola apre `/cerca?servizio=<nome>`, nella città dell'ultima ricerca
  se c'è (come "Quanto costa in media"): il percorso già usato per cercare chi
  offre una prestazione.
- **Dati**: `GET /popular-jobs` (`apps/api/src/popular-jobs/`, cache 10
  minuti). L'elenco lo sceglie l'admin; finché nessuno lo cambia vale
  `DEFAULT_POPULAR_JOBS` (`packages/shared/src/popularJobs.ts`: Keyword Planner
  del 06/11 e 769 frasi dei clienti). Con almeno 50 ricerche di lavori negli
  ultimi 90 giorni dal lancio (`ServiceSearchDay`, §384) prima i più cercati,
  a parità l'ordine dell'elenco; prima, l'ordine dell'elenco. Mai vuota: l'API
  che non risponde lascia l'elenco di partenza, e in Admin non si scende
  sotto 8 lavori (massimo 16, gli altri di riserva).
- **Le pillole non contano come ricerche**: `recordServiceSearch` conta solo
  la parola scritta (`q`), mai `service` (commento in
  `professionals.controller.ts`), altrimenti i primi resterebbero primi solo
  perché stanno in alto.
- **Admin → Impostazioni → Dizionario dei mestieri → Mestieri richiesti →
  "Lavori più cercati in home"** (`?scheda=lavori`): aggiungere (mestiere,
  poi una delle sue prestazioni suggerite: solo nomi di `POPULAR_SERVICES`,
  così la ricerca trova chi li offre e le ricerche si contano), togliere,
  spostare su o giù; per ogni lavoro le ricerche in 90 giorni e il posto in
  home (1°…8° o "Riserva"); sotto, "Cercati sul sito ma non nell'elenco" con
  "Aggiungi". La prima modifica copia l'elenco di partenza nella tabella
  `popular_jobs` (stesso schema delle frasi d'esempio). Ogni modifica va nel
  registro azioni. Scope `MODERATION`, come le frasi d'esempio.

**Verifica**: `packages/shared/src/popularJobs.test.ts` (elenco di partenza
valido e contabile dalla ricerca, ordine con poche e molte ricerche, nomi in
due mestieri sommati, fuori elenco esclusi, vista Admin); prova a mano in
locale delle rotte admin (aggiungi, sposta, nome non in elenco rifiutato,
minimo 8) e del conteggio (`service=` non conta, `q=` sì); foto prima/dopo
su computer e iPhone 13 in `analisi/lavori-piu-cercati/` del progetto.

## Secondo giro (08/11, migliorie 2 e 3 approvate da Luca)

- **Avviso in "Andamento del sito"** (`buildSiteAdvice`, `apps/api/src/admin/site-stats.ts`):
  quando un lavoro fuori dall'elenco è cercato almeno `SERVICE_GAP_MIN_SEARCHES`
  volte (10) in 90 giorni e più del meno cercato tra quelli in home, compare
  «"X" è cercato più dei lavori in home», con il pulsante che porta alla scheda
  "Lavori più cercati in home". Uno solo per volta. L'elenco valido dalle righe
  salvate è in un solo punto (`popularJobsFromRows`), usato da home, Admin e avviso.
- **Admin da telefono**: su, giù e togli sono pulsanti tondi a icona da 40 px
  (`.admin-icon-button`, con nome per il lettore di schermo e suggerimento al
  passaggio del mouse), su una riga loro in ogni scheda; il numero delle
  ricerche ha la scritta "Ricerche:" davanti (`admin-table-numbers`).

**Verifica**: test nuovo in `apps/api/src/admin/site-stats.test.ts` (avviso
sopra soglia, nessun avviso sotto soglia o a pari ricerche); foto della
scheda e dell'avviso su computer e iPhone 13.
