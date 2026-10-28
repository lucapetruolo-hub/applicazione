import type { ProblemSafety } from "./problemMatch";

/**
 * Avvisi di sicurezza mostrati prima dei professionisti (docs/CHANGELOG.md
 * §392). Testi fissi dalle fonti ufficiali (Italgas, Vigili del Fuoco,
 * ARERA, Protezione Civile: analisi/abbinamento-problema/testi-sicurezza.md),
 * decisi sempre dal dizionario, mai dall'intelligenza artificiale. Prima del
 * lancio li rilegge l'avvocato.
 */
export const PROBLEM_SAFETY_TEXTS: Record<ProblemSafety, { steps: readonly string[]; after: string }> = {
  gas: {
    steps: [
      "Apri porte e finestre.",
      "Chiudi la manopola del gas vicino al contatore (o la bombola).",
      "Non accendere e non spegnere luci, non usare campanelli, ascensore o telefono dentro casa. Niente fiamme, sigarette o accendini.",
      "Esci e chiama da fuori il pronto intervento gas: il numero è sulla bolletta, è gratuito e attivo 24 ore su 24. Se l'odore resta, chiama i Vigili del Fuoco al 115 (o il 112).",
    ],
    after: "Poi, quando sei al sicuro, ecco chi può riparare l'impianto.",
  },
  elettrico: {
    steps: [
      "Non toccare la presa, il cavo o il quadro.",
      "Se puoi farlo senza pericolo e lontano dal punto che fa scintille, abbassa l'interruttore generale.",
      "Se c'è fumo o fiamma, esci e chiama i Vigili del Fuoco al 115 (o il 112). Non usare acqua su apparecchi elettrici.",
    ],
    after: "Poi ecco chi può controllare l'impianto.",
  },
  "acqua-elettrico": {
    steps: [
      "Non toccare prese, interruttori o apparecchi con mani o piedi bagnati.",
      "Stacca la corrente dall'interruttore generale solo se è in un punto asciutto. Se è già sott'acqua, non avvicinarti.",
      "Chiudi l'acqua dal rubinetto generale, se riesci senza pericolo.",
      "Non riaccendere apparecchi che si sono bagnati prima del controllo di un tecnico.",
    ],
    after: "Poi ecco chi può controllare l'impianto.",
  },
  monossido: {
    steps: [
      "Spegni la caldaia o la stufa, apri le finestre ed esci all'aria aperta.",
      "Se qualcuno ha mal di testa, nausea o sonnolenza, chiama il 112.",
    ],
    after: "Poi ecco chi può controllare la caldaia.",
  },
};
