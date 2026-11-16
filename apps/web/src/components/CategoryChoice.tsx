"use client";

import Link from "next/link";
import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon } from "@professionisti/ui";
import { CATEGORY_ACCENT, CategoryIcon } from "@/components/icons/CategoryIcons";
import { CategoryTiles } from "@/components/CategoryTiles";
import { cachedPopularOrder } from "@/lib/categoryOrder";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";
import { searchCategories } from "@/lib/categorySearch";
import { useDialogFocus } from "@/lib/useDialogFocus";

const CATALOG = PROFESSIONAL_CATEGORIES.map((category) => category.slug);
const labelOf = (slug: ProfessionalCategorySlug) => PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;

/**
 * Categorie della richiesta di preventivo (proposta A scelta da Luca il
 * 15/11/2026, docs/changelog/2026-11-15-scelta-categoria-suggerita.md, al
 * posto delle 15 tessere sempre in vista).
 *
 * - Con una categoria già scelta (suggerita dalla descrizione o arrivata dal
 *   link) si vede solo lei, in una scheda con "Cambia": il cliente conferma
 *   invece di cercare in un elenco. Gli altri mestieri proposti restano come
 *   pulsanti "+ Fabbro" sotto la scheda (decisione di Luca: mai elenco misto).
 * - "Cambia" apre un pannello (dal basso sul telefono, al centro sul computer)
 *   con una ricerca che capisce anche le parole del problema ("caldaia") e
 *   tutti i mestieri, fino a `max`.
 * - Senza categoria, o se il cliente ha cominciato a scegliere dalle pillole,
 *   restano le pillole (`CategoryTiles`), così non cambia forma sotto il dito.
 */
export function CategoryChoice({
  value,
  onToggle,
  max,
  city,
  suggested,
  autoSlug,
  fromAi,
  also,
  unsure = false,
  waiting = false,
}: {
  value: ProfessionalCategorySlug[];
  onToggle: (slug: ProfessionalCategorySlug) => void;
  max: number;
  city?: string;
  /** Mestieri proposti dalla descrizione, dal più probabile: in cima a pillole ed elenco. */
  suggested: ProfessionalCategorySlug[];
  /** La categoria scelta da sola dalla descrizione, se c'è e il cliente non l'ha toccata. */
  autoSlug: ProfessionalCategorySlug | null;
  /** Il suggerimento viene dall'intelligenza artificiale (trasparenza, AI Act art. 50). */
  fromAi: boolean;
  /** Altri mestieri proposti, non ancora scelti. */
  also: ProfessionalCategorySlug[];
  /**
   * Suggerimento nel dubbio (l'IA non ha risposto): la categoria resta scelta
   * ma si vedono le pillole, così si controlla a colpo d'occhio
   * (docs/changelog/2026-11-16-scelta-categoria-migliorie.md).
   */
  unsure?: boolean;
  /**
   * L'IA sta ancora pensando: al posto delle pillole una riga d'attesa, così
   * la forma non cambia sotto gli occhi quando arriva la risposta
   * (docs/changelog/2026-11-16-scelta-categoria-attesa-ia.md). "Scegli tu"
   * mostra subito le pillole.
   */
  waiting?: boolean;
}) {
  const [fromPills, setFromPills] = useState(false);
  const [open, setOpen] = useState(false);
  const onlyUnsureGuess = unsure && autoSlug !== null && value.length === 1 && value[0] === autoSlug;
  const showCard = value.length > 0 && !fromPills && !onlyUnsureGuess;

  if (waiting && !fromPills) {
    return (
      <div className="cat-choice-wait" role="status">
        <span className="cat-choice-wait-dot" aria-hidden="true" />
        <span className="cat-choice-wait-text">Sto capendo chi ti serve…</span>
        <button type="button" className="cat-choice-change" onClick={() => setFromPills(true)}>
          Scegli tu
        </button>
      </div>
    );
  }

  return (
    <>
      {showCard ? (
        <>
          <div className="cat-choice-card" role="group" aria-label="Chi ti serve">
            {value.map((slug, index) => {
              const accent = CATEGORY_ACCENT[slug];
              const isAuto = slug === autoSlug;
              return (
                <div key={slug} className="cat-choice-row">
                  <span className="cat-choice-icon" style={{ background: accent.bg, color: accent.fg }} aria-hidden="true">
                    <CategoryIcon slug={slug} size={24} />
                  </span>
                  <span className="cat-choice-text">
                    <span className="cat-choice-name">{labelOf(slug)}</span>
                    {isAuto ? (
                      <span className="cat-choice-note">
                        {fromAi ? (
                          <>
                            Suggerita dall&apos;intelligenza artificiale: può sbagliare. <Link href="/privacy#fornitori">Come funziona</Link>
                          </>
                        ) : (
                          "Suggerita dalla tua descrizione"
                        )}
                      </span>
                    ) : null}
                  </span>
                  {index === 0 ? (
                    <button type="button" className="cat-choice-change" onClick={() => setOpen(true)} aria-haspopup="dialog">
                      Cambia
                    </button>
                  ) : (
                    // "×" sulle righe aggiunte: nel test 2 persone su 5 non sapevano
                    // come togliere un mestiere (docs/changelog/2026-11-16-scelta-categoria-togli.md).
                    <button type="button" className="cat-choice-remove" onClick={() => onToggle(slug)} aria-label={`Togli ${labelOf(slug)}`}>
                      <Icon name="x" size={18} color="#4a443e" strokeWidth={2.4} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {also.length > 0 && value.length < max ? (
            <div className="cat-choice-also">
              <span>Può servire anche:</span>
              {also.map((slug) => (
                <button key={slug} type="button" className="cat-choice-add" onClick={() => onToggle(slug)} aria-label={`Aggiungi ${labelOf(slug)}`}>
                  <Icon name="plus" size={16} color="#1E6B6E" strokeWidth={2.4} />
                  {labelOf(slug)}
                </button>
              ))}
              {/* Detto prima del tocco: ogni mestiere in più è una richiesta in più
                  (docs/changelog/2026-11-16-scelta-categoria-migliorie.md). */}
              <span className="cat-choice-also-note">Ogni mestiere aggiunto riceve una richiesta a parte.</span>
            </div>
          ) : null}
        </>
      ) : (
        <CategoryTiles
          value={value}
          onToggle={(slug) => {
            setFromPills(true);
            onToggle(slug);
          }}
          max={max}
          city={city}
          ariaLabel="Chi ti serve"
          first={suggested}
        />
      )}
      {open ? (
        <CategoryPanel value={value} onToggle={onToggle} max={max} city={city} suggested={suggested} autoSlug={autoSlug} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function CategoryPanel({
  value,
  onToggle,
  max,
  city,
  suggested,
  autoSlug,
  onClose,
}: {
  value: ProfessionalCategorySlug[];
  onToggle: (slug: ProfessionalCategorySlug) => void;
  max: number;
  city?: string;
  suggested: ProfessionalCategorySlug[];
  autoSlug: ProfessionalCategorySlug | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  const titleId = useId();
  const [query, setQuery] = useState("");
  // Ordine fissato all'apertura (§324: niente riordino davanti a chi guarda):
  // proposti, già scelti, poi i più cercati se già arrivati, altrimenti il catalogo.
  const [order] = useState<ProfessionalCategorySlug[]>(() => {
    const base = cachedPopularOrder(city?.trim() || undefined) ?? CATALOG;
    return [...new Set([...suggested, ...value, ...base])];
  });
  const shown = searchCategories(query, order);
  const isFull = value.length >= max;

  // Da telefono il pannello si chiude anche trascinandolo in giù dalla
  // maniglia o dal titolo, come i fogli di iOS e Android
  // (docs/changelog/2026-11-16-scelta-categoria-migliorie.md).
  const drag = useRef<{ startY: number; startTime: number; dy: number } | null>(null);
  function onDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (!window.matchMedia("(max-width: 719px)").matches) return;
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { startY: event.clientY, startTime: event.timeStamp, dy: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (ref.current) ref.current.style.transition = "none";
  }
  function onDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || !ref.current) return;
    const dy = Math.max(0, event.clientY - drag.current.startY);
    drag.current.dy = dy;
    ref.current.style.transform = `translateY(${dy}px)`;
  }
  function onDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const sheet = ref.current;
    drag.current = null;
    if (!state || !sheet) return;
    const speed = state.dy / Math.max(1, event.timeStamp - state.startTime);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (state.dy > 100 || (state.dy > 24 && speed > 0.6)) {
      if (reduced) return onClose();
      sheet.style.transition = "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)";
      sheet.style.transform = "translateY(100%)";
      window.setTimeout(onClose, 180);
    } else {
      sheet.style.transition = reduced ? "none" : "transform 0.2s cubic-bezier(0.32, 0.72, 0, 1)";
      sheet.style.transform = "";
    }
  }

  return (
    <div className="cat-sheet-backdrop" role="presentation" onClick={closeOnBackdrop(onClose)}>
      <div ref={ref} className="cat-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cat-sheet-drag" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
          <div className="cat-sheet-grab" aria-hidden="true" />
          <div className="cat-sheet-head">
            <h2 id={titleId} className="cat-sheet-title">
              Chi ti serve
              <span className="cat-sheet-count" aria-live="polite">
                {value.length > 0 ? `${value.length} di ${max} scelte` : `Scegli fino a ${max}`}
              </span>
            </h2>
            <button type="button" className="cat-sheet-done" onClick={onClose}>
              Fatto
            </button>
          </div>
        </div>
        <label className="cat-sheet-search">
          <Icon name="search" size={18} color="#6f665d" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca: idraulico, caldaia, trasloco…"
            aria-label="Cerca un mestiere o scrivi il problema"
            enterKeyHint="search"
            autoComplete="off"
          />
        </label>
        {isFull ? <p className="cat-sheet-full">Hai scelto {max}: togline una per sceglierne un&apos;altra.</p> : null}
        <div className="cat-sheet-list" role="group" aria-label="Mestieri">
          {shown.length === 0 ? (
            <p className="cat-sheet-empty" role="status">
              Nessun mestiere per «{query.trim()}». Prova con un&apos;altra parola o scrivi il lavoro nella descrizione.
            </p>
          ) : (
            shown.map((slug) => {
              const accent = CATEGORY_ACCENT[slug];
              const active = value.includes(slug);
              const note = slug === autoSlug ? "Suggerita" : !active && suggested.includes(slug) ? "Può servire" : null;
              return (
                <button key={slug} type="button" className="cat-sheet-option" aria-pressed={active} disabled={!active && isFull} onClick={() => onToggle(slug)}>
                  <span className="cat-sheet-option-icon" style={{ background: accent.bg, color: accent.fg }} aria-hidden="true">
                    <CategoryIcon slug={slug} size={22} />
                  </span>
                  <span className="cat-sheet-option-text">
                    {labelOf(slug)}
                    {note ? <span className="cat-sheet-option-note">{note}</span> : null}
                  </span>
                  <span className="cat-sheet-check" aria-hidden="true">
                    {active ? <Icon name="check" size={14} color="white" strokeWidth={3} /> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
