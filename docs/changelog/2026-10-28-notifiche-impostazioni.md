# Notifiche: pagina a schede e singoli avvisi

**Richiesta** (Luca, 28/10/2026): nella pagina delle impostazioni delle
notifiche dei sottomenu per argomento, per scegliere per esempio quali avvisi
dei preventivi ricevere e quali no; e una pagina più bella da vedere e più
comoda, ora che è più articolata. Solo le impostazioni: niente centro
notifiche né cambi allo smistamento delle richieste (prima proposta scartata
da Luca perché troppo complessa).

**Decisione**:
- Una scheda per argomento con icona e colore (gli stessi della campanella),
  descrizione e i canali come pulsanti con la spunta: "Sito" ed "Email". Al
  posto della griglia di interruttori, lunga e poco chiara sul telefono.
- Dove l'argomento raccoglie più avvisi, "Singoli avvisi · 5 su 7 attivi" apre
  il sottomenu con un interruttore per avviso (`NOTIFICATION_ITEMS` in
  `packages/shared/src/notifications.ts`). Esempi: per il professionista
  "Preventivo accettato o rifiutato" e "Date proposte dal cliente"; in "Lavori
  e appuntamenti" Appuntamenti, Promemoria e agenda, Lavoro terminato,
  Pagamenti online, Problemi e contestazioni, Nuove recensioni, Fatture chieste
  dai clienti. Etichette diverse per cliente e professionista; gli avvisi
  dell'amministrazione si vedono solo agli admin.
- Un avviso spento vale per sito ed email, come un argomento spento: la
  notifica resta nella campanella, già letta. Si salva in
  `notificationPrefs.off` (JSON, nessuna migrazione); `notificationChannelEnabled`
  lo controlla, quindi vale per ogni invio che già passa da lì.
- "Mentre sei sul sito" (popup e suono) in due tessere affiancate. "Account e
  sicurezza" resta sempre attivo (DSA art. 17), con il lucchetto.
- La colonna SMS non si mostra più: non mandava nulla (stessa scelta della PR
  dei promemoria su WhatsApp, che toglie il canale).

**Verifica**: test in `packages/shared/src/notifications.test.ts` (ogni tipo
di richieste, preventivi e lavori sta in un solo avviso del suo argomento,
avviso spento su tutti i canali, chiavi sconosciute scartate, Account sempre
attivo, avvisi admin solo agli admin). Pagina fotografata da computer e
telefono, come professionista e come cliente.
