# Notifiche: problemi sempre attivi, Sito ed Email per ogni avviso, "Non avvisarmi più" dalla campanella

**Richiesta** (Luca, 29/10/2026): fare le prime due migliorie proposte dopo la
PR della pagina a schede, e per ogni singolo avviso poter scegliere Sito ed
Email.

**Decisione**:
- "Problemi e contestazioni" (per il cliente "Le tue segnalazioni") è sempre
  attivo, anche con "Lavori e appuntamenti" spento: risposta in chat entro 48
  ore, versione al team entro 72, prove delle contestazioni in banca. Perdere
  l'avviso vuol dire perdere la segnalazione. `NotificationItem.locked`.
- Ogni singolo avviso ha i suoi pulsanti Sito ed Email (`notificationPrefs.items`,
  salvati solo quelli cambiati). Un avviso parte su un canale se è acceso sia
  nell'argomento sia nell'avviso: l'argomento resta l'interruttore generale e,
  quando è spento, i pulsanti degli avvisi su quel canale sono grigi.
  "Richiesta inviata" ha solo Email (sul sito c'è già la pagina di conferma).
  Al posto di `off` della PR precedente, mai uscita.
- Campanella: accanto alla "x" di ogni notifica una campanella barrata,
  "Non avvisarmi più di: …", che spegne quell'avviso su sito ed email (per
  Messaggi e Promemoria, che non hanno avvisi separati, l'argomento). In alto
  compare "Non ti avvisiamo più di … · Annulla". Non c'è per gli avvisi
  sempre attivi.

**Verifica**: test in `packages/shared/src/notifications.test.ts` (avviso con
Email spenta e Sito acceso, argomento spento che vale anche per l'avviso,
problemi attivi con Lavori spento, spegnere e riaccendere dalla campanella,
avvisi bloccati senza campanella barrata). Pagina e campanella fotografate da
computer e telefono.
