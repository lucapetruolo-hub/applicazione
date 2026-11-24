# Proposte dell'IA sempre visibili in Admin, anche col piano gratuito di Render

**Richiesta** (Luca, 24/11/2026): "perché non vedo il commento da Haiku?". In
Admin → Reclami e segnalazioni → Segnalazioni di contenuti, una recensione
segnalata il 18/11 ("ciano", Spam o pubblicità) non aveva la proposta
dell'IA, che dal 13/11 deve esserci in ogni caso
(`2026-11-13-admin-ia-propone.md`).

**Cosa è emerso**:
- Haiku risponde bene: lo stesso caso, provato dieci volte, dà sempre
  "Nascondi" con regola e spiegazione. Un giro completo su tutte le code
  (segnalazioni, revisioni, messaggi, problemi sul lavoro, rimborsi,
  contestazioni, banca, saldi), con Node 26 come su Render, dà 9 proposte su 9,
  sia chiamato a mano sia dal giro a orario.
- In produzione non c'era nessuna proposta in nessuna coda, e nei log nessun
  errore delle proposte.
- L'API su Render è sul piano **gratuito** (decisione di Luca del 16/11, piani
  a pagamento con la SRL prima del lancio): si spegne dopo 15 minuti senza
  visite, e da spenta nessuna attività a orario parte. Il controllo delle 4
  di notte (`site_checks`) non ha mai scritto nulla.
- Il giro delle proposte poteva finire **senza nessuna traccia**: risposta
  dell'IA illeggibile o con una decisione non permessa, oppure un solo caso
  che dava errore mentre si preparava, che fermava tutto il giro. La causa
  precisa in produzione si vedrà dalla riga nuova nei log (sotto).

**Decisione**:
- Il giro parte anche quando un admin apre una pagina di Admin che mostra le
  proposte (`GET /admin/case-advice`), se da 5 minuti non ne è partito uno,
  senza far aspettare la pagina (`CaseAdviceService.kickIfIdle`). Funziona
  col piano gratuito: chi apre Admin sveglia l'API e fa partire il giro.
- Su ogni caso senza proposta c'è una riga "L'IA non ha ancora preparato la
  sua proposta" con il pulsante **Chiedi la proposta**
  (`POST /admin/case-advice/:kind/:caseId/ask`, 10 al minuto). Se l'IA non
  risponde la scheda dice il perché (IA spenta, non risponde, decisione non
  permessa, caso già deciso) con "Riprova". Vale in tutte le code: segnalazioni
  e revisioni, recensioni fermate (scheda della persona), problemi sul lavoro
  e revisioni, rimborsi, contestazioni, contestazioni in banca, saldi non
  pagati, messaggi.
- Un solo giro alla volta per API; ogni caso è a sé (un caso che non va non
  ferma gli altri); alla fine una riga nei log: "Proposte dell'IA (giro a
  orario | pagina di Admin): N casi senza proposta, M pronte, K non riuscite
  (motivi)".
- Il giro partito aprendo Admin passa da `cron_runs` come quello a orario
  (`runScheduled`): due API non lo fanno insieme, e in Impostazioni →
  Proposte dell'IA si legge "Ultimo giro delle proposte: …" con l'errore se è
  finito male (sì di Luca, 24/11).
- Non tocca `common/scheduled-job.ts` né `cron_runs`: il recupero generico
  delle attività saltate col piano gratuito lo fa il lavoro sulle fatture
  elettroniche.

**Verifica**: `case-advice.test.ts` (giro con un caso che fallisce, un giro
alla volta, pulsante con motivo, caso già deciso); prova in locale con API e
sito veri su Node 26: pagina aperta → riga nei log "9 casi senza proposta, 9
pronte"; pulsante → scheda "L'IA propone" con Approva/Modifica; senza chiave →
motivo in rosso. Foto in `anteprime/proposte-ia/` dei file del progetto.
