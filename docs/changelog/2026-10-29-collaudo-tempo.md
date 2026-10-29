# Collaudo: "Fai passare il tempo" sugli account di prova

## Richiesta

Luca ha chiesto un prompt per far collaudare il sito da agenti estranei al
lavoro fatto (`/mnt/project-files/analisi/collaudo-completo-prompt.md`) e ha
approvato le migliorie proposte. Una di queste: gli agenti non possono
aspettare giorni per vedere promemoria, chiusure d'ufficio, sblocco dei soldi
e scadenze delle segnalazioni, quindi quelle parti restavano "non
verificabili".

## Decisione

In Admin → Utenti → scheda di un **account di prova** (solo super admin) c'è
il riquadro "Fai passare il tempo": si sceglie 1, 3, 7, 14 o 30 giorni e
`POST /admin/users/:id/test-time` (`apps/api/src/test-accounts/test-time.service.ts`):

- sposta indietro di quei giorni le date di richieste, inviti, preventivi,
  lavori, pagamenti online e segnalazioni dell'account (mai `updatedAt` né la
  cronologia della chat): per i controlli a tempo è come se fossero passati;
- tocca solo ciò in cui **tutte** le persone coinvolte sono account di prova
  (cliente, professionista scelto, chi ha ricevuto l'invito o mandato un
  preventivo): un utente vero non viene mai toccato;
- con le chiavi Stripe vere (`sk_live`) rifiuta i lavori pagati online;
- poi fa girare subito gli stessi controlli che partono da soli ogni 5-60
  minuti: scadenze delle richieste, promemoria degli appuntamenti, lavoro
  terminato da una parte sola, scadenze delle segnalazioni, sblocco dei soldi
  e bonifici. Un controllo che fallisce non ferma gli altri;
- ogni uso finisce nel registro azioni.

Fuori di proposito: il rinnovo dell'abbonamento, che decide Stripe e non il
nostro database (si prova con gli "orologi di prova" di Stripe, non da qui).

## Verifica

`test-time.service.test.ts`: rifiuta un account non di prova, filtra solo
persone di prova, sposta le date giuste e fa girare i 5 controlli, rifiuta i
lavori pagati online con le chiavi vere. `pnpm typecheck` e `pnpm lint` di
web e api puliti.
