"use client";

import { Section, brand } from "@professionisti/ui";
import { FAQ_ITEMS } from "@/components/HomeFaq";
import { WHAT_IF_ITEMS } from "@/components/WhatIfSection";

/**
 * Richiesta esplicita dell'utente: le due sezioni prima presenti su
 * `/faq` ("Domande frequenti" generiche + "Cosa succede se...") vanno
 * unite in un'unica lista, eliminando il titolo "Cosa succede se...".
 * `FAQ_ITEMS` e `WHAT_IF_ITEMS` restano definiti nei rispettivi file
 * (`HomeFaq.tsx` resta anche montato da solo in homepage con i soli
 * `FAQ_ITEMS`, CLAUDE.md §24) — qui concatenati in un solo accordion
 * sotto l'unico titolo di pagina "Domande frequenti".
 */
const ALL_ITEMS = [...FAQ_ITEMS, ...WHAT_IF_ITEMS];

export default function FaqContent() {
  return (
    <Section title="Domande frequenti" lead="Le risposte alle domande più comuni su come funziona la piattaforma." maxWidth={780}>
      <div className="faq-list">
        {ALL_ITEMS.map((item) => (
          <details key={item.question} className="faq-item">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
      <style jsx>{`
        .faq-list {
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .faq-item {
          border-top: 1px solid ${brand.filetto};
          padding: 18px 0;
        }
        .faq-item:last-child {
          border-bottom: 1px solid ${brand.filetto};
        }
        .faq-item summary {
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
        .faq-item summary::-webkit-details-marker {
          display: none;
        }
        .faq-item summary::after {
          content: "+";
          font-size: 20px;
          font-weight: 400;
          color: ${brand.grafite70};
          margin-left: 16px;
          flex-shrink: 0;
        }
        .faq-item[open] summary::after {
          content: "−";
        }
        .faq-item p {
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
