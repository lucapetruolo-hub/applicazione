"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { DEFAULT_POPULAR_JOBS, POPULAR_JOBS_COUNT, type PopularJobsResponse } from "@professionisti/shared";
import { CATEGORY_ACCENT, CategoryIcon } from "@/components/icons/CategoryIcons";
import { readLastSearchCity } from "@/lib/lastSearchCity";

/** La città dell'ultima ricerca non cambia mentre si guarda la home. */
const subscribeNothing = () => () => undefined;

/**
 * "Lavori più cercati" sotto le categorie della home
 * (docs/changelog/2026-11-07-lavori-piu-cercati-home.md): pillole con le
 * prestazioni più cercate sul sito, o l'elenco di partenza finché le ricerche
 * sono poche, così la sezione non è mai vuota. Ogni pillola apre l'elenco di
 * chi offre quel lavoro, nella città dell'ultima ricerca se c'è (come
 * "Quanto costa in media"). Stesso aspetto dei "Servizi più richiesti" in
 * fondo ai risultati (`PopularServicesLinks`).
 */
export function PopularJobs({ data }: { data: PopularJobsResponse | null }) {
  const city = useSyncExternalStore(subscribeNothing, readLastSearchCity, () => null);
  const jobs = data && Array.isArray(data.jobs) && data.jobs.length > 0 ? data.jobs : DEFAULT_POPULAR_JOBS.slice(0, POPULAR_JOBS_COUNT);

  return (
    <nav className="popular-jobs" aria-labelledby="popular-jobs-title">
      <h3 id="popular-jobs-title" className="popular-jobs-title">
        Lavori più cercati
      </h3>
      <div className="popular-jobs-scroll">
      <ul className="popular-services-list">
        {jobs.map((job) => {
          const accent = CATEGORY_ACCENT[job.categorySlug] ?? { bg: "#E4E2DE", fg: "#45423D" };
          const params = new URLSearchParams({ servizio: job.service });
          if (city) params.set("citta", city);
          return (
            <li key={job.service}>
              <Link href={`/cerca?${params.toString()}`} className="popular-services-link">
                <span className="popular-services-icon" style={{ background: accent.bg, color: accent.fg }} aria-hidden="true">
                  <CategoryIcon slug={job.categorySlug} size={18} />
                </span>
                {job.service}
              </Link>
            </li>
          );
        })}
      </ul>
      </div>
    </nav>
  );
}
