"use client";

import { useRef } from "react";
import Link from "next/link";
import { Star, X } from "lucide-react";
import { professionalPath } from "@professionisti/shared";
import type { ChosenPro } from "./ChosenProsBar";
import { ProfessionalAvatar } from "./ProfessionalAvatar";
import { CHOICE_PROFILE_PARAM } from "@/lib/chosenProsStore";
import { PROBLEM_PROFILE_PARAM } from "@/lib/requestDescription";

function profileLink(pro: ChosenPro, description: string): string {
  const params = new URLSearchParams({ [CHOICE_PROFILE_PARAM]: "1" });
  if (description) params.set(PROBLEM_PROFILE_PARAM, description);
  return `${professionalPath(pro)}?${params.toString()}`;
}

function ratingText(rating: number): string {
  return rating.toFixed(1).replace(".", ",");
}

/**
 * Anteprime dei professionisti scelti con «Scegli», sopra i risultati
 * (docs/changelog/2026-11-16-anteprima-scelti.md, richiesta di Luca): al
 * posto della frase "Hai scelto…" una scheda corta in orizzontale per ognuno,
 * con la X in alto a destra per toglierlo. Con più scelti le schede stanno in
 * una fila che scorre col dito, da computer vanno a capo.
 */
export function ChosenProsStrip({
  chosen,
  max,
  description,
  onRemove,
  onClear,
  undo,
}: {
  chosen: ChosenPro[];
  max: number | undefined;
  description: string;
  onRemove?: (id: string) => void;
  onClear?: () => void;
  /** "Annulla" per qualche secondo dopo la X o "Togli tutti". */
  undo?: { text: string; onUndo: () => void } | null;
}) {
  const headingRef = useRef<HTMLParagraphElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);

  function remove(index: number) {
    const pro = chosen[index];
    if (!pro || !onRemove) return;
    // Il fuoco va sulla X accanto, o sul titolo se era l'ultima: non si perde
    // nel vuoto lasciato dalla scheda tolta (tastiera e lettori di schermo).
    const next = chosen[index + 1] ?? chosen[index - 1];
    onRemove(pro.id);
    requestAnimationFrame(() => {
      const button = next ? rowRef.current?.querySelector<HTMLButtonElement>(`[data-chosen-x="${next.id}"]`) : null;
      (button ?? headingRef.current)?.focus();
    });
  }

  const undoLine = (
    // Sempre nella pagina, così i lettori di schermo leggono la riga quando compare.
    <div className="chosen-strip-undo" role="status" data-visible={undo ? "true" : undefined}>
      {undo ? (
        <>
          <span>{undo.text}</span>
          <button
            type="button"
            className="chosen-strip-undo-button"
            onClick={() => {
              undo.onUndo();
              requestAnimationFrame(() => headingRef.current?.focus());
            }}
          >
            Annulla
          </button>
        </>
      ) : null}
    </div>
  );

  if (chosen.length === 0) {
    return undo ? <section className="chosen-strip" aria-label="I tuoi scelti">{undoLine}</section> : null;
  }

  return (
    <section className="chosen-strip" aria-label="I tuoi scelti">
      <div className="chosen-strip-head">
        <p className="chosen-strip-title" ref={headingRef} tabIndex={-1} role="status">
          {max ? `Scelti ${chosen.length} su ${max}` : chosen.length === 1 ? "1 scelto" : `${chosen.length} scelti`}
          <span className="chosen-strip-hint">
            {chosen.length === 1
              ? "Puoi aggiungerne altri con «Scegli»"
              : "La richiesta arriva solo a loro"}
          </span>
        </p>
        {chosen.length > 1 && onClear ? (
          <button
            type="button"
            className="chosen-strip-clear"
            onClick={() => {
              onClear();
              requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".chosen-strip-undo-button")?.focus());
            }}
          >
            Togli tutti
          </button>
        ) : null}
      </div>
      <ul className="chosen-strip-row" ref={rowRef} data-single={chosen.length === 1 ? "true" : undefined}>
        {chosen.map((pro, index) => {
          const details = [pro.categoryLabel, pro.city].filter(Boolean).join(" · ");
          return (
            <li key={pro.id} className="chosen-strip-card">
              <Link href={profileLink(pro, description)} className="chosen-strip-link">
                <ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={48} shape="portrait" name={pro.businessName} />
                <span className="chosen-strip-text">
                  <span className="chosen-strip-name" title={pro.businessName}>{pro.businessName}</span>
                  {details ? <span className="chosen-strip-details">{details}</span> : null}
                  {pro.rating != null && (pro.reviewCount ?? 0) > 0 ? (
                    <span className="chosen-strip-rating">
                      <Star size={14} strokeWidth={0} fill="currentColor" aria-hidden />
                      <span>
                        <strong>{ratingText(pro.rating)}</strong>{" "}
                        ({pro.reviewCount === 1 ? "1 recensione" : `${pro.reviewCount} recensioni`})
                      </span>
                    </span>
                  ) : null}
                </span>
              </Link>
              {onRemove ? (
                <button
                  type="button"
                  className="chosen-strip-x"
                  data-chosen-x={pro.id}
                  aria-label={`Togli ${pro.businessName} dai scelti`}
                  title="Togli dai scelti"
                  onClick={() => remove(index)}
                >
                  <X size={16} strokeWidth={2.5} aria-hidden />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {undoLine}
    </section>
  );
}
