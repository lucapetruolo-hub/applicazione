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

## Secondo giro: le quattro migliorie (Luca: "fai tutte 4 migliorie")

1. **Stessa regola in tutte le sezioni**: il tono viene dall'icona del testo
   della notifica (`notificationTone` in `notificationTopicStyle.ts`): ✅ 🥳
   🎁 👍 verde, ⚠️ ⛔ rosso, più quattro tipi cattivi con un'icona propria
   (verifica non riuscita, bonifico non arrivato, rimborso non accolto,
   account in pausa). Il resto tiene il colore dell'argomento. Per esempio
   "Un bonifico non è arrivato" in "Lavori" ora è rosso, "Il cliente ha
   accettato il tuo preventivo" è verde.
2. **IBAN segnalato due volte**: durante l'attivazione Stripe manda più
   `account.updated` quasi insieme; letti in parallelo, ognuno vedeva
   l'esito vecchio e mandava la notifica. Ora il cambio di esito si scrive
   con una condizione (`updateMany` con `stripeCheck` diverso): Postgres
   mette in fila le due scritture e solo la prima avvisa.
3. **Ultime 4 cifre**: notifica ed email dicono "l'IBAN che ci hai dato
   finisce con 1234, il conto su Stripe con 9876" (solo le ultime 4 cifre,
   come già nella pagina Pagamenti online).
4. **IBAN tornato a posto**: nuovo tipo `PAYOUT_IBAN_MATCHED`, verde, quando
   un controllo passa da "diverso" a "uguale" (anche nel riassunto email
   della sera, non subito).

**Verifica**: `payout-iban-notifications.test.ts` (due webhook insieme = una
notifica, cifre nel payload, notizia buona); typecheck di API e sito, lint del
sito, test di shared ed email. Foto `dopo2-*` nella stessa cartella.
