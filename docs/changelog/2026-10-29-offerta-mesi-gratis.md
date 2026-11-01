# Offerta mesi gratis decisa in Admin

**Richiesta** (Luca, 29/10/2026). All'inizio: "non farla tornare a pagamento
fino a che non lo seleziono io da admin". Poi: "Voglio che rimanga l'offerta
dei 3 mesi gratis che si aggiornano come se fossero 3 abbonamenti un mese
dopo l'altro, non limitare i tre mesi gratis solo ai 100 utenti anche se sul
sito comparirà così, ma dai a me la possibilità di smettere quando voglio
avendo il numero di iscritti fra professionisti e anche clienti su admin".

**Decisioni di Luca**
1. 3 mesi Base gratis a tutti gli iscritti finché l'offerta è attiva. Sul
   sito resta scritto "primi 100".
2. Dopo i mesi gratis parte Base mensile in automatico. Va detto quando si
   attivano i mesi gratis.
3. Carta obbligatoria da subito, controllata da Stripe senza addebito. I mesi
   restano gratis: i primi mesi a 0,99 € sono stati valutati e scartati
   (`analisi/offerta-mesi-a-099-valutazione.md` nei file del progetto).
4. Da Admin Luca ferma l'offerta quando vuole, o ne crea un'altra (es. 1
   mese). Chi era iscritto prima tiene i suoi mesi; dopo l'arresto, chi
   arriva non ha mesi gratis.
5. Plus o Pro durante i mesi gratis: si paga subito il mese del livello meno
   19 € (Plus 40 €, Pro 80 €, + IVA). Da quel giorno parte un mese nuovo con
   0 lavori, poi il rinnovo mensile con l'email di avviso.
6. I mesi gratis non iniziati restano in attesa e si riprendono tornando a
   Base. Non si perdono mai, nemmeno a offerta fermata ("li avrà sempre i 3
   mesi gratis meno la sottoscrizione già usata").
7. Per ora solo il mensile, per valutare i livelli con dati reali.
8. L'interruttore "Abbonamenti a pagamento" in Admin (prima versione della PR)
   è stato tolto: decide l'offerta.

Il "mese gratuito per tutti" e il "mese regalato a sorpresa" spariscono: li
sostituisce l'offerta.

**Come funziona**
- `SubscriptionOffer`: offerte create in Admin. Senza nessuna riga vale
  l'offerta di partenza da 3 mesi. `Subscription.freeMonthsGranted` sono i
  mesi del giro in corso, `freeMonthsWaiting` quelli in attesa e
  `returnToBaseAt` la richiesta "Torna a Base".
- Carta: "Attiva i mesi gratis" apre un Checkout di Stripe per Base mensile,
  con `trial_end` alla fine dei mesi gratis.
  - Senza la carta, dal lancio il profilo va in pausa (`CARD_NEEDED`), con
    banner, email e notifica.
  - Prima del lancio la carta si dà solo con `LAUNCH_DATE` fissata: senza
    quella data la fine dei mesi gratis su Stripe non sarebbe sicura.
- Plus o Pro nei mesi gratis:
  - con la carta già data, `subscriptions.update` con `trial_end: "now"`, il
    coupon `mese-base-gratis-1900` (una volta) e `error_if_incomplete`;
  - senza carta, un Checkout di Plus o Pro con lo stesso coupon.
  - In entrambi i casi `applyStripeSubscription` vede l'abbonamento pagato
    mentre i mesi gratis scorrono: mette in attesa i mesi dopo quello in
    corso e fa partire i lavori da 0.
- Prima del lancio Plus e Pro non si scelgono, perché non c'è limite di
  lavori.
- Torna a Base: un controllo ogni 10 minuti (`runReturnToBase`) passa
  l'abbonamento a Base 20 minuti prima della scadenza, così Stripe non
  rinnova il livello pagato.
  - Con mesi in attesa, Base riparte con quei mesi di prova.
  - Ad abbonamento concluso, scegliendo Base i mesi in attesa ripartono con
    il Checkout.
- Admin → Profili da confermare, riquadro "Offerta mesi gratis":
  - stato dell'offerta;
  - professionisti e clienti iscritti, in tutto e da quando è partita
    l'offerta, esclusi gli account di prova;
  - quanti professionisti sono nei mesi gratis e quanti hanno mesi in attesa;
  - "Ferma l'offerta" e "Avvia" solo per il super admin, con il registro
    delle azioni.
- La pagina prezzi mostra i mesi dell'offerta attiva, senza l'interruttore
  annuale. La banda "primi 100" resta finché ci sono posti e l'offerta è
  attiva.
- Termini aggiornati sui mesi gratis, sulla carta e sul solo mensile.

**Correzione dal collaudo del 29/10/2026 (E-01)**: la pagina diceva "Nessun
costo fino al lancio" ma, senza `LAUNCH_DATE`, Stripe addebitava la quota di
passaggio (141,96 € + IVA). Ora prima del lancio non parte nessuna quota,
anche senza la data, e non si possono scegliere Plus o Pro.

**Verifica**
- Test su regole, servizio e Checkout: offerta attiva, fermata e nuova; mesi
  in attesa; ritorno a Base; nessun addebito senza `LAUNCH_DATE`.
- `pnpm typecheck` e `pnpm lint` puliti.
