# Recesso entro 14 giorni, prezzi con IVA e promemoria della Certificazione Unica

**Richiesta** (Luca, 26/11/2026, dopo le risposte del commercialista): chi
lavora senza partita IVA è un consumatore, quindi vede i prezzi
dell'abbonamento con l'IVA inclusa e può recedere entro 14 giorni "come fa
Claude", su richiesta, scritto nei Termini con una versione nuova; per i
livelli a pagamento il rimborso è quanto pagato meno i lavori usati. In più
(sì di Luca alla miglioria): a inizio anno un promemoria al professionista
occasionale per chiedere la Certificazione Unica alle aziende che hanno
trattenuto la ritenuta.

**Decisione**:
- **Prezzi con IVA**: `MySubscription.pricesWithVat` (vero per
  `entityType = PRIVATE_INDIVIDUAL`) e `subscriptionPriceLabel` in
  `packages/shared/src/plans.ts`: "23,18 € IVA inclusa" invece di "19 € + IVA"
  nella pagina Abbonamento, nel riquadro del limite di lavori, nel banner di
  pausa e nei passi di "Completa il profilo". Le pagine pubbliche per i
  professionisti restano "+ IVA" (lì non si sa ancora chi legge).
- **Recesso**: tabella nuova `subscription_withdrawals` (migrazione solo
  additiva). Si può chiedere entro 14 giorni dal primo pagamento di un livello
  (dopo i mesi gratis o passando a un livello superiore), letto da Stripe: un
  pagamento prima con lo stesso prezzo vuol dire rinnovo, e lì niente recesso.
  Il rimborso è quanto pagato meno la parte usata, la più alta tra giorni del
  periodo e lavori compresi già accettati (`subscriptionWithdrawalRefundEurCents`;
  Pro solo giorni). Una richiesta per pagamento.
- Riquadro "Recesso entro 14 giorni" nella pagina Abbonamento con il rimborso
  stimato e il motivo facoltativo; la richiesta va in Admin → Pagamenti,
  sezione "Recessi dall'abbonamento" (scope `FINANCE`): Approva e rimborsa
  (cifra modificabile, mai oltre il pagato) o Rifiuta con il motivo. Approvando
  l'abbonamento si chiude subito su Stripe e parte il rimborso sulla carta; la
  nota di credito la fa il webhook `charge.refunded` come per ogni rimborso.
  Doppio tocco protetto (`updateMany` su `PENDING`, chiavi di idempotenza).
- I recessi da decidere si contano nel numero accanto a "Pagamenti" nel menu
  Admin (`pendingSubscriptionWithdrawals` nei contatori della home admin), come
  rimborsi e contestazioni (sì di Luca alla miglioria).
- Email nuove: `SUBSCRIPTION_WITHDRAWAL_RECEIVED`, `_DONE`, `_REJECTED`
  (Account e sicurezza, non si spengono) e `ADMIN_SUBSCRIPTION_WITHDRAWAL` alla
  Finanza.
- **Termini** (versione 2026-11-26, `TERMS_CHANGES`): punto 4 con prezzi IVA
  inclusa per chi non ha partita IVA e il recesso; punto 5 con il cliente
  azienda che trattiene la ritenuta (online al massimo l'80%, PR #500).
  `notify: false` come le altre versioni prima del lancio.
- **Certificazione Unica**: il 15 gennaio alle 9
  (`CourtesyCopyService.remindWithholdingCertificates`) il professionista senza
  partita IVA riceve l'elenco delle aziende che l'anno prima hanno trattenuto
  la ritenuta, con la ritenuta stimata: la CU va data entro il 16 marzo.
  Avviso `WITHHOLDING_CERTIFICATES_REMINDER` in "Fatture chieste dai clienti".

**Motivo**: il Codice del consumo (artt. 52-59) dà 14 giorni di recesso al
consumatore nei contratti a distanza; chi chiede di usare subito il servizio
paga la parte usata. Per un consumatore i prezzi si mostrano IVA inclusa
(art. 13 e 17 del Codice del consumo). La CU serve al professionista per
scalare la ritenuta nella dichiarazione dei redditi.

**Verifica**: `subscription-withdrawal.test.ts` (formula, 14 giorni, rinnovo,
passaggio di livello, una richiesta per pagamento, approvazione senza doppio
rimborso, rifiuto) e test del promemoria CU in `documents-pdf-sdi.test.ts`;
typecheck di API e sito, matrice degli accessi.
