# Proposte da approvare: tre migliorie (04/11/2026)

**Richiesta di Luca** (thread "Automazioni da approvare in Admin", dopo la
PR #234): "effettua miglioria 1-2-4" tra quelle proposte alla consegna di
`2026-11-03-automazioni-admin.md`.

## Cosa cambia

1. **Niente doppione per le zone chiuse.** Se in "Da approvare" c'è la
   proposta di riaprire le richieste generali in una zona, la stessa zona non
   compare più anche nella coda "Da fare" come "Richieste generali chiuse"
   (`apps/api/src/admin/admin-queue.service.ts`). Si decide in un posto solo.
   Con "Non ora" o "No, mai" la zona torna nella coda come prima.
2. **"Da approvare" anche in Andamento** (`AdminProposalsOverview`): quante
   modifiche aspettano e il link "Vai a Da approvare" alla Home
   (`/admin#da-approvare`). Si decide sempre e solo in Home, con l'anteprima.
3. **Elenco dei "No, mai"** in Andamento ("Fermate con "No, mai"", chiuso di
   serie): tipo, titolo, quando e chi. "Riproponi" toglie il no
   (`POST /admin/proposals/:id/restore`, stesso permesso della proposta,
   scritto nel registro azioni come "Proposta riproposta") e ricalcola subito
   quel tipo come di notte: torna in Da approvare solo se serve ancora,
   altrimenti lo dice e tornerà da sola quando i numeri la chiederanno. Dopo
   un "No, mai" in Home, la riga d'esito porta a questo elenco.

## Corretto lungo la strada

Un'email a un gruppo (promemoria del profilo, consiglio di mettersi in pausa)
rimandata con "Non ora" veniva tolta dal calcolo della notte dopo, e le
stesse persone tornavano subito in una proposta nuova: il "Non ora" durava
un giorno invece di 14. Ora resta fino alla scadenza (`dropStale`).

## Verifica

- Test in `admin-proposals.test.ts`: Riproponi (torna, non serve più, senza
  permesso) e "Non ora" di un gruppo che resta di notte.
- Prova sul sito in locale: "No, mai" su "Unisci «Sturatira scarichi»", poi
  "Riproponi" in Andamento: torna in Da approvare. Foto in
  `analisi/automazioni-admin/foto/andamento-*.png`.

## Test automatico sul sito (04/11, "miglioria 1 ok")

`e2e/tests/admin-proposte.spec.ts`, su telefono: "Aggiungi la frase" aggiunge
davvero la frase e la scrive nel registro azioni; "No, mai" la ferma e l'esito
porta ad Andamento; "Riproponi" la rimette in Da approvare. Controlla anche
l'accessibilità della scheda e che la pagina non scorra di lato. Alla fine
toglie la frase dal sito e lascia le frasi com'erano.

Scrivendolo è emerso un difetto: se una proposta non serviva più, l'errore
stava sulla sua scheda, che però spariva subito ricaricando l'elenco, e non
si leggeva niente. Ora il motivo resta scritto sopra l'elenco, in rosso.
