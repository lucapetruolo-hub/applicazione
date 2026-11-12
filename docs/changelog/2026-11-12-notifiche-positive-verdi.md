# Notifiche "Account e sicurezza": verdi le buone notizie

**Richiesta** (Luca, 12/11/2026, con foto della tendina Notifiche): "La prima
notifica in alto è positiva, invece sembra negativa". Era "Stripe ha
verificato la tua identità", con scudo, sfondo ed etichetta rossi come
"L'IBAN non corrisponde".

**Decisione**: l'argomento "Account e sicurezza" non ha più un colore fisso
rosso. Il colore lo decide la singola notizia
(`accountNotificationTone` in `apps/web/src/lib/notificationTopicStyle.ts`):

- **buona** (identità verificata da Stripe, badge Verificato, account
  riattivato, misura annullata, mesi gratis attivi o regalati, abbonamento
  rinnovato o pagato): scudo con spunta, verde "fatto" (`brand.verificato`)
  su verde chiaro;
- **cattiva** (sospensione, chiusura, misura, badge tolto, verifica non
  riuscita, codice fiscale o P.IVA non validi, Stripe sospeso, IBAN diverso,
  pagamento dell'abbonamento non riuscito): resta rossa;
- **neutra** (Termini cambiati, promemoria, documenti pronti, scadenze):
  scudo grafite su crema, come i messaggi.

Vale per la tendina della campanella e per i popup in basso (stessa
funzione). Nella pagina Impostazioni → Notifiche la scheda "Account e
sicurezza" prende lo stile neutro: non è più rossa come un errore.

**Motivo**: verde = fatto, rosso = errori (palette A, 11/11). Un rosso su una
buona notizia fa pensare a un problema e insegna a ignorare il rosso.

**Verifica**: foto prima/dopo della tendina su telefono e computer in
`anteprime/notifiche-positive-verdi/` della cartella condivisa.
