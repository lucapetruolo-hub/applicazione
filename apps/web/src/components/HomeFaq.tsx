"use client";

import { Section, brand } from "@professionisti/ui";

// Risposta corretta rispetto alla proposta originale dell'utente ("ti
// registri solo se vuoi prenotare"): GuidedRequestForm richiede già un
// account per inviare la richiesta stessa (non solo per prenotare, vedi
// il ramo "Accedi per inviare la richiesta" del form) — la domanda resta
// utile ma la risposta deve restare vera, mai una promessa che il
// prodotto non mantiene.
const FAQ_ITEMS = [
  {
    question: "Quanto costa usare il servizio?",
    answer: "È gratis per chi cerca un professionista. Paghi solo il lavoro che fai fare.",
  },
  {
    question: "Devo registrarmi per ricevere un preventivo?",
    answer:
      "Sì, serve un account gratuito (email o Google) per inviare la richiesta e ricevere i preventivi — bastano pochi secondi, nessuna carta richiesta.",
  },
];

/**
 * Micro-FAQ a scomparsa sotto "Come funziona" (richiesta esplicita
 * dell'utente) — stesso pattern `<details>/<summary>` nativo già in uso
 * per il drawer mobile di MegaMenu.tsx, nessuna libreria di accordion
 * aggiunta.
 */
export function HomeFaq() {
  return (
    <Section maxWidth={780}>
      <div className="home-faq">
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="home-faq-item">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
      <style jsx>{`
        .home-faq {
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .home-faq-item {
          border-top: 1px solid ${brand.filetto};
          padding: 18px 0;
        }
        .home-faq-item:last-child {
          border-bottom: 1px solid ${brand.filetto};
        }
        .home-faq-item summary {
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
        .home-faq-item summary::-webkit-details-marker {
          display: none;
        }
        .home-faq-item summary::after {
          content: "+";
          font-size: 20px;
          font-weight: 400;
          color: ${brand.grafite70};
          margin-left: 16px;
          flex-shrink: 0;
        }
        .home-faq-item[open] summary::after {
          content: "−";
        }
        .home-faq-item p {
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
