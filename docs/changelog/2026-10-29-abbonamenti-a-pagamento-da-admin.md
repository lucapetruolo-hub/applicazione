# Abbonamenti a pagamento accesi da Admin

**Richiesta** (Luca, 29/10/2026): "È vero che abbiamo dato la prova gratuita
ai primi 100, ma non farla tornare a pagamento fino a che non lo seleziono io
da admin".

**Decisione**: un interruttore unico "Abbonamenti a pagamento" in Admin →
Profili da confermare, sopra l'elenco dell'offerta di lancio
(`SubscriptionSettings.paidFrom`, `GET/POST /admin/paid-start`; vederlo
basta essere admin, cambiarlo solo il super admin, registrato nel registro
azioni).

- **Spenti** (com'è ora, di serie): nessun periodo gratuito finisce, né il
  mese gratuito né i 3 mesi dei primi 100. Niente pausa a fine prova, niente
  email di fine prova o mese regalato, nessun livello da scegliere (il
  pulsante dice "Disponibile più avanti", l'API rifiuta il pagamento) e
  nessun limite di lavori, come prima del lancio: senza un livello superiore
  da comprare un limite sarebbe un vicolo cieco. La pagina Abbonamento dice
  "Periodo gratuito" e "Prima che diventi a pagamento ti avvisiamo con
  almeno 14 giorni di anticipo".
- **Accesi da un giorno** (almeno `PAID_START_MIN_NOTICE_DAYS` = 14 giorni
  dopo, con conferma): ogni periodo gratuito arriva almeno a quel giorno
  (anche per chi si iscrive dopo, `ensureTrial` e giro di ogni ora), e chi è
  nel periodo gratuito riceve subito l'email `SUBSCRIPTION_PAID_START` con la
  sua data (i primi 100 con mesi oltre quel giorno li tengono). Da lì valgono
  le regole di sempre: si può scegliere il livello (primo addebito quel
  giorno), 3 giorni prima il promemoria di fine periodo gratuito (e il mese
  regalato a chi non ha avuto lavori), poi la pausa per chi non ha scelto.
- **Rispenti**: si torna tutti gratis; se il giorno non era ancora arrivato
  parte l'email `SUBSCRIPTION_PAID_START_POSTPONED`. Chi ha già scelto un
  livello lo tiene: il suo primo addebito è fissato su Stripe, e il
  riquadro lo dice prima della conferma.
- Gli **account di prova** (§395) non aspettano l'interruttore, così il
  collaudo e "Fai passare il tempo" provano lo stesso la fine del mese
  gratuito.

Vale per tutti i professionisti nel periodo gratuito, non solo per i primi
100 (raccomandazione proposta a Luca con una scelta: una regola sola e lo
stesso preavviso per tutti).

**Verifica**: test in `subscriptions-launch.test.ts` (niente pausa da
spenti, account di prova in pausa lo stesso, avvisi di fine prova solo agli
account di prova, accensione con allineamento delle date ed email con la
data di ciascuno, minimo 14 giorni, rispegnimento con email, iscrizione dopo
l'accensione) e in `subscription-rules.test.ts`; `tsc`, lint e tutti i test
di `apps/api`.
