"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PROVINCE_NAMES, provinceSlug } from "@professionisti/shared";
import styles from "./BoardPage.module.css";

const STORAGE_KEY = "lavori-cercati-provincia";

const PROVINCES = Object.keys(PROVINCE_NAMES)
  .map((code) => ({ slug: provinceSlug(code), name: PROVINCE_NAMES[code] ?? code }))
  .sort((a, b) => a.name.localeCompare(b.name, "it"));

/**
 * "La tua zona" nella pagina "Lavori cercati" (richiesta di Luca del
 * 19/11/2026, docs/changelog/2026-11-19-pagina-lavori-cercati.md): a chi cerca
 * clienti interessano solo le richieste della sua provincia. La scelta va
 * nell'indirizzo (?provincia=) e il browser la ricorda per la volta dopo.
 */
export function BoardZonePicker({ current }: { current: string | null }) {
  const router = useRouter();

  useEffect(() => {
    if (current) return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (saved && PROVINCES.some((p) => p.slug === saved)) router.replace(`/lavora-con-noi?provincia=${saved}`, { scroll: false });
  }, [current, router]);

  function choose(slug: string) {
    try {
      if (slug) window.localStorage.setItem(STORAGE_KEY, slug);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Senza memoria del browser la scelta vale solo per questa visita.
    }
    router.push(slug ? `/lavora-con-noi?provincia=${slug}` : "/lavora-con-noi", { scroll: false });
  }

  return (
    <form className={styles.zone} action="/lavora-con-noi" method="get">
      <label className={styles.zoneLabel} htmlFor="provincia">
        La tua zona
      </label>
      <select id="provincia" name="provincia" className={styles.zoneSelect} value={current ?? ""} onChange={(event) => choose(event.target.value)}>
        <option value="">Tutta Italia</option>
        {PROVINCES.map((province) => (
          <option key={province.slug} value={province.slug}>
            Provincia di {province.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit">Mostra</button>
      </noscript>
    </form>
  );
}
