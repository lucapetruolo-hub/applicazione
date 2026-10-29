# Email delle notifiche: riassunto della sera, notte senza email, "Non riceverle più"

**Richiesta di Luca (29/10/2026):** "Effettua le 5 migliorie" proposte come
farebbe un esperto: link per non ricevere più un'email, riassunto della sera,
impostazioni più leggere, conteggio admin degli avvisi spenti, niente email di
notte. Sul riassunto: "se non ci sono novità non mandare nessuna mail".

## Decisioni

1. **"Non ricevere più email come questa"** in fondo a ogni email di notifica
   (e intestazione `List-Unsubscribe`): link firmato
   (`apps/api/src/notifications/email-off.ts`) che apre `/notifiche/email`
   senza accedere. Serve un tocco su "Non riceverle più", come per la
   conferma dell'email, perché i programmi di sicurezza delle caselle aprono
   i link da soli. Spegne solo l'email di quell'avviso (o dell'argomento per
   Messaggi e Promemoria), mai il sito; "Annulla" riaccende. Gli avvisi
   sempre attivi (problemi sul lavoro, account) non hanno il link.
2. **Riassunto della sera** (`digest`, acceso di serie): gli avvisi senza
   fretta (`NOTIFICATION_DIGEST_TYPES`: recensioni, pagamenti ricevuti,
   documenti pronti, rinnovi...) non partono subito ma alle 19 in un'unica
   email. Con un solo avviso parte la sua email di sempre; **senza avvisi
   nessuna email**. Ciò che è già stato letto sul sito non si rimanda.
3. **Impostazioni più leggere di serie**: email delle nuove recensioni spenta
   (resta nel sito e nel riassunto se riaccesa), riassunto e notte accesi.
   Vale solo per chi non ha mai toccato i singoli avvisi.
4. **Admin → Statistiche, "Avvisi spenti"**: per professionisti e clienti,
   quante persone hanno spento ogni argomento e avviso (sito ed email), il
   riassunto e la notte. Senza account di prova.
5. **Di notte niente email** (`quietNight`, acceso di serie): dalle 22 alle 7
   le email aspettano le 7 (riassunto della notte se sono più di una),
   anche quelle dei messaggi in chat. Le **richieste urgenti** partono sempre
   subito.

Tecnica: colonna `notifications.emailHoldUntil` (migrazione
`20261029090000_notifiche_email_rimandate`), calcolo in `email-hold.ts`,
invio ogni 5 minuti da `HeldEmailsService`; nella pagina Notifiche la nuova
sezione "Quando arrivano le email".

## Verifica

- Test: `apps/api/src/notifications/email-hold.test.ts` (orari anche d'estate
  e al cambio d'ora, link firmati, conteggi admin), test di `packages/shared`.
- Anteprime in `anteprime/notifiche-impostazioni/` (email, pagina "Non
  riceverle più", sezione email, pannello admin), computer e telefono.

## Seguito: le 3 migliorie (Luca, 29/10/2026: "Effettua le 3 migliorie")

- **Ora della sera a scelta** (18, 19, 20 o 21; di serie 19): tendina "Alle"
  nel riquadro "Riassunto della sera" (`notificationPrefs.digestHour`,
  `NOTIFICATION_DIGEST_HOURS`). Alla stessa ora arriva al professionista il
  riepilogo dei lavori di domani (`AgendaTomorrowSummaryService`, che ora
  gira dalle 18 alle 21 e manda a ognuno alla sua ora).
- **Una sola ora anche per WhatsApp**: la PR #184 non è ancora unita; i passi
  per collegarla sono nella cartella del progetto,
  `patch/notifiche-186-con-184/una-sola-ora-della-sera.md`, e si fanno
  all'unione.
- **Avviso del lunedì**: tra i consigli della settimana, quando più del 20%
  dei professionisti o dei clienti spegne lo stesso avviso (con almeno 20
  persone, `OPT_OUT_ADVICE_SHARE`/`OPT_OUT_ADVICE_MIN_PEOPLE` in
  `apps/api/src/admin/site-stats.ts`), al massimo due, con il link ad
  "Avvisi spenti".

## Seguito: urgenti anche di notte (Luca, 29/10/2026)

"Di notte niente email è attivo di default, dai la possibilità di non ricevere
neanche le urgenti di notte, attiva di default anche questa": nel riquadro
"Di notte niente email" il professionista ha la spunta "Anche le richieste
urgenti" (`quietNightUrgent`, accesa di serie). Così di notte aspettano le 7
anche le richieste urgenti; chi toglie la spunta le riceve subito. Cambia il
punto 5 qui sopra. In Admin → Statistiche si conta chi le vuole anche di notte.
