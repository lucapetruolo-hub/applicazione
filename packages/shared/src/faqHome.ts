/**
 * Le due domande frequenti della home, in un file a parte: la home le scarica
 * senza portarsi dietro tutte le altre risposte di `faq.ts` (pagina da tenere
 * leggera da telefono, docs/changelog/2026-11-09-meno-javascript-comune.md).
 * In `/faq` stanno in cima alla parte "Per chi cerca".
 */
export type FaqAudience = "cliente" | "professionista";

export type FaqItem = {
  /** Ancora della domanda in `/faq#<id>`: non cambiarla, la usano i link. */
  id: string;
  audience: FaqAudience;
  topic: string;
  question: string;
  answer: string;
  /** Al posto di `answer` finché i pagamenti online non sono attivi. */
  answerWithoutOnline?: string;
  /** Domanda nascosta finché i pagamenti online non sono attivi. */
  onlineOnly?: boolean;
  /** "Scopri di più" verso questa pagina del sito. */
  more?: string;
  /** "Scopri di più" che si apre sul posto, per il conto o il dettaglio. */
  detail?: string;
  /** Domanda dei mesi gratis: `{mesi}` diventa "3 mesi"; nascosta senza offerta attiva. */
  founderOffer?: boolean;
};

export const FAQ_HOME: readonly FaqItem[] = [
  {
    id: "quanto-costa",
    audience: "cliente",
    topic: "Come funziona",
    question: "Quanto costa usare il servizio?",
    answer: "È gratis per chi cerca un professionista. Paghi solo il lavoro che fai fare, al prezzo del preventivo che scegli.",
  },
  {
    id: "registrazione",
    audience: "cliente",
    topic: "Come funziona",
    question: "Devo registrarmi per ricevere un preventivo?",
    answer:
      "Sì, serve un account gratuito (email o Google) per inviare la richiesta e ricevere i preventivi. Bastano pochi secondi, nessuna carta richiesta.",
  },
];

/**
 * "Chi mi fa la fattura?": sta tra le domande sui pagamenti e, dal collaudo
 * del 19/11 (voce N13, docs/changelog/2026-11-19-whatsapp-nelle-scritte.md),
 * anche in home, con la riga sulla detrazione già scritta nella finestra
 * "Accetta il preventivo".
 */
export const FAQ_CLIENT_INVOICE: FaqItem = {
  id: "fattura-cliente",
  audience: "cliente",
  topic: "Pagamenti",
  question: "Chi mi fa la fattura o la ricevuta?",
  answer:
    "Il professionista, perché il lavoro lo fai fare a lui. Puoi chiedergliela con \"Chiedi la fattura\" dalla scheda del lavoro: gli arrivano i dati che servono. Se vuoi la detrazione per i lavori in casa, di solito serve il bonifico parlante e non la carta: scegli il pagamento diretto.",
};
