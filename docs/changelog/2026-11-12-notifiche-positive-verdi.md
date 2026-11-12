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

## Terzo giro (Luca: "si" alle due migliorie dopo l'unione di #335)

1. **"Lavori e appuntamenti" in blu ardesia** (`brand.ardesia` #3E5A73 su
   `brand.ardesiaVelo` #E3EAF1, 7,2:1 su bianco): prima il colore di base era
   verde, quindi un promemoria normale sembrava una buona notizia. Ora il
   verde vuol dire solo "fatto".
2. **IBAN: niente secondo avviso dopo un momento in cui Stripe non risponde**
   (`keepKnownCheck` in `payout-account.service.ts`): se Stripe non risponde
   resta l'ultimo esito vero ("uguale" o "diverso"), invece di scrivere
   "non disponibile". Prima diverso → non disponibile → diverso faceva
   arrivare di nuovo la notifica. Vale per il webhook e per l'apertura della
   pagina. Un IBAN nuovo scritto dal professionista riparte da capo.

**Verifica**: nuovi test in `payout-iban-notifications.test.ts`, che falliscono
senza la correzione e passano con la correzione; typecheck di API, sito e ui,
lint del sito. Foto `dopo3-*`.

## Quarto giro (Luca: "Effettua le due migliorie poi unisci")

1. **"Nuove richieste" in indaco** (`brand.indaco` #55508A su
   `brand.indacoVelo` #ECEAF5, 7,2:1 su bianco): prima era il verde acqua dei
   pulsanti, quasi uguale al verde delle buone notizie.
2. **Ultime 4 cifre nella pagina Pagamenti online**: con l'IBAN diverso,
   sotto il bollino rosso si legge "Questo IBAN finisce con 1234, il conto su
   Stripe con 9876". Le cifre di Stripe non si salvano: l'API le legge da
   Stripe solo quando l'esito è "diverso" (`stripeLast4` in
   `PayoutAccountView`, nullo negli altri casi).

**Verifica**: typecheck di API e sito, lint, test di `professional-fiscal`.
Foto `dopo4-*` e `iban-pagina-telefono.png`.
