import { createContext, useContext } from "react";
import type { SectionDensity, SectionProps, SectionTone } from "./sectionProps";
import styles from "./Section.module.css";

export type { SectionDensity, SectionProps, SectionTone } from "./sectionProps";

/**
 * Variante per il sito di `Section` (Section.tsx), in HTML semplice
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): stesso
 * aspetto al pixel, ma il telefono non calcola gli stili con Tamagui
 * all'apertura della pagina. Stesse props, stesso ritmo e stessa regola
 * dell'annidamento: se cambia una, va cambiata anche l'altra
 * (Section.module.css per i valori).
 */
const SectionDensityContext = createContext<SectionDensity>("comfortable");

export const SectionDensityProvider = SectionDensityContext.Provider;

const SectionNestingContext = createContext<SectionTone | null>(null);

function SectionTitle({ title, isDark, nested, pageTitle }: { title: string; isDark: boolean; nested: boolean; pageTitle?: boolean }) {
  const Heading = nested ? "h3" : pageTitle ? "h1" : "h2";
  const className = ["is_Text font_heading", styles.title, nested ? styles.titleNested : "", isDark ? styles.onDark : "", "tm-paragraph"].filter(Boolean).join(" ");
  return (
    <Heading role="heading" className={className}>
      {title}
    </Heading>
  );
}

export function Section({ title, lead, titleAction, tone = "light", maxWidth = 1200, pageTitle, children }: SectionProps) {
  const parentTone = useContext(SectionNestingContext);
  const nested = parentTone !== null;
  const isDark = nested ? parentTone === "dark" : tone === "dark";
  const density = useContext(SectionDensityContext);

  const titleElement = title ? <SectionTitle title={title} isDark={isDark} nested={nested} pageTitle={pageTitle} /> : null;
  const header =
    title || lead ? (
      <div className={`is_View ${styles.header}`}>
        {title && titleAction ? (
          <div className={`is_View ${styles.titleRow}`}>
            <div className={`is_View ${styles.titleMain}`}>{titleElement}</div>
            <div className={`is_View ${styles.titleAction}`}>{titleAction}</div>
          </div>
        ) : (
          titleElement
        )}
        {lead ? <p className={`is_Text font_body ${styles.lead} ${isDark ? styles.leadOnDark : ""} tm-paragraph`}>{lead}</p> : null}
      </div>
    ) : null;

  if (nested) {
    return (
      <div className={`is_View ${styles.nested}`} style={{ maxWidth }}>
        {header}
        {children}
      </div>
    );
  }

  return (
    <div className={`is_View ${styles.outer} ${density === "compact" ? styles.compact : ""} ${tone === "dark" ? styles.dark : styles.light}`}>
      <div className={`is_View ${styles.inner}`} style={{ maxWidth }}>
        {header}
        <SectionNestingContext.Provider value={tone}>{children}</SectionNestingContext.Provider>
      </div>
    </div>
  );
}
