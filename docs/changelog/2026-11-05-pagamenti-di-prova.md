# Giro dei pagamenti di prova: rimborsi fatti da un altro ambiente (05/11/2026)

**Richiesta di Luca:** "effettua un secondo giro con il pagamento online di prova, che comprende tutte le casistiche dei pagamenti". Rapporto in `collaudo/2026-11-04-utente-nuovo/pagamenti/rapporto-pagamenti.md` (cartella del progetto).

## Cosa è successo

Gli acconti di quattro lavori di prova (600 €, 20 €, 20 €, 18 €) sono stati rimborsati su Stripe circa 2 secondi dopo il pagamento, con il motivo "Preventivo non trovato.". Il colpevole era la prova `iscrizione-carta` della CI: con `stripe listen` riceve **tutti** gli eventi della sandbox Stripe. La sua API, con il database vuoto, non trovava il preventivo e rimborsava l'acconto (`confirmQuoteDeposit`). Il sito non se n'è accorto: per lui i lavori erano ancora pagati, e annullandoli non c'era più niente da rimborsare.

## Decisioni di Luca ("tutti e tre sì")

1. **Sandbox separata per la CI**: Luca ha creato una seconda sandbox Stripe e ne ha messo la chiave nel segreto `E2E_STRIPE_SECRET_KEY` di GitHub. Il sito resta sulla sandbox di prima.
2. **Un pagamento per un preventivo sconosciuto non si rimborsa più** (`BookingsService.confirmQuoteDeposit`). Se il preventivo non è mai esistito in questo database, il pagamento è di un altro ambiente collegato allo stesso Stripe: va alla Finanza con l'avviso `ADMIN_STRIPE_UNKNOWN_PAYMENT`. Resta il rimborso automatico quando il preventivo esiste ma non si può più confermare (ritirato, cambiato, un altro accettato).
3. **Rimborsi fatti fuori dal sito registrati sul lavoro** (`OnlineMoneyService.handleChargeRefunded`, webhook `charge.refunded` su entrambi gli endpoint, già aggiunto alla sandbox). I nostri rimborsi portano `metadata.jobPaymentId` e si saltano. Gli altri si registrano una volta sola: una riga `Refund` con lo `stripeRefundId`, poi `refundedEurCents` sul pagamento; se il lavoro è rimborsato tutto, non viene più sbloccato al professionista. Avvisi: `ADMIN_JOB_REFUND_OUTSIDE` alla Finanza (dice se i soldi erano già sbloccati, da controllare a mano) e `JOB_REFUND_COMPLETED` al cliente.

## Verifica

- `bookings.service.test.ts`: preventivo sconosciuto, nessun rimborso e avviso alla Finanza.
- `charge-refunded.test.ts`: rimborso dalla Dashboard registrato, nostri e già visti saltati, parziale che non chiude il lavoro, pagamento che non è di un lavoro.
- Checklist di lancio: `charge.refunded` sugli endpoint live.

## Segnalazione aperta un'ora in ritardo (trovato provando la segnalazione alle 22)

Gli orari degli appuntamenti sono salvati come ora italiana scritta in UTC (`wallClockNow()` in `packages/shared/src/appointmentTime.ts`). La segnalazione ("Il lavoro non è andato bene" e "Non si è presentato") confrontava invece l'orario con `new Date()`. Così si apriva un'ora dopo l'inizio dell'appuntamento, due d'estate: alle 22:12 un appuntamento delle 22:00 risultava "non ancora iniziato". Ora `reportIssue` e la scheda del lavoro (`issueTypesAllowed`, `issueLate`) usano `wallClockNow()`, come l'annullamento e lo spostamento. Prova in `bookings.service.test.ts`: alle 22:05 italiane si segnala, alle 21:55 no.
