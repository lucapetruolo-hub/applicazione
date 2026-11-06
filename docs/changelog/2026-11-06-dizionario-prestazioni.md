# Il dizionario porta anche alla prestazione, e impara dall'IA con l'approvazione di Luca (06/11/2026)

**Richiesta di Luca:** "Per risolvere prestazioni e dizionario separati, non possiamo risolverlo con dizionario senza interrogare sempre AI?". Alla proposta (1. parole delle prestazioni nel dizionario, 2. proposte "parola → prestazione" dalle risposte dell'IA) ha risposto "Sì 1 e 2". Segue `2026-11-06-ia-conosce-i-servizi.md`.

## Decisione

1. **Parole delle prestazioni** (`SERVICE_WORDS` in `packages/shared/src/problemServiceWords.ts`): per ogni prestazione suggerita le parole tipiche dei clienti ("sifone" → Sostituzione sifone, "intasato" → Sturatura scarichi, "salvavita" → Ricerca guasti). Valgono solo per il primo mestiere scelto dal dizionario, mai per un lavoro che non copriamo; in ogni mestiere vince la prima voce, per questo le più precise stanno prima. Il dizionario dà così la prestazione (`ProblemMatch.service`) senza chiamare l'IA, e nei risultati vanno prima i professionisti che la offrono (stesso percorso della #253). Con l'IA, se lei non indica una prestazione vale quella del dizionario dello stesso mestiere.
2. **Proposte in "Da approvare"**: la prestazione data per ogni descrizione si salva (`problem_descriptions.service`). Una parola che il dizionario porta già al mestiere giusto, e che l'IA ha legato almeno 10 volte e in 9 casi su 10 alla stessa prestazione, compare come "Parola per una prestazione" (`DICTIONARY_SERVICE_WORD`). Anche le parole nuove ("Parola per il dizionario") portano la prestazione quando l'IA ha dato sempre la stessa. Si insegna solo con "Insegna la parola": la parola insegnata salva anche la prestazione (`problem_words.serviceName`, controllata sul catalogo del mestiere) e la mostra in "Mestieri richiesti". Mai da sola (decisione di Luca, vedi il file della #253).

Migrazione `20261106160000_prestazione_dal_problema`: due colonne facoltative, nessun dato cambiato.

## Verifica

- `problemServiceWords.test.ts`: ogni prestazione è tra le suggerite del suo mestiere; frasi tipiche → mestiere e prestazione; niente prestazione senza mestiere o per un lavoro fuori servizio.
- Banco delle 769 frasi: con un mestiere il dizionario dà ora una prestazione in 413 casi su 705 (247 su 393 quando è sicuro). Controllo a campione di 40: gli errori erano su parole troppo generiche (vetri in una pulizia di cucina, divano in un trasloco intero, vernice su un termosifone), corretti mettendo prima le voci precise e togliendo le parole generiche.
- `problem-match.service.test.ts`: prestazione dal dizionario sicuro senza IA; parola insegnata con prestazione.
- `admin-proposals.test.ts`: proposta con 10 risposte uguali; nessuna con 9, con prestazioni diverse, già insegnata o già nota al dizionario; parola nuova con la prestazione.

## Misura con le prestazioni giuste e riga "Perché" (seguito, sì di Luca)

- **100 frasi del mucchio chiuso controllate a mano** (`packages/shared/test-data/banco-prestazioni.csv`: la prestazione giusta, `-` se nessuna va bene, `|` se più d'una è giusta). Su 75 frasi con una prestazione adatta il dizionario dà quella giusta in 56, una sbagliata in 4, nessuna in 15; sulle 25 senza prestazione adatta ne propone una in 4. Le parole non sono state ritoccate su queste frasi, così la misura resta onesta. La prova in `problemServiceWords.test.ts` ferma la CI se si scende sotto 72% giuste o si supera 8% sbagliate.
- **Riga "Perché" dei risultati**: quando la prestazione è del mestiere scelto e almeno un professionista in lista la offre, dopo il motivo compare "In cima chi fa «…»." (`ProblemBand`, calcolata in `CercaContent`).
- Da fare dopo l'unione delle due PR: rifare la misura dell'IA sulle stesse 91 frasi dubbie del mucchio chiuso, a parte dalla misura serale.
