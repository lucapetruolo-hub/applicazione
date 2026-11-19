"use client";

import { Section, brand } from "@professionisti/ui";
import { FAQ_CLIENT_INVOICE, FAQ_HOME } from "@professionisti/shared";

// Le domande della home vengono dalla fonte unica delle domande frequenti
// (packages/shared/src/faq.ts, docs/changelog/2026-11-16-domande-frequenti.md).
// La terza, sulla fattura, dal collaudo del 19/11 (voce N13).
const HOME_FAQ = [...FAQ_HOME, FAQ_CLIENT_INVOICE];

/**
 * Micro-FAQ a scomparsa sotto "Come funziona" (richiesta esplicita
 * dell'utente) — stesso pattern `<details>/<summary>` nativo già in uso
 * per il drawer mobile di MegaMenu.tsx, nessuna libreria di accordion
 * aggiunta.
 */
export function HomeFaq() {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  return (
    <Section maxWidth={1080}>
      <div className="home-faq">
        {HOME_FAQ.map((item) => (
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
