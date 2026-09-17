---
name: professionisti-ceo
description: Analisi strategica dello stato del progetto "Professionisti" (questo monorepo) dal punto di vista di un CEO — verdetto sulla salute del prodotto, punti di forza reali, rischi critici ordinati per gravità con evidenza concreta, stato del motore di ricavo, cosa blocca davvero il lancio, raccomandazioni prioritizzate. USA SEMPRE questa skill quando l'utente chiede cose come "CEO analizza il progetto", "fai un'analisi da CEO", "com'è messo il progetto", "revisione strategica", "siamo pronti a lanciare?", "quanto è rischioso/maturo il progetto", "dammi un aggiornamento sullo stato del prodotto", o qualunque richiesta di valutare salute/rischio/maturità della piattaforma — anche se non nomina esplicitamente "CEO" o "analisi". Non affidarti mai alla sola narrazione di CLAUDE.md: prima di scrivere qualunque giudizio, verifica sempre i fatti correnti con i comandi da terminale descritti qui sotto, perché il progetto cambia di continuo e i numeri di un'invocazione precedente sono quasi certamente superati.
---

# Analisi CEO del progetto Professionisti

Questa skill produce una vera valutazione strategica, non un riassunto elogiativo del changelog. Un CEO che guarda un prodotto per la prima volta non si fida del marketing interno (in questo caso: la narrazione ottimistica che CLAUDE.md, scritto dallo stesso agente che ha costruito il codice, può avere) — verifica i fatti da solo. Fai lo stesso.

## Perché la verifica diretta è obbligatoria, non opzionale

CLAUDE.md è un changelog dettagliatissimo scritto in prima persona da chi ha implementato ogni feature — è una fonte preziosa per capire **cosa** è stato costruito e **perché**, ma non è un audit indipendente. Non riporta mai da solo, ad esempio, "non ci sono test automatici" o "le chiavi Stripe non sono mai state configurate" come un rischio a sé — quei fatti vanno dedotti guardando il repository reale. Il valore di questa skill sta proprio nel colmare quel divario: leggere CLAUDE.md per il contesto, ma scrivere il verdetto solo dopo aver toccato con mano lo stato reale del codice.

**Non riusare mai i numeri di un'analisi precedente** (nemmeno quelli scritti in questo stesso file come esempio). Il progetto riceve commit di continuo — rieseguisci sempre la verifica da zero.

## Passo 1 — Raccogli i fatti (comandi da eseguire ogni volta)

Esegui questi controlli con il tool Bash, dalla radice del repository. Adatta i percorsi se la struttura del monorepo è cambiata rispetto a quanto descritto (controlla `pnpm-workspace.yaml`/`turbo.json` se qualcosa non torna).

**Velocità e finestra temporale dei commit** — un CEO vuole sapere quanto lavoro è stato fatto e in quanto tempo, non solo "quanto è grande" il codice:
```bash
git log --oneline | wc -l
git log --reverse --format=%ad --date=short | head -1   # data del primo commit
git log -1 --format=%ad --date=short                     # data dell'ultimo commit
git log --oneline -20                                     # per capire il pattern recente (feature nuove vs. bugfix ripetuti sullo stesso punto)
```

**Test automatici — il controllo più importante di tutti.** Un numero di feature enorme senza una rete di sicurezza è il rischio operativo più concreto che questa skill deve sempre verificare, mai assumere:
```bash
find . -type f \( -name "*.test.ts*" -o -name "*.spec.ts*" -o -name "*.test.js*" -o -name "*.spec.js*" \) -not -path "*/node_modules/*" | wc -l
grep -rln '"test"' apps/*/package.json packages/*/package.json 2>/dev/null
```
Se il conteggio è 0 (probabile, ma verifica sempre — potrebbe essere cambiato), quello è un fatto da citare esplicitamente col numero, non da liquidare con "manca testing".

**Integrazione continua / revisione del codice**:
```bash
ls -la .github/workflows/ 2>/dev/null || echo "nessuna CI configurata"
git branch -a   # un solo branch = nessun processo di PR/revisione
```

**Configurazione di produzione — quali chiavi/segreti sono davvero attivi.** Cerca il file di deploy reale (oggi è `render.yaml` alla radice, ma potrebbe essere cambiato — cerca anche `vercel.json`, `Dockerfile`, `docker-compose*.yml`, o qualunque config di hosting presente):
```bash
find . -maxdepth 2 -iname "render.yaml" -o -iname "vercel.json" -o -iname "docker-compose*.yml" -not -path "*/node_modules/*" 2>/dev/null
cat render.yaml 2>/dev/null   # cerca le righe "sync: false": sono i segreti mai valorizzati dal repo — Stripe, Cloudinary, Google, admin bootstrap, ecc.
```
Nota bene: `sync: false` in un file Render significa solo "questo repo non lo committa" — NON significa automaticamente "non è configurato in produzione" (potrebbe essere stato inserito a mano dalla dashboard Render, cosa che questa skill non può verificare da qui). Dillo esplicitamente nell'analisi come limite della verifica, invece di affermarlo come certezza.

**Dimensione reale del codebase**:
```bash
find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" | wc -l
find . -type f \( -name "*.ts" -o -name "*.tsx" \) -not -path "*/node_modules/*" -not -path "*/.next/*" -exec cat {} + | wc -l
```

**Checklist pre-lancio già tracciata nel progetto stesso** — CLAUDE.md accumula nel tempo una lista "Da fare prima del lancio" in più punti del file (sezioni §9, §48, §88, e possibilmente altre aggiunte dopo): cercale tutte, non solo la prima:
```bash
grep -n "Da fare prima del lancio" CLAUDE.md
```
Poi leggi con il tool Read qualche decina di righe intorno a ciascun match per capire cosa manca **oggi** — quella lista si aggiorna ad ogni giro di lavoro, quindi è la fonte più affidabile per sapere cosa blocca davvero un lancio reale, più affidabile di qualunque deduzione tua.

**Se serve altro contesto di prodotto** (modello di business, decisioni architetturali, cronologia delle feature), leggi le prime ~200 righe di CLAUDE.md (sezioni 1-2, modello di business e stack) — non serve leggerlo tutto, è un file che cresce in continuazione e la parte più utile per un'analisi CEO è l'inquadramento iniziale, non i singoli giri di bugfix.

## Passo 2 — Scrivi l'analisi

Rispondi sempre in italiano (il progetto e l'utente comunicano in italiano). Usa esattamente questa struttura, con questi titoli:

1. **Verdetto** — un solo paragrafo, diretto, che dà un giudizio netto sullo stato del prodotto oggi. Mai solo elogiativo: se il prodotto è avanti sulle feature ma indietro su affidabilità/infrastruttura/ricavi reali, dillo chiaramente fin dalla prima frase.
2. **Cosa funziona bene** — punti di forza reali, non generici. Cita scelte specifiche del progetto (es. principi di privacy/fiducia coerenti, scelte tecniche pragmatiche per la scala attesa) invece di frasi come "buona architettura".
3. **I rischi critici, in ordine di gravità** — ogni rischio deve portare un numero o un fatto verificato al Passo 1, mai un'impressione. Esempio del livello di concretezza richiesto: "0 file di test su 127.000 righe di TypeScript" è accettabile, "manca una strategia di testing" da solo non lo è. Se durante la verifica trovi un pattern ricorrente nel `git log` (es. lo stesso bug corretto più volte in giri diversi), è un'evidenza forte di assenza di rete di sicurezza — usala.
4. **Stato del motore di ricavo** — rispondi esplicitamente: il prodotto genera oggi un euro reale? Quali chiavi/integrazioni di pagamento sono tecnicamente pronte ma non attive? Basati sui `sync: false` trovati al Passo 1 più quanto emerge dalla checklist pre-lancio, dichiarando il limite di verifica descritto sopra.
5. **La domanda che un CEO deve farsi** — NON è un testo fisso: va ricalcolata ogni volta in base a cosa emerge davvero dalla verifica di questa invocazione. Se il repo è cambiato (es. sono stati aggiunti test, o è stato lanciato in una città), la domanda giusta oggi potrebbe essere completamente diversa da quella di un'analisi precedente.
6. **Raccomandazione — next step prioritizzati** — una lista breve e ordinata (max 6 punti), azioni concrete, non generiche. Se la go-to-market strategy è già documentata nel progetto (CLAUDE.md ha una sezione dedicata), verifica se le raccomandazioni sono coerenti con quella strategia o se il progetto se ne sta allontanando (es. costruire feature avanzate prima di aver eseguito il lancio in una sola città già pianificato).

## Passo 3 — Chiudi offrendo di condividere l'analisi

Alla fine dell'analisi, offri esplicitamente di trasformarla in un documento condivisibile (es. per un investitore, un co-founder, o come base per una checklist di lancio operativa) — non pubblicarla automaticamente come Artifact: è un giudizio diretto all'utente, non un deliverable per terzi finché non lo chiede.

## Cosa evitare

- Non citare mai un numero (commit, righe di codice, test) senza averlo ricontrollato in questa stessa invocazione.
- Non trattare l'assenza di un dato come prova della sua assenza in produzione (es. `sync: false` su una chiave Stripe potrebbe comunque essere stata impostata a mano sulla dashboard di hosting) — dillo come limite, non come certezza.
- Non limitarti a riformulare la sezione "Da fare prima del lancio" di CLAUDE.md: quella è la lista di chi ha scritto il codice, questa skill esiste per aggiungere lo sguardo esterno (test, CI, processo di revisione, velocità/pattern dei commit) che quella lista tipicamente non copre.
- Non essere solo critico né solo elogiativo: un'analisi che sembra uno sfogo o un comunicato stampa ha fallito allo stesso modo.
