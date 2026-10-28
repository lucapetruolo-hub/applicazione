# Controlli delle PR più veloci

**Richiesta** (Luca, 28/10/2026): con molte PR aperte i controlli rallentavano tutto; ha scelto di renderli più veloci senza indebolire quelli di sicurezza. Poi ha approvato quattro migliorie: dividere anche le prove del telefono Italia, controllare che le prove eseguite siano le stesse, changelog senza conflitti, regola sul ramo principale con l'unione automatica. No alla cache di turbo (si guadagna poco).

**Misure prima** (100 giri della CI dal 26/10): mediana 9,4 minuti, 1 giro su 10 oltre i 16; 32 giri su 100 solo per riallineare la PR al ramo principale; 12 rossi. Il job lento era sempre `agenda-browser` (prove nel browser 4:16, Lighthouse 1:18, build 1:12); `typecheck-build-test` 4:15-4:34 (build 1:34, seconda build del sito per il SEO aperto 1:04); sicurezza al massimo 1:45 (CodeQL). Nessuna attesa in coda e librerie di pnpm già in cache.

**Decisione**:
- `agenda-browser` diviso in quattro job paralleli, ognuno col suo database: telefono in Italia in due metà (`--shard`), New York e Tokyo insieme, misure dei compiti (`--no-deps`, cambiano i dati) con Lighthouse.
- Il controllo SEO del sito aperto ha un job suo (`seo-sito-aperto`) invece di rifare la build in coda.
- Typecheck, lint, build e test in un solo comando turbo, che li fa in parallelo per pacchetto.
- Cache della build di Next.js (`apps/web/.next/cache`) tra un giro e l'altro.
- Un nuovo push sulla stessa PR ferma il giro vecchio (CI e sicurezza); sul ramo principale mai.
- **Changelog senza conflitti**: ogni voce nuova in un file suo in `docs/changelog/` (`AAAA-MM-GG-argomento.md`, `docs/changelog/README.md`); `docs/CHANGELOG.md` resta l'archivio fino alla §399. Tutte le PR scrivevano in fondo allo stesso file con il numero successivo: andavano in conflitto tra loro e una PR in conflitto non fa partire nessun controllo. Il job `changelog` blocca un nome sbagliato e avvisa chi scrive ancora in fondo a `docs/CHANGELOG.md`.
- Niente salto della CI sulle PR di solo testo (era nella prima versione): con i controlli obbligatori un workflow saltato lascia la PR "in attesa" per sempre, e quelle PR sono rare.
- CodeQL, Semgrep, gitleaks e osv-scanner girano sempre e restano bloccanti.
- **Regola sul ramo principale**: va attivata da Luca nelle impostazioni del repository (controlli obbligatori, poi "Abilita unione automatica" sulle PR). La coda di unione di GitHub non è disponibile per i repository di un account personale.

**Verifica**: primo giro della PR #167 in 5:24 (sicurezza 1:38). Prove nel browser confrontate titolo per titolo con l'ultimo giro prima della modifica: 293 prove, 162 eseguite e 131 saltate di proposito, identiche (87 + 70 + 5 sui tre job). Controllo del changelog provato in locale con un nome giusto, uno sbagliato e una sezione aggiunta in fondo a `docs/CHANGELOG.md`.

## Secondo giro (28/10, migliorie approvate da Luca)

**Build del sito condivisa tra i job delle prove: non fatta.** Misurata sulla carta prima di scriverla: un job di build (preparazione 45 s, build 1:25, caricamento) seguito dai job delle prove (preparazione 45 s, scaricamento, browser 20 s, prove fino a 1:50) arriva a circa 5:20, come oggi. Le build in parallelo dentro ogni job costano minuti di macchina, non tempo d'attesa.

**Al suo posto**, sulla stessa parte lenta (la build del sito in ogni job):
- La cache di Next.js non veniva mai ritrovata: la chiave conteneva l'impronta di `pnpm-lock.yaml`, che cambia a quasi ogni unione nel ramo principale. Ora, se manca quella esatta, si riprende l'ultima cache del job (Next.js scarta da solo le parti cambiate).
- Nelle build delle prove nel browser e del SEO niente lint e controllo dei tipi dentro `next build` (`CI_BUILD_SENZA_CONTROLLI=1`, ~25 s a job): li fa già `typecheck-build-test`, e Vercel e quella build li fanno sempre.
- `actions/cache` da v4 a v5 (la v4 usa Node 20, in dismissione sui runner di GitHub).

## Terzo giro (28/10)

**Una prova aspettava un minuto** (Luca: "fai la 1"): "nel preventivo il cliente vede che tipo di lavoratore lo manda" (`e2e/tests/badge-fumetto.spec.ts`) entrava come cliente con il login vero a metà giro, trovava pieno il limite di accessi al minuto e aspettava fino a 60 secondi. Ora usa l'accesso firmato come l'API (`testToken`, già usato da altre prove). Il limite di accessi dell'API non cambia; il login vero resta provato dalla preparazione delle prove (`global-setup.ts`).
