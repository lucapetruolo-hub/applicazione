# Passaggio a un livello superiore: prezzo intero e mese nuovo da quel giorno

**Richiesta** (Luca, 25/11/2026, thread "Preparare la cartella per il
commercialista"): chi passa a un livello superiore deve ripartire da 0 con i
lavori da quel giorno; "non bisogna calcolare i giorni non usati, perché più
che i giorni noi vediamo i lavori svolti". Sulla scheda ha scelto "Solo Passa
adesso" (niente secondo pulsante "Passa dal rinnovo").

**Decisione**: con un abbonamento pagato si paga subito il **prezzo mensile
intero** del nuovo livello; da quel giorno parte un mese nuovo, i lavori
ripartono da 0 e il rinnovo si sposta a quella data. Niente giorni scalati,
niente quota a parte. Sostituisce la regola del 26/10 (§361: 10 € più la
differenza per i giorni rimasti, + 10%, con i lavori del mese già contati).
Nei mesi gratis resta la regola del 29/10 (primo mese meno Base, mese nuovo
da oggi).

**Motivo**: il professionista compra lavori, non giorni. Con la quota sui
giorni e i lavori da 0 la regola si sarebbe aggirata (passare a Plus l'ultimo
giorno per circa 13 € e tornare a Base al rinnovo). Prima del pulsante il
riquadro "Se passi oggi" dice "Paghi oggi 59 € + IVA … Il mese riparte da
oggi con 10 lavori", così chi ha appena rinnovato sa che paga il mese intero.

**Come**: `paidUpgradeEurCents` in `packages/shared/src/plans.ts`;
`upgradeQuotes` senza `until`; in `BillingService.upgradeNow` lo stesso cambio
"in sospeso" dei mesi gratis (`pending_if_incomplete`, 3D Secure, carta
rifiutata che non cambia nulla) con `billing_cycle_anchor: { type: "now" }` e
`proration_behavior: "none"`. Stripe fa una fattura normale dell'abbonamento
(nostra fattura ABB "Abbonamento Plus mensile dal … al …"), non più la fattura
a parte `tier_upgrade_fee`; quella vecchia resta gestita per i passaggi
lasciati a metà. Il nuovo periodo di Stripe fa ripartire `usagePeriod`.
Testi: Abbonamento (riquadro, regole, "Scopri di più"), finestra del limite,
avviso di pausa, FAQ, Termini punto 4 (versione 2026-11-25, senza avviso
perché prima del lancio), `docs/prodotto.md`.

**Verifica**: test di `subscription-rules` e `billing-safety` (prezzo intero
e ciclo da oggi senza fattura a parte, carta rifiutata, conferma della banca),
typecheck di API e sito.
