"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon, Section, Text, YStack, brand } from "@professionisti/ui";

const REQUEST_TEXT =
  "Il rubinetto della cucina gocciola anche da chiuso. Sono a Milano, zona Città Studi. Meglio in settimana.";

const QUOTE_ROWS = [
  { label: "Manodopera (1 ora)", value: "€ 45" },
  { label: "Materiali · cartuccia miscelatore", value: "€ 28" },
  { label: "Uscita", value: "€ 20" },
  { label: "Quando", value: "giovedì 9:00–11:00" },
];

const STEPS = [
  { title: "Raccontaci il problema", text: "Una foto e due righe. Nessun impegno." },
  { title: "Ricevi preventivi chiari", text: "Manodopera, materiali e tempi separati. Confronta prima di dire sì." },
  {
    title: "Scegli e prenota",
    text: "Conferma in piattaforma. Promemoria via email e SMS prima dell'appuntamento.",
  },
];

const TYPE_MS_PER_CHAR = 22;
const ROW_STAGGER_MS = 160;

/**
 * "Come funziona" mostrato invece che raccontato: una richiesta d'esempio
 * accanto al preventivo a voci che si riceve (idea presa dal sito Volt,
 * scelta dall'utente, docs/CHANGELOG.md §219). Sostituisce i tre passi con
 * foto (`HowItWorks`, rimosso): i passi restano qui sotto in una riga sola. Nome e cifre
 * sono un esempio, dichiarato come tale sulla scheda: nessun professionista
 * vero. Quando la sezione entra nello schermo la richiesta si scrive da sola
 * e le voci del preventivo entrano una alla volta; con "riduci movimento"
 * attivo compare tutto subito.
 */
export function QuoteExampleSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [started, setStarted] = useState(false);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStarted(true);
      setTyped(REQUEST_TEXT.length);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started || typed >= REQUEST_TEXT.length) return;
    const timer = setTimeout(() => setTyped((n) => n + 1), TYPE_MS_PER_CHAR);
    return () => clearTimeout(timer);
  }, [started, typed]);

  const quoteVisible = typed >= REQUEST_TEXT.length;

  return (
    <Section
      eyebrow="Come funziona"
      title="Tu scrivi due righe, i professionisti ti rispondono con i numeri"
      titleAccent="ti rispondono con i numeri"
      maxWidth={1080}
    >
      <div ref={ref} className={`qx${quoteVisible ? " is-on" : ""}`}>
        <div className="qx-col">
          <span className="qx-label">Tu scrivi</span>
          <div className="qx-bubble">
            <p className="qx-request">
              <span className="qx-sr">{REQUEST_TEXT}</span>
              <span aria-hidden>
                “{REQUEST_TEXT.slice(0, typed)}
                {typed < REQUEST_TEXT.length && started ? <span className="qx-caret" /> : null}
                <span className="qx-rest">{REQUEST_TEXT.slice(typed)}</span>”
              </span>
            </p>
            <div className="qx-photo">
              <Image
                src="/home-photos/come-funziona-1-richiesta.webp"
                alt="Una donna scrive una richiesta dal telefono"
                fill
                sizes="(max-width: 860px) 100vw, 440px"
                style={{ objectFit: "cover" }}
              />
            </div>
            <span className="qx-meta">1 foto allegata · Idraulico · Milano</span>
          </div>
        </div>

        <div className="qx-arrow" aria-hidden>
          <Icon name="arrow-right" size={28} color={brand.cianografia} strokeWidth={2} />
        </div>

        <div className="qx-col">
          <span className="qx-label">Ricevi preventivi così</span>
          <div className="qx-quote">
            <div className="qx-quote-head">
              <span className="qx-avatar" aria-hidden>
                M
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="qx-name">Marco · Idraulico</span>
                <span className="qx-sub">risponde con un preventivo a voci</span>
              </span>
              <span className="qx-example">Esempio</span>
            </div>
            {QUOTE_ROWS.map((row, index) => (
              <div key={row.label} className="qx-row" style={{ transitionDelay: `${index * ROW_STAGGER_MS}ms` }}>
                <span>{row.label}</span>
                <span className="qx-value">{row.value}</span>
              </div>
            ))}
            <div className="qx-total" style={{ transitionDelay: `${QUOTE_ROWS.length * ROW_STAGGER_MS}ms` }}>
              <span>Totale</span>
              <span>€ 93</span>
            </div>
          </div>
        </div>
      </div>

      <ol className="qx-steps">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="qx-step-number">{index + 1}</span>
            <YStack gap="$1" flex={1}>
              <Text fontFamily="$heading" fontWeight="600" fontSize="$5" color={brand.grafite}>
                {step.title}
              </Text>
              <Text fontSize="$3" color={brand.grafite70}>
                {step.text}
              </Text>
            </YStack>
          </li>
        ))}
      </ol>

      <div className="qx-cta">
        <Link href="/preventivo" className="qx-cta-button">
          Descrivi il tuo lavoro
        </Link>
        <Text fontSize="$3" color={brand.grafite70}>
          Per chi cerca, il servizio è gratuito.
        </Text>
      </div>
    </Section>
  );
}
