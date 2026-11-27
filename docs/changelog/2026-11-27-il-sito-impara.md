# Il sito impara da solo, ma decide sempre Luca

**Richiesta** (Luca, 27/11/2026, thread "Far migliorare il sito da solo ogni
settimana"): delle proposte di "auto-miglioramento" sceglie le migliorie 1, 2 e
3, da agganciare al controllo del lunedì.

1. **Ricerca che impara dai fallimenti**: ogni ricerca senza risultato o con il
   mestiere cambiato dal cliente diventa una proposta per il dizionario.
2. **Banco di prova che cresce da solo**: ogni errore vero dell'IA entra nel
   banco; prima di cambiare le istruzioni dell'IA si rifà il banco e si unisce
   solo se migliora.
3. **Admin che impara dalle scelte di Luca**: quando Luca decide diversamente
   dall'IA, una regola nuova viene proposta per le istruzioni (sempre con il
   suo ok), con la misura mensile delle proposte approvate così com'erano.

**Decisione** (niente cambia da solo, come per il dizionario dal 06/11):

- **Miglioria 1**. La proposta "Categoria che i clienti cambiano"
  (`CATEGORY_CHANGE_WORD`, 16/11) conta anche le ricerche: mestiere toccato
  diverso dal primo, o nessun mestiere trovato e poi uno scelto
  (`NO_SUGGESTION`). Nuova proposta **"Ricerche senza risultato"**
  (`NO_RESULT_WORD`): ogni notte le parole scritte in almeno 3 ricerche senza
  nessun risultato negli ultimi 30 giorni (non generiche, non già insegnate,
  una per gruppo di ricerche) si fanno leggere **da sole** all'IA; se trova un
  mestiere, la parola va in Da approvare con l'esempio e quante volte i clienti
  hanno scelto da soli. Al massimo 5 parole provate per notte; una parola che
  l'IA non sa dire si riprova dopo 30 giorni. "Approva" = "Insegna la parola" di
  sempre.
- **Miglioria 2**. Tabella `ai_bank_cases`: ogni notte alle 3:50 entrano i
  clienti che cambiano mestiere (richieste e ricerche, anche con foto: la foto
  non si tiene, il caso si rifà a parole) e le proposte in Admin decise
  diversamente (`admin_case_advice` ora tiene il testo del caso e le decisioni
  possibili). Lo stesso testo con la stessa risposta conta una volta. Ogni
  domenica alle 21 e ogni notte in cui le istruzioni sono cambiate (impronta
  diversa) il banco si rifà con le istruzioni di adesso (al massimo 60 casi,
  stesso tetto giornaliero dell'IA); se le istruzioni nuove sbagliano di più,
  avviso a chi gestisce il sito e frase rossa in Admin. I testi dei clienti non
  vanno mai nel repo (pubblico): restano nel database e si cancellano dopo un
  anno come le descrizioni. **Prima di unire**, la CI
  (`scripts/controlla-banco-ia.mjs`) calcola l'impronta delle istruzioni
  (modello, ricerca a parole e foto, regole e istruzioni dell'Admin) e vuole la
  riga con il risultato del banco fisso in `docs/banco-ia/esiti.md`
  (`docs/banco-ia/README.md`).
- **Miglioria 3**. Ogni domenica, con almeno 2 casi decisi diversamente negli
  ultimi 60 giorni, l'IA propone fino a 2 regole generali (mai nomi, contatti,
  link o frasi che tolgano le regole del sito). Ogni regola si prova sul banco
  con e senza (casi sbagliati più 15 casi in cui l'IA era d'accordo con Luca):
  si propone in Da approvare (`AI_RULE`, solo super admin) **solo se dà più
  risposte giuste e non rompe nessun caso giusto**. "Aggiungi la regola" la mette
  in coda alle istruzioni (`ai_rules`, riletta ogni minuto da tutte le copie
  dell'API); si toglie in Admin → Proposte dell'IA. Un "No, mai" vale per
  sempre per la stessa frase.
- **Admin → Proposte dell'IA**: sezione "Cosa impara l'IA" con mese per mese
  (approvate così com'erano), regole insegnate con "Togli", banco di prova per
  parte (casi, nuovi della settimana, ultimo giro), "Rifai il banco adesso" e
  ultimi casi con "Togli" (solo super admin).
- **Lunedì**: l'email "Cosa fare questa settimana" (dopo il lancio) ha il
  riquadro **"Il sito impara"**: parole nuove per il dizionario, regole da
  approvare, errori entrati nel banco, ultimo giro, percentuale del mese scorso,
  frase rossa se le istruzioni nuove sbagliano di più. Parte anche senza
  consigli, se c'è qualcosa da dire.

**Perché così**: è la strada delle proposte già esistenti (Da approvare,
"Approva" = pulsante di sempre, registro azioni), senza strade nuove. L'IA non
cambia mai codice né istruzioni da sola (sicurezza prima della velocità).

**Verifica**: prove automatiche nuove (`ai-learning.test.ts`, 14 prove; parola
dalle ricerche senza mestiere; email del lunedì); tutta l'API 1.829 prove
verdi; prova vera in locale con Claude Haiku su dati di prova: dalle ricerche
"serranda" senza risultato una sola proposta pulita "Con «serranda» suggerisci
Fabbro" (alla prima prova, con la frase intera, uscivano anche "bloccata",
"scende", "sistema": corretto facendo leggere la parola da sola e una parola
per gruppo); dai casi "sconto in cambio di recensione" decisi diversamente,
regola provata sul banco 4 → 6 giuste su 7, nessun caso rotto; "Approva" ha
insegnato la parola ("La serrandina del box non scende" → Fabbro) e aggiunto
la regola in coda alle istruzioni, entrambe nel registro azioni.
