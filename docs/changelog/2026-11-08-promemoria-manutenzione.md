# Promemoria di manutenzione: "Ti servirà di nuovo?"

**Richiesta**: funzione nuova 5 del controllo pre-lancio dell'08/11/2026
(`collaudo/2026-11-08/esperto-E10-prodotto.md`), approvata da Luca. Il
motivo per cui un cliente torna una seconda volta senza cercare su Google:
caldaia e condizionatore ogni anno, pulizie e giardino ogni poche settimane.

**Decisione**:
- A lavoro terminato, nella scheda del lavoro del cliente, il riquadro "Ti
  servirà di nuovo?" con cinque scelte (2 settimane, 1 mese, 3 mesi, 6 mesi,
  1 anno). Quella tipica del mestiere è per prima e in evidenza (pulizie 2
  settimane; giardiniere, dogsitter, babysitter 1 mese; climatizzazione e
  tende 1 anno), negli altri mestieri nessuna.
- Un tocco imposta il promemoria: "Te lo ricordiamo l'8 novembre 2027", con
  "Cambia" e "Togli". Senza recensione il riquadro ha anche "Prenota di nuovo"
  (con la recensione il pulsante c'era già sopra).
- La data la calcola il server, alle 9 italiane: mai un'email di notte.
  Solo il cliente, solo con un lavoro terminato e un professionista ancora
  sul sito.
- Alla data: avviso sul sito e email "Il promemoria che avevi chiesto" con
  "Prenota di nuovo", che apre la scheda del lavoro (lo stesso percorso
  "Prenota di nuovo" di sempre, §348). Nessun testo promozionale: è il
  cliente ad averlo chiesto. Non parte se nel frattempo uno dei due ha
  chiuso l'account.
- Stesso meccanismo del "ricordamelo" del menu (§130): un campo in più nello
  stato personale della richiesta (`rebookRemindAt`), stesso PATCH, controllo
  ogni 30 minuti. Tipo di notifica `REBOOK_REMINDER` nell'argomento
  "Promemoria che imposti tu", che ora ha anche l'email (accesa di serie,
  si spegne dalle Notifiche); il "ricordamelo" del menu resta solo sul sito.

**Dove**: migrazione `20261108201042_promemoria_manutenzione`,
`packages/shared/src/rebookReminder.ts`,
`apps/api/src/guided-requests/guided-request-user-state.service.ts`,
email in `apps/api/src/email/templates/notification-emails.ts`,
`apps/web/src/app/le-mie-richieste/_components/RebookReminderBox.tsx`.

**Verifica**: test dell'API (`guided-request-user-state.service.test.ts`:
data alle 9, solo cliente, solo a lavoro terminato, togliere, un avviso
solo e nulla con account chiuso); prova nel browser
`e2e/tests/promemoria-manutenzione.spec.ts` su telefono e computer (scelta
tipica in evidenza, impostare, data nel database, togliere, axe sul riquadro).
