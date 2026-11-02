"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEur, subscriptionTierInfo, type SubscriptionTier } from "@professionisti/shared";
import { Icon, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

/**
 * Piano toccato su /per-professionisti, ricordato durante l'iscrizione e
 * nel primo profilo (docs/changelog/2026-11-02-registrazione-pro-grafica.md):
 * prima spariva dal link alla pagina Abbonamento. Base con i mesi gratis
 * dell'offerta attiva; Plus e Pro con il prezzo mensile.
 */
export function ChosenPlanChip({ tier, changeHref }: { tier: SubscriptionTier; changeHref?: string }) {
  const info = subscriptionTierInfo(tier);
  const [offerMonths, setOfferMonths] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    if (tier !== "BASE") return;
    let alive = true;
    apiClient
      .founderSpots()
      .then((spots) => {
        if (alive) setOfferMonths(spots.offerMonths);
      })
      .catch(() => {
        if (alive) setOfferMonths(null);
      });
    return () => {
      alive = false;
    };
  }, [tier]);

  // Base: niente prezzo finché non si sa se c'è l'offerta, per non cambiarlo davanti a chi legge.
  const detail =
    tier === "BASE" && offerMonths === undefined
      ? null
      : tier === "BASE" && offerMonths
        ? `gratis per ${offerMonths === 1 ? "1 mese" : `${offerMonths} mesi`}`
        : `${formatEur(info.priceEurCents)} + IVA al mese`;

  // Una riga sola di testo (non tessere flessibili): sul telefono andava a capo a metà.
  return (
    <p className="plan-chip">
      <Icon name="tag" size={15} color={brand.cianografiaScuro} strokeWidth={1.75} />
      <span>
        <strong>Piano {info.label}</strong>
        {detail ? <span className="plan-chip-detail"> · {detail}</span> : null}
      </span>
      {changeHref ? (
        <Link href={changeHref} className="plan-chip-change" aria-label="Cambia il piano scelto">
          Cambia
        </Link>
      ) : null}
    </p>
  );
}
