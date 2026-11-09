# Canale del professionista: link personale, QR e "Invita un tuo cliente"

**Richiesta**: gruppo 11 del controllo prima del lancio dell'8/11
(`collaudo/2026-11-08/riepilogo.md`, rapporto `esperto-E10-prodotto.md`:
difetto E10-03, funzioni nuove 1 e 2, migliorie 6, 12 e 13). Luca: "si a tutto
quello che ritieni, tranne per le funzioni nuove la n.12". È la decisione del
26/10 rimasta "Non fatto" nel §363 (`analisi/progetto-versione-profonda.md`):
i clienti che il professionista porta col suo link non devono consumare i
lavori del mese, altrimenti nessun professionista manda i suoi clienti sul sito.

**Decisioni**:
- **Link personale corto** `/p/<codice>` (6 lettere e cifre senza 0/o/1/l/i,
  `ProfessionalProfile.personalLinkCode`, creato alla prima apertura e mai
  cambiato perché finisce stampato). Porta al profilo con `?link=1`; il profilo
  lo ricorda nella scheda del browser (sessionStorage `link-personale:<id>`,
  tecnico, nella tabella della pagina Cookie) e il modulo della richiesta lo
  manda al server (`viaProfessionalLink`).
- **Cliente suo** (`GuidedRequest.fromProfessionalLink`): il server lo segna
  solo per una richiesta diretta a quel professionista e solo se il sito non
  gli aveva già portato quel cliente (nessun lead da ricerca, smistamento o
  inoltro dal link di un altro). Così un cliente trovato con la ricerca non
  diventa "suo" facendogli riscrivere la richiesta dal link.
- **Non conta nei lavori** (`countUsedJobs`: contano i lavori senza preventivo
  e quelli da richieste non del link, scritto con un OR perché un NOT su una
  relazione facoltativa scartava anche i lavori senza preventivo; provato su un
  Postgres vero). Con i lavori esauriti al cliente del link si risponde sempre:
  preventivo (`quotes.service.ts`), prima risposta in chat
  (`timeline.service.ts`) e modulo in Richieste. Per un altro professionista
  che la riceve inoltrata è una richiesta come le altre (`ownClientRequest`).
- **Casella "Inoltra se non risponde" spenta di serie** per chi arriva dal
  link (miglioria 6, va contro l'"acceso di serie" del §209 solo in questo
  caso, approvata da Luca con il gruppo 11). Il cliente la può riaccendere.
- **"Invita un tuo cliente"**: messaggio già pronto con nome facoltativo, che
  il professionista manda dal suo WhatsApp, dalla sua email o con la
  condivisione del telefono. Noi non scriviamo ai suoi clienti: niente email a
  persone che non si sono iscritte (scelta da esperto privacy).

**Cosa cambia nel sito**:
- Nuova pagina **"Il tuo link"** (`/dashboard/il-tuo-link`, voce in "La tua
  attività"): link con "Copia" e "Condividi", richieste e lavori dal link nel
  periodo, invito, QR con "Scarica il QR" (PNG 1024 px, SVG se il browser non
  ci riesce), una riga su scheda Google, sito e stato di WhatsApp.
  `GET /professionals/me/personal-link`, `GET /professionals/link/:code`
  (pubblica, 30 al minuto).
- **Oggi**: riquadro "Porta i tuoi clienti" a chi compare nelle ricerche.
- **Richieste**: bollino "Dal tuo link" sulla scheda.
- **Abbonamento**: sotto i lavori del periodo "I clienti che ti scrivono dal
  tuo link non contano" (o quanti lavori dal link non sono contati).
- **Lavoro aggiunto da te**: "Invita questo cliente" apre l'invito con il nome
  già scritto (miglioria 12).
- **/per-professionisti**: una voce in "Compreso in ogni livello" e una
  domanda frequente (miglioria 13). **Termini**: la regola nella sezione
  abbonamento, versione 2026-11-08 (solo a favore dei professionisti, senza
  avviso prima del lancio).
- **Admin → Da dove arrivano le richieste**: riga "Dal link personale di un
  professionista".

- **Pulsante per il tuo sito** (09/11, sì di Luca): in "Il tuo link" il codice
  di un pulsante "Chiedi un preventivo" da incollare sul sito del
  professionista, con l'anteprima. Solo un link con lo stile scritto dentro
  (`personalLinkButtonHtml` in `packages/shared/src/personalLink.ts`): nessuno
  script e nessun cookie sul sito del professionista.
- **Dominio vero prima di stampare i QR**: punto nella checklist di lancio (sì
  di Luca, prima del lancio).
- **Skill `referrals`** (passaparola) controllata e installata in
  `.claude/skills/referrals/` con l'ok di Luca (fonte in `FONTE.md`).

- **Tre migliorie del passaparola** (09/11, sì di Luca, trovate con la skill):
  - sul profilo aperto dal link la riga "Sei sul profilo di X: scrivigli da
    qui";
  - dopo "Lavoro terminato" (Agenda e Richieste e lavori) l'invito "Lavoro
    chiuso. Hai altri clienti?" con il pulsante "Il tuo link", **al massimo una
    volta ogni 30 giorni** (Luca: "non farlo sempre altrimenti diventa
    noioso"; `personalLinkNudgeDue`, memoria del browser elencata nella pagina
    Cookie);
  - in Admin → Da dove arrivano le richieste, quanti professionisti hanno
    portato almeno un cliente col link negli ultimi 30 giorni.

Migrazione `20261108200000_canale_del_professionista`.

**Verifica**: lint, typecheck di web e api, 1299 prove dell'API (nuove su
codice, QR, cliente suo o del sito, lavori contati, risposta con i lavori
esauriti), prove di shared; migrazione applicata su un Postgres vero senza
differenze con lo schema e conteggio dei lavori provato lì; prova nel browser
`e2e/tests/canale-professionista.spec.ts` (telefono e computer: pagina con
axe, link aperto da un visitatore, casella d'inoltro spenta, codice
inesistente 404); foto in `collaudo/2026-11-08/foto/canale-professionista/`.
