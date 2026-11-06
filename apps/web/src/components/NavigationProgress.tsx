"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { type ProgressState, getProgress, getServerProgress, pageKey, startHistoryProgress, startNavigationProgress, stopProgress, subscribeProgress } from "@/lib/navigationProgress";

/** Sulle pagine veloci la barra non deve lampeggiare. */
const SHOW_AFTER_MS = 300;
/** Se la pagina non arriva (errore di rete) la barra non resta accesa per sempre. */
const GIVE_UP_AFTER_MS = 20_000;

/**
 * Barra sottile in cima allo schermo mentre si aspetta una pagina lenta, la
 * ricerca dal problema scritto o l'uscita verso Stripe/Didit
 * (docs/changelog/2026-11-05-barra-di-attesa.md). Stessa barra `.flow-bar`
 * di globals.css; con le animazioni ridotte resta ferma e la frase resta.
 */
export function NavigationProgress() {
  const progress = useSyncExternalStore(subscribeProgress, getProgress, getServerProgress);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // L'attesa (stato) per cui sono passati i 300 ms: un'attesa nuova riparte da zero.
  const [shownFor, setShownFor] = useState<ProgressState | null>(null);
  // Pagina nuova arrivata: si spegne. Il confronto con l'indirizzo atteso
  // copre anche il caso in cui la pagina arriva prima che la barra si accenda.
  const currentUrl = pageKey(pathname, new URLSearchParams(searchParams.toString()));
  const arrived = progress.href !== undefined && progress.href === currentUrl;
  const visible = progress.active && !arrived && shownFor === progress;
  useEffect(() => {
    stopProgress();
  }, [currentUrl]);

  // Si mostra solo se l'attesa supera 300 ms.
  useEffect(() => {
    if (!progress.active) return;
    const show = window.setTimeout(() => setShownFor(progress), SHOW_AFTER_MS);
    const giveUp = window.setTimeout(stopProgress, GIVE_UP_AFTER_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(giveUp);
    };
  }, [progress]);

  useEffect(() => {
    // Link interni: stesso criterio di next/link (niente nuove schede, tasti, download).
    function onClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      startNavigationProgress(anchor.href);
    }
    // Tornati indietro da Stripe con la pagina ancora in memoria.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) stopProgress();
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("popstate", startHistoryProgress);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("popstate", startHistoryProgress);
    };
  }, []);

  const label = visible ? progress.label : undefined;
  return (
    <>
      {visible ? (
        <div className="nav-progress" aria-hidden="true">
          <div className="flow-bar" />
        </div>
      ) : null}
      {/* Sempre presente: il lettore di schermo legge la frase quando compare. */}
      <div role="status" className={label ? "nav-progress-label" : "sr-only"}>
        {label ?? ""}
      </div>
    </>
  );
}
