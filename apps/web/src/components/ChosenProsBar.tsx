"use client";

import Link from "next/link";
import type { ProfessionalCategorySlug, RequestTiming } from "@professionisti/shared";
import { Button, ButtonArrow, Text, XStack, brand } from "@professionisti/ui";
import { MagneticButton } from "./MagneticButton";
import { ProfessionalAvatar } from "./ProfessionalAvatar";
import { setChosenParams } from "@/lib/chosenParams";
import { tradeName } from "@/lib/problemChoices";

/**
 * Il minimo che serve del professionista scelto: nome e foto per la barra e il
 * modulo; mestiere, città e voto per l'anteprima nei risultati
 * (docs/changelog/2026-11-16-anteprima-scelti.md), facoltativi perché le
 * scelte salvate prima non li hanno.
 */
export type ChosenPro = {
  id: string;
  businessName: string;
  imageUrl: string | null;
  categorySlug: ProfessionalCategorySlug;
  categoryLabel?: string;
  city?: string;
  rating?: number | null;
  reviewCount?: number;
  /**
   * Mestiere della richiesta per cui è stato scelto, se non è quello della
   * ricerca: scelto sotto "Potrebbe farlo anche…" (richiesta a due mestieri,
   * docs/changelog/2026-11-17-scelti-due-mestieri.md).
   */
  requestCategory?: ProfessionalCategorySlug;
};

/** Indizi presi dal problema scritto (`timingFromProblem`, `comuneFromProblem`): il modulo li precompila, il cliente li può cambiare. */
export type ProblemRequestHints = { timing: RequestTiming | null; city: string | null };

/** Aggiunge alla richiesta quando serve e il comune presi dal testo, se la ricerca non ha già la città. */
export function setRequestHints(params: URLSearchParams, hints: ProblemRequestHints | undefined) {
  if (!hints) return;
  if (hints.timing) params.set("quando", hints.timing);
  if (hints.city && !params.has("citta")) params.set("citta", hints.city);
}

/**
 * Richiesta ai professionisti scelti nei risultati (docs/CHANGELOG.md §393):
 * con uno solo è la richiesta diretta di sempre, con 2-5 il modulo li riceve
 * in `scelti` e la richiesta arriva solo a loro.
 */
export function chosenRequestHref(
  chosen: ChosenPro[],
  category: ProfessionalCategorySlug,
  description: string,
  city: string | undefined,
  hints?: ProblemRequestHints,
): string {
  const params = new URLSearchParams({ categoria: category });
  // Scelti anche dell'altro mestiere proposto: una richiesta per mestiere, ognuna ai suoi scelti.
  const others = [...new Set(chosen.map((pro) => pro.requestCategory).filter((slug): slug is ProfessionalCategorySlug => Boolean(slug) && slug !== category))];
  if (others.length > 0) params.set("altreCategorie", others.join(","));
  // Dalla ricerca per mestiere non c'è descrizione: si scrive nel modulo.
  if (description) params.set("descrizione", description);
  if (city) params.set("citta", city);
  setRequestHints(params, hints);
  setChosenParams(params, chosen);
  return `/preventivo?${params.toString()}`;
}

/**
 * Barra fissa in basso con i professionisti scelti, come quella del profilo
 * (§385): resta a portata di mano mentre si scorrono le schede.
 */
export function ChosenProsBar({
  chosen,
  max,
  href,
  notice,
  category,
}: {
  chosen: ChosenPro[];
  max: number;
  href: string;
  notice?: string | null;
  /** Mestiere della ricerca: con scelti di due mestieri ogni nome porta il suo ("Ditta Rossi · muratore"). */
  category?: ProfessionalCategorySlug;
}) {
  if (chosen.length === 0) return null;
  const twoTrades = Boolean(category) && chosen.some((pro) => pro.requestCategory && pro.requestCategory !== category);
  const names = chosen
    .map((pro) => (twoTrades && category ? `${pro.businessName} · ${tradeName(pro.requestCategory ?? category)}` : pro.businessName))
    .join(", ");
  return (
    <div className="chosen-bar" role="region" aria-label="Professionisti scelti">
      {/* Sempre nella pagina, così i lettori di schermo leggono l'avviso quando compare. */}
      <p className="chosen-bar-notice" role="status" data-visible={notice ? "true" : undefined}>
        {notice ?? ""}
      </p>
      <div className="chosen-bar-inner">
        <div className="chosen-bar-people">
          <div className="chosen-bar-faces" aria-hidden>
            {chosen.map((pro) => (
              <span key={pro.id}>
                <ProfessionalAvatar imageUrl={pro.imageUrl} categorySlug={pro.categorySlug} size={36} />
              </span>
            ))}
          </div>
          <div className="chosen-bar-text">
            <Text fontWeight="700" fontSize={16} color={brand.grafite} numberOfLines={1}>
              {chosen.length === 1 ? "1 scelto" : `${chosen.length} scelti`} su {max}
            </Text>
            <Text fontSize={13} color={brand.grafite70} numberOfLines={1}>
              {names}
            </Text>
          </div>
        </div>
        <Link href={href} className="chosen-bar-link" style={{ textDecoration: "none", display: "block" }}>
          <MagneticButton block>
            <Button variant="primary" width="100%" tabIndex={-1}>
              <XStack alignItems="center" gap="2" minWidth={0} maxWidth="100%" flexShrink={1}>
                <Text color="white" fontFamily="body" fontSize={16} fontWeight="600" numberOfLines={1} flexShrink={1}>
                  {chosen.length === 1 ? "Chiedi un preventivo" : `Chiedi preventivo ai ${chosen.length} scelti`}
                </Text>
                <ButtonArrow />
              </XStack>
            </Button>
          </MagneticButton>
        </Link>
      </div>
    </div>
  );
}
