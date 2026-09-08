/**
 * Domande "Cosa succede se...": testo fornito verbatim dall'utente,
 * pubblicato come scritto sulla stessa autorizzazione esplicita di
 * "Garanzia Piattaforma" (§30, risposta "Pubblicale come scritte") —
 * promette rimborsi/sostituzioni non ancora implementati (nessun
 * pagamento in piattaforma per il lavoro, CLAUDE.md §9).
 *
 * Non più una sezione a sé con una propria eyebrow "Cosa succede se...":
 * richiesta esplicita dell'utente di unire questi elementi alla lista
 * "Domande frequenti" già esistente su `/faq`, eliminando quel titolo —
 * questo file espone solo i dati, il rendering vive in `FaqContent.tsx`
 * insieme a `FAQ_ITEMS` (`HomeFaq.tsx`).
 */
export const WHAT_IF_ITEMS = [
  {
    question: "Cosa succede se il professionista non si presenta?",
    answer: "Ti rimborsiamo immediatamente e troviamo un sostituto entro 4 ore.",
  },
  {
    question: "Cosa succede se il lavoro non è fatto bene?",
    answer: "Hai 14 giorni per segnalarlo. Il professionista rientra a sue spese o ti rimborsiamo.",
  },
  {
    question: "Cosa succede se il preventivo finale è più alto di quello concordato?",
    answer: "Non paghi la differenza. Il prezzo concordato in piattaforma è vincolante.",
  },
  {
    question: "Posso cambiare professionista dopo aver ricevuto il preventivo?",
    answer: "Sì, senza costi né obblighi. Fino alla conferma della prenotazione sei libero.",
  },
];
