"use client";

import { Section, brand } from "@professionisti/ui";

/**
 * "Cosa succede se...": testo fornito verbatim dall'utente, pubblicato come
 * scritto sulla stessa autorizzazione esplicita di "Garanzia Piattaforma"
 * (§30, risposta "Pubblicale come scritte") — promette rimborsi/sostituzioni
 * non ancora implementati (nessun pagamento in piattaforma per il lavoro,
 * CLAUDE.md §9). Stesso pattern accordion `<details>/<summary>` già in uso
 * in `HomeFaq.tsx`, nessuna libreria aggiunta.
 */
const ITEMS = [
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

export function WhatIfSection() {
  return (
    <Section eyebrow="Cosa succede se..." maxWidth={780}>
      <div className="what-if">
        {ITEMS.map((item) => (
          <details key={item.question} className="what-if-item">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
      <style jsx>{`
        .what-if {
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .what-if-item {
          border-top: 1px solid ${brand.filetto};
          padding: 18px 0;
        }
        .what-if-item:last-child {
          border-bottom: 1px solid ${brand.filetto};
        }
        .what-if-item summary {
          cursor: pointer;
          list-style: none;
          font-family: inherit;
          font-weight: 700;
          font-size: 16px;
          color: ${brand.grafite};
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .what-if-item summary::-webkit-details-marker {
          display: none;
        }
        .what-if-item summary::after {
          content: "+";
          font-size: 20px;
          font-weight: 400;
          color: ${brand.grafite70};
          margin-left: 16px;
          flex-shrink: 0;
        }
        .what-if-item[open] summary::after {
          content: "−";
        }
        .what-if-item p {
          margin: 12px 0 0;
          font-family: inherit;
          font-size: 15px;
          line-height: 1.5;
          color: ${brand.grafite70};
        }
      `}</style>
    </Section>
  );
}
