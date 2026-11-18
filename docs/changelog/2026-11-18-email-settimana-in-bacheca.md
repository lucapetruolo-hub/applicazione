# Email del lunedì: interruttore nella pagina "Lavori cercati"; iscrizione prima di "Avvisami"

**Richiesta (Luca, 18/11/2026):** l'email "Lavori cercati della settimana"
(`docs/changelog/2026-11-18-bacheca-cliente.md`, #401) si spegne e si
riaccende "nella pagina che abbiamo creato con questo thread, cioè la pagina
con le richieste", non in Notifiche ("non penso sia utile in quelle
impostazioni"). Poi: "possiamo farlo iscrivere direttamente al posto di
Avvisami?".

**Cosa cambia**
- *Interruttore in "Lavori cercati":* il professionista che ha fatto
  l'accesso vede in cima a `/lavora-con-noi/<mestiere>` e
  `/lavora-con-noi/<mestiere>/<provincia>` la riga "Ricevi ogni lunedì le
  richieste nuove vicino a te" con un interruttore (`BoardWeeklySwitch`,
  `role="switch"`), che salva la preferenza dell'avviso
  `richieste.settimana` (canale email). Per gli altri non si vede.
- L'avviso non compare più in Notifiche (`NotificationItem.elsewhere`) e conta
  solo la sua scelta, non l'interruttore "Email" di "Nuove richieste"
  (`NotificationsService.sendOwnEmail`). "Non ricevere più email come questa"
  in fondo all'email resta e spegne lo stesso avviso.
- Il link "Spegni o riaccendi questa email" porta a
  `/lavora-con-noi/<mestiere>#email-settimana`, con la riga in vista e
  bordata.
- *Pagina vuota:* prima il pulsante "Iscriviti: le richieste ti arrivano da
  sole", sotto il link "Non sei pronto? Avvisami alla prima richiesta" che apre
  il modulo di prima (scelta di Luca del 18/11).

**Motivo:** l'interruttore sta dove porta l'email e dove il professionista
guarda le richieste; l'iscrizione è la strada principale, "Avvisami" tiene chi
non è ancora pronto.

**Verifica:** typecheck di API e sito, `pnpm lint`, prova in
`notifications.test.ts` (avviso fuori da Notifiche, solo email), prove della
bacheca; foto in `anteprime/bacheca-richieste/`.
