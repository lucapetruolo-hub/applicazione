"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

/**
 * "Vicino a te ci sono 3 richieste" (decisione di Luca del 17/11/2026,
 * docs/changelog/2026-11-17-richieste-in-attesa.md): mentre il professionista
 * scrive le prestazioni, quante richieste in attesa del suo mestiere ci sono
 * vicino alla sua città. Solo il mestiere e il numero, mai i dettagli: gli
 * arrivano da sole appena il profilo è attivo.
 */
export function WaitingRequestsNearby({ token, city, texts }: { token: string | null; city: string; texts: string[] }) {
  const text = texts
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
  const [found, setFound] = useState<{ key: string; list: { trade: string; count: number }[] } | null>(null);
  const key = `${city.trim()}|${text}`;

  useEffect(() => {
    if (!token || !city.trim() || !text) return;
    let active = true;
    // Una richiesta sola quando smette di scrivere.
    const timer = setTimeout(() => {
      apiClient
        .waitingRequestsNearby(token, city.trim(), text.slice(0, 1500))
        .then((list) => {
          if (active) setFound({ key, list });
        })
        .catch(() => {});
    }, 800);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [token, city, text, key]);

  const list = found && found.key === key ? found.list : [];
  if (list.length === 0) return null;
  return (
    <div className="waiting-nearby" role="status">
      {list.slice(0, 3).map((item) => (
        <p key={item.trade}>
          <strong>
            Vicino a te {item.count === 1 ? "c'è 1 richiesta" : `ci sono ${item.count} richieste`} di {item.trade.toLowerCase()}
          </strong>{" "}
          che {item.count === 1 ? "aspetta" : "aspettano"} qualcuno: {item.count === 1 ? "ti arriva da sola" : "ti arrivano da sole"} quando salvi, con il profilo attivo.
        </p>
      ))}
    </div>
  );
}
