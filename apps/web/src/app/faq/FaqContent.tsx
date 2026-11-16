"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import { Section, brand } from "@professionisti/ui";
import {
  FAQ_TOPICS,
  faqForAudience,
  faqWithMonths,
  normalizeFaqText,
  type FaqAudience,
  type FaqItem,
  type FounderSpots,
} from "@professionisti/shared";
import { useOnlinePayments } from "@/lib/onlinePayments";
import { useAuth } from "@/lib/AuthContext";
import { highlightDeepLinkTarget } from "@/lib/deepLinkHighlight";

/**
 * Domande frequenti divise tra chi cerca e chi lavora sul sito (richiesta di
 * Luca del 16/11/2026, docs/changelog/2026-11-16-domande-frequenti.md): da 8
 * a circa 60 risposte, quindi una scelta in alto ("Per chi cerca" /
 * "Per i professionisti"), gli argomenti come titoli e un campo per cercare
 * tra le domande, senza IA. Testi in packages/shared/src/faq.ts.
 *
 * `?per=professionisti` apre la parte dei professionisti (link da
 * /per-professionisti); un professionista che ha fatto l'accesso la trova già
 * aperta. `#<id>` apre e illumina quella domanda, anche dall'altra parte.
 */
const AUDIENCES: { value: FaqAudience; label: string }[] = [
  { value: "cliente", label: "Per chi cerca" },
  { value: "professionista", label: "Per i professionisti" },
];

function audienceFromUrl(): FaqAudience | null {
  const per = new URLSearchParams(window.location.search).get("per");
  if (per === "professionisti") return "professionista";
  if (per === "clienti") return "cliente";
  return null;
}

function matches(item: FaqItem, words: string[]): boolean {
  if (words.length === 0) return true;
  // Inizio di parola: "iva" trova "IVA", non "arriva".
  const text = ` ${normalizeFaqText(`${item.question} ${item.answer} ${item.topic}`)}`;
  return words.every((word) => text.includes(` ${word}`));
}

export default function FaqContent({ founders = null }: { founders?: FounderSpots | null }) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const onlinePayments = useOnlinePayments();
  const { user } = useAuth();
  const offerMonths = founders?.offerMonths ?? null;
  // Scelta fatta (o letta dal link); senza, la parte giusta per chi è.
  const [picked, setPicked] = useState<FaqAudience | null>(null);
  const audience: FaqAudience = picked ?? (user?.isProfessional ? "professionista" : "cliente");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const panelId = useId();
  const searchId = useId();

  // Domande visibili oggi: senza pagamenti online e senza offerta di mesi
  // gratis alcune risposte cambiano o spariscono.
  const visible = useMemo(() => {
    const keep = (item: FaqItem) => (!item.onlineOnly || onlinePayments) && (!item.founderOffer || Boolean(offerMonths));
    return {
      cliente: faqForAudience("cliente").filter(keep),
      professionista: faqForAudience("professionista").filter(keep),
    };
  }, [onlinePayments, offerMonths]);

  // Parte giusta all'apertura: link con #domanda, poi ?per=. L'indirizzo si
  // legge solo nel browser, dopo il primo disegno uguale a quello del server.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    const target = hash ? [...visible.cliente, ...visible.professionista].find((item) => item.id === hash) : undefined;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPicked(target ? target.audience : audienceFromUrl());
    if (target) setOpenId(target.id);
  }, [visible]);

  // Porta alla domanda del link e la illumina, una volta aperta.
  useEffect(() => {
    if (!openId) return;
    const el = document.getElementById(openId);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    highlightDeepLinkTarget(openId);
  }, [openId, audience]);

  function choose(next: FaqAudience) {
    setPicked(next);
    const url = new URL(window.location.href);
    url.searchParams.set("per", next === "professionista" ? "professionisti" : "clienti");
    url.hash = "";
    window.history.replaceState(window.history.state, "", url);
  }

  const words = normalizeFaqText(query).split(" ").filter(Boolean);
  const searching = words.length > 0;
  const items = visible[audience].filter((item) => matches(item, words));
  const other: FaqAudience = audience === "cliente" ? "professionista" : "cliente";
  const otherCount = searching ? visible[other].filter((item) => matches(item, words)).length : 0;
  // I link alla propria area servono solo a chi è già un professionista.
  const showLink = (href: string) => !href.startsWith("/dashboard") || Boolean(user?.isProfessional);

  // Disegnata fuori dal JSX del componente: styled-jsx non le dà la sua
  // classe, quindi gli stili delle domande sono :global sotto .faq.
  function renderItem(item: FaqItem) {
    const answer = faqWithMonths(!onlinePayments && item.answerWithoutOnline ? item.answerWithoutOnline : item.answer, offerMonths);
    return (
      <details key={item.id} id={item.id} className="faq-item" open={openId === item.id || undefined}>
        <summary>{faqWithMonths(item.question, offerMonths)}</summary>
        <p>
          {answer}
          {item.more && showLink(item.more) ? (
            <>
              {" "}
              <Link href={item.more}>Scopri di più</Link>
            </>
          ) : null}
        </p>
        {item.detail ? (
          <details className="faq-detail">
            <summary>Scopri di più</summary>
            <p>{item.detail}</p>
          </details>
        ) : null}
      </details>
    );
  }

  return (
    <Section
      pageTitle
      title="Domande frequenti"
      lead="Le risposte alle domande più comuni, per chi cerca un professionista e per chi offre i suoi servizi."
      maxWidth={780}
    >
      <div className="faq">
        <div className="faq-switch" role="tablist" aria-label="Domande per">
          {AUDIENCES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={audience === option.value}
              aria-controls={panelId}
              className="faq-switch-option"
              onClick={() => choose(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="faq-search">
          <label htmlFor={searchId} className="faq-visually-hidden">
            Cerca tra le domande
          </label>
          <svg className="faq-search-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca, per esempio: acconto"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>

        <div id={panelId} role="tabpanel" aria-label={AUDIENCES.find((option) => option.value === audience)?.label}>
          {searching ? (
            <>
              <p className="faq-count" aria-live="polite">
                {items.length === 0 ? "Nessuna risposta trovata." : items.length === 1 ? "1 risposta" : `${items.length} risposte`}
              </p>
              {items.length > 0 ? <div className="faq-list">{items.map(renderItem)}</div> : null}
              {otherCount > 0 ? (
                <p className="faq-other">
                  {otherCount === 1 ? "C'è 1 risposta" : `Ci sono ${otherCount} risposte`} anche{" "}
                  {other === "professionista" ? "per i professionisti" : "per chi cerca un professionista"}.{" "}
                  <button type="button" className="faq-link-button" onClick={() => choose(other)}>
                    Vedile
                  </button>
                </p>
              ) : null}
            </>
          ) : (
            FAQ_TOPICS[audience].map((topic) => {
              const inTopic = items.filter((item) => item.topic === topic);
              if (inTopic.length === 0) return null;
              return (
                <section key={topic} className="faq-topic">
                  <h2>{topic}</h2>
                  <div className="faq-list">{inTopic.map(renderItem)}</div>
                </section>
              );
            })
          )}
        </div>

        <div className="faq-help">
          <p>
            <strong>Non hai trovato la risposta?</strong> Scrivici e ti rispondiamo per email.
          </p>
          <Link href="/contatti" className="faq-help-link">
            Scrivici
          </Link>
        </div>
      </div>
      <style jsx>{`
        .faq {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .faq-switch {
          display: flex;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          background: ${brand.calce};
          border: 1px solid ${brand.filetto};
          align-self: flex-start;
          max-width: 100%;
        }
        .faq-switch-option {
          font-family: inherit;
          font-size: 15px;
          font-weight: 700;
          min-height: 44px;
          padding: 0 18px;
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: ${brand.grafite70};
          cursor: pointer;
          transition: background-color 160ms ease, color 160ms ease;
        }
        .faq-switch-option:hover {
          color: ${brand.grafite};
        }
        .faq-switch-option[aria-selected="true"] {
          background: ${brand.cianografiaPieno};
          color: ${brand.calce};
        }
        .faq-switch-option:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
        }
        .faq-search {
          position: relative;
        }
        .faq-search-icon {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          color: ${brand.grafite70};
          pointer-events: none;
        }
        .faq-search input {
          width: 100%;
          box-sizing: border-box;
          padding: 16px 18px 16px 48px;
          border-radius: 20px;
          border: 1px solid ${brand.bordoCampo};
          background: ${brand.calce};
          font-family: inherit;
          font-size: 16px;
          color: ${brand.grafite};
        }
        .faq-search input:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 1px;
        }
        .faq-visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .faq-topic + .faq-topic {
          margin-top: 32px;
        }
        .faq-topic h2 {
          margin: 0 0 4px;
          font-family: var(--f-heading, inherit);
          font-size: 20px;
          font-weight: 800;
          color: ${brand.inchiostro};
        }
        .faq-count,
        .faq-other {
          margin: 0 0 8px;
          font-size: 15px;
          color: ${brand.grafite70};
        }
        .faq-other {
          margin-top: 16px;
        }
        .faq-link-button {
          font: inherit;
          font-weight: 700;
          color: ${brand.cianografiaScuro};
          background: none;
          border: 0;
          padding: 0;
          cursor: pointer;
          text-decoration: underline;
        }
        .faq :global(.faq-list) {
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        .faq :global(.faq-item) {
          border-top: 1px solid ${brand.filetto};
          padding: 18px 0;
          scroll-margin-top: 96px;
        }
        .faq :global(.faq-item:last-child) {
          border-bottom: 1px solid ${brand.filetto};
        }
        .faq :global(.faq-item > summary),
        .faq :global(.faq-detail > summary) {
          cursor: pointer;
          list-style: none;
          font-family: inherit;
        }
        .faq :global(.faq-item > summary) {
          font-weight: 700;
          font-size: 16px;
          color: ${brand.grafite};
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .faq :global(.faq-item summary::-webkit-details-marker) {
          display: none;
        }
        .faq :global(.faq-item > summary::after) {
          content: "+";
          font-size: 20px;
          font-weight: 400;
          color: ${brand.grafite70};
          flex-shrink: 0;
        }
        .faq :global(.faq-item[open] > summary::after) {
          content: "−";
        }
        .faq :global(.faq-item p) {
          margin: 12px 0 0;
          font-family: inherit;
          font-size: 15px;
          line-height: 1.5;
          color: ${brand.grafite70};
        }
        .faq :global(.faq-item p a) {
          color: ${brand.cianografiaScuro};
          font-weight: 700;
        }
        .faq :global(.faq-detail > summary) {
          margin-top: 8px;
          font-size: 15px;
          font-weight: 700;
          color: ${brand.cianografiaScuro};
        }
        .faq-help {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px 24px;
          padding: 20px 24px;
          border-radius: 20px;
          background: ${brand.cianografiaVelo};
        }
        .faq-help p {
          margin: 0;
          font-size: 16px;
          line-height: 1.5;
          color: ${brand.grafite};
          flex: 1 1 260px;
        }
        .faq-help :global(.faq-help-link) {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          padding: 0 22px;
          border-radius: 999px;
          background: ${brand.cianografiaPieno};
          color: ${brand.calce};
          font-weight: 700;
          text-decoration: none;
        }
        @media (max-width: 560px) {
          .faq-switch {
            align-self: stretch;
          }
          .faq-switch-option {
            flex: 1 1 0;
            padding: 0 10px;
            font-size: 14px;
          }
          .faq-help :global(.faq-help-link) {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </Section>
  );
}
