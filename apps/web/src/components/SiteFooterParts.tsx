"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/IntentLink";
import { reopenCookieChoice } from "@/lib/cookieConsent";
import { useAuth } from "@/lib/AuthContext";
import styles from "./SiteFooter.module.css";

/**
 * Le sole parti del piè di pagina che hanno bisogno del browser
 * (docs/changelog/2026-11-09-pagine-pubbliche-senza-tamagui.md): il resto lo
 * prepara il server in HTML semplice (SiteFooter.tsx).
 */

/** Aree riservate (cliente, professionista, admin): piede corto, senza i link di marketing. */
const RESERVED_AREAS = ["/dashboard", "/admin", "/account", "/chat", "/le-mie-richieste", "/professionisti-salvati", "/le-mie-recensioni", "/segnalazioni"];
/** Pagine di accesso e iscrizione: stesso piede corto, per non distrarre a metà dei passi
 * (docs/changelog/2026-11-02-registrazione-pro-grafica.md). */
const AUTH_PAGES = ["/registrati", "/accedi", "/password-dimenticata", "/reimposta-password", "/conferma-email", "/completa-profilo", "/accesso-google"];

/**
 * Dentro le aree riservate il piede completo (quattro colonne, "Iscriviti
 * gratis", "Accedi") non serve a chi è già dentro e su telefono era più
 * lungo della chat (docs/CHANGELOG.md §349): resta una riga sola.
 */
export function FooterByPath({ full, short }: { full: ReactNode; short: ReactNode }) {
  const pathname = usePathname();
  const isShort = [...RESERVED_AREAS, ...AUTH_PAGES].some((area) => pathname === area || pathname.startsWith(`${area}/`));
  return isShort ? short : full;
}

/** Chi è già dentro non deve vedere "Accedi" (collaudo L, migliorie). */
const noSubscribe = () => () => {};

export function FooterLoginLink() {
  const { user } = useAuth();
  // Il piede arriva dopo il resto della pagina (Suspense): quando si aggancia
  // l'utente è già noto, mentre il server ha scritto "Accedi". Durante
  // l'aggancio React usa il valore del server (false), così l'HTML combacia,
  // e subito dopo toglie il link a chi è dentro (errore "Hydration failed" su
  // ogni pagina per chi era collegato, docs/changelog/2026-11-19-piede-accedi-hydration.md).
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (hydrated && user) return null;
  return (
    <Link href="/accedi" className={styles.link}>
      <span className={`is_Text ${styles.linkText}`}>Accedi</span>
    </Link>
  );
}

/** Il banner dice di cambiare idea "in fondo alla pagina": serve anche qui (collaudo del 29/10/2026, M-13). */
export function CookiePreferencesButton() {
  return (
    <button type="button" onClick={reopenCookieChoice} className={styles.textButton}>
      <span className={`is_Text font_body ${styles.small}`}>Preferenze cookie</span>
    </button>
  );
}
