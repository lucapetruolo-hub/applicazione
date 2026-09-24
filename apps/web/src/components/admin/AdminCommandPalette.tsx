"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminRoleName, AdminSearchResult } from "@professionisti/api-client";
import { adminCan, CONTENT_REPORT_TARGET_LABEL } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { ADMIN_NAV_ITEMS } from "./AdminNav";

type Item = { key: string; title: string; subtitle?: string; href: string; group: string };

/**
 * Ricerca globale del pannello (⌘K / Ctrl+K, docs/CHANGELOG.md §145), come
 * in Linear o Stripe: sezioni del pannello, utenti (email, nome, attività)
 * e segnalazioni (motivo), navigabili con frecce e Invio.
 */
export function AdminCommandPalette({
  open,
  onClose,
  token,
  adminRole,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  adminRole: AdminRoleName | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<AdminSearchResult | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setResults(null);
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (!open || query.length < 2) {
      setResults(null);
      return;
    }
    const handle = setTimeout(() => {
      apiClient
        .adminSearch(token, query)
        .then(setResults)
        .catch(() => setResults(null));
    }, 200);
    return () => clearTimeout(handle);
  }, [q, open, token]);

  const items: Item[] = useMemo(() => {
    const query = q.trim().toLowerCase();
    const pages = ADMIN_NAV_ITEMS.filter((item) => adminCan(adminRole, item.scope))
      .filter((item) => !query || item.label.toLowerCase().includes(query))
      .map((item) => ({ key: `page-${item.href}`, title: item.label, href: item.href, group: "Sezioni" }));
    const users = (results?.users ?? []).map((u) => ({
      key: `user-${u.id}`,
      title: u.businessName ?? ([u.name, u.surname].filter(Boolean).join(" ") || u.email || "Utente"),
      subtitle: [u.email, u.suspendedAt ? "sospeso" : u.deletedAt ? "eliminato" : null].filter(Boolean).join(" · "),
      href: `/admin/utenti/${u.id}`,
      group: "Utenti",
    }));
    const reports = adminCan(adminRole, "MODERATION")
      ? (results?.reports ?? []).map((r) => ({
          key: `report-${r.id}`,
          title: r.reason,
          subtitle: `${CONTENT_REPORT_TARGET_LABEL[r.targetType]} · ${r.status === "OPEN" ? "da gestire" : "decisa"}`,
          href: `/admin/segnalazioni?vista=${r.status === "OPEN" ? "da-gestire" : "archivio"}`,
          group: "Segnalazioni",
        }))
      : [];
    return [...pages, ...users, ...reports];
  }, [q, results, adminRole]);

  useEffect(() => setActive(0), [items.length]);

  if (!open) return null;

  function go(item: Item | undefined) {
    if (!item) return;
    onClose();
    router.push(item.href);
  }

  return (
    <div className="admin-palette-backdrop" onMouseDown={onClose}>
      <div className="admin-palette" role="dialog" aria-modal="true" aria-label="Cerca nel pannello" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          autoFocus
          className="admin-palette-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca utenti, segnalazioni, sezioni…"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(items.length - 1, i + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            }
            if (e.key === "Enter") go(items[active]);
          }}
        />
        <div className="admin-palette-list" role="listbox">
          {items.length === 0 ? (
            <div className="admin-palette-empty">{q.trim().length < 2 ? "Scrivi almeno 2 lettere per cercare utenti e segnalazioni." : "Nessun risultato."}</div>
          ) : (
            items.map((item, index) => (
              <div key={item.key}>
                {index === 0 || items[index - 1]?.group !== item.group ? <div className="admin-palette-group">{item.group}</div> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={`admin-palette-item${index === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item)}
                >
                  <span className="admin-palette-title">{item.title}</span>
                  {item.subtitle ? <span className="admin-palette-subtitle">{item.subtitle}</span> : null}
                </button>
              </div>
            ))
          )}
        </div>
        <div className="admin-palette-hint">↑↓ per muoverti · Invio per aprire · Esc per chiudere</div>
      </div>
    </div>
  );
}
