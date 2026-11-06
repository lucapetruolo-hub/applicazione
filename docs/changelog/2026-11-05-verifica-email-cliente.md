# Il cliente conferma l'email prima di accettare un preventivo (05/11/2026)

**Richiesta di Luca:** "per la verifica email del cliente, vedi se altri siti di alto valore richiedono la verifica del cliente e come e quando, fai un analisi per come procedere". Analisi in `analisi/verifica-email-cliente.md` (cartella del progetto). Il 05/11 Luca ha risposto "si procedi" al consiglio e alla miglioria sul messaggio del server.

## Decisione

La richiesta e la chat restano libere. Il cliente conferma l'email **prima di accettare un preventivo**, cioè quando fissa l'appuntamento e consuma uno dei lavori del professionista (come Airbnb prima della prenotazione e MyBuilder quando si sceglie l'artigiano). Chi entra con Google è già confermato. Si accende con la stessa `EMAIL_VERIFICATION_REQUIRED=true` dei professionisti, dopo il dominio su Resend (checklist di lancio, punto 23). Finché è spenta non cambia niente.

## Cosa cambia

- **Server**: `VerifiedEmailGuard` su `POST /bookings/from-quote/:quoteId`, da cui parte anche l'acconto online, e su `POST /professionals/:id/agenda/book`. Il blocco risponde con il codice `EMAIL_NOT_VERIFIED`. Il messaggio non parla più del "codice" e di "Inserisci il codice", ma del pulsante nell'email.
- **Email cambiata**: al cliente che corregge l'email ora parte subito il link nuovo quando la conferma è richiesta (prima solo ai professionisti).
- **Sito**: nella finestra "Prima di accettare", premendo "Accetta" senza email confermata compare "Conferma la tua email per fissare l'appuntamento". L'email parte da sola, poi "Apri Gmail", il codice di riserva ed "Email sbagliata? Correggila". Appena confermata (anche dal telefono) l'accettazione riparte con la stessa scelta di pagamento e gli stessi dati della fattura. È lo stesso riquadro di `/account` (`ClientEmailVerificationCard`, con titolo e testo propri), nessuna strada nuova.

## Verifica

- `email-verification.test.ts`: il blocco ha il codice `EMAIL_NOT_VERIFIED` e parla del pulsante; al cliente che cambia l'email il link parte solo con la conferma richiesta.
- Le prove e2e girano con `EMAIL_VERIFICATION_REQUIRED=false`: la conferma all'accettazione va provata a mano quando si accende, insieme al punto 23 della checklist.
