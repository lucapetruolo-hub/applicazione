/**
 * Domande "Cosa succede se...": testo fornito verbatim dall'utente,
 * pubblicato come scritto sulla stessa autorizzazione esplicita di
 * "Garanzia Piattaforma" (§30, risposta "Pubblicale come scritte").
 * Risposte allineate alle regole reali di pagamento e segnalazioni
 * (docs/CHANGELOG.md §168): prima promettevano rimborso e sostituto
 * "entro 4 ore" e "non paghi la differenza", mai esistiti.
 *
 * Non più una sezione a sé con una propria eyebrow "Cosa succede se...":
 * richiesta esplicita dell'utente di unire questi elementi alla lista
 * "Domande frequenti" già esistente su `/faq`, eliminando quel titolo —
 * questo file espone solo i dati, il rendering vive in `FaqContent.tsx`
 * insieme a `FAQ_ITEMS` (`HomeFaq.tsx`).
 */
export const WHAT_IF_ITEMS: { question: string; answer: string; answerWithoutOnline?: string }[] = [
  {
    question: "Cosa succede se il professionista non si presenta?",
    answer: "Se hai pagato online ti rimborsiamo l'acconto e con un tasto mandi la stessa richiesta ad altri professionisti della zona. Se hai scelto il pagamento diretto, ti mettiamo in contatto con il professionista per trovare un accordo.",
    // Finché il pagamento online non è attivo (docs/CHANGELOG.md §169).
    answerWithoutOnline: "Puoi segnalarlo e con un tasto mandi la stessa richiesta ad altri professionisti della zona. Per il pagamento ti mettiamo in contatto con il professionista per trovare un accordo.",
  },
  {
    question: "Cosa succede se il lavoro non è fatto bene?",
    answer: "Hai 14 giorni per segnalarlo, con una foto. Il professionista ha 48 ore per proporti una soluzione; se hai pagato online e non vi accordate decide il nostro team e, se la segnalazione è accolta, ti rimborsiamo.",
    answerWithoutOnline: "Hai 14 giorni per segnalarlo, con una foto. Il professionista ha 48 ore per proporti una soluzione in chat, e potete accordarvi direttamente tra voi.",
  },
  {
    question: "Cosa succede se il preventivo finale è più alto di quello concordato?",
    answer: "Il professionista deve motivare ogni voce aggiunta o differenza dal preventivo, e la vedi prima di pagare il saldo. Se non sei d'accordo puoi segnalarlo.",
  },
  {
    question: "Posso cambiare professionista dopo aver ricevuto il preventivo?",
    answer: "Sì, senza costi né obblighi. Fino alla conferma della prenotazione sei libero.",
  },
];
