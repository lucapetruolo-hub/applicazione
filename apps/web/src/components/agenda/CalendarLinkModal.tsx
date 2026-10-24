"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

/**
 * "Collega al tuo calendario" (docs/CHANGELOG.md §288, scelto dall'utente):
 * gli appuntamenti compaiono anche in Google Calendar o sull'iPhone, in sola
 * lettura. Un interruttore lo spegne e rende inutile il link già dato.
 */
export function CalendarLinkModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [feedToken, setFeedToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .calendarFeedStatus(token)
      .then((status) => setFeedToken(status.token))
      .catch(() => setFeedToken(null));
  }, [token]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function toggle() {
    setError(null);
    setBusy(true);
    try {
      const status = feedToken ? await apiClient.disableCalendarFeed(token) : await apiClient.enableCalendarFeed(token);
      setFeedToken(status.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non è andata, riprova.");
    } finally {
      setBusy(false);
    }
  }

  const feedUrl = feedToken ? apiClient.calendarFeedUrl(feedToken) : null;
  const webcalUrl = feedUrl?.replace(/^https?:\/\//, "webcal://") ?? null;
  const googleUrl = webcalUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}` : null;

  async function copy() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copia non riuscita: tieni premuto sul link per copiarlo.");
    }
  }

  return (
    <div className="ag-dialog-wrap" role="presentation" onClick={closeOnBackdrop(onClose)}>
      <div className="ag-dialog" role="dialog" aria-modal="true" aria-labelledby="ag-cal-link-title">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 id="ag-cal-link-title">Collega al tuo calendario</h2>
          <button type="button" className="ag-icon-btn" style={{ marginLeft: "auto", background: "#f6f1ec", borderRadius: "50%" }} onClick={onClose} aria-label="Chiudi">
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="ag-muted" style={{ fontSize: 14, marginTop: 6 }}>
          I tuoi appuntamenti compaiono anche lì. Si modificano solo da qui.
        </p>

        <button
          type="button"
          role="switch"
          aria-checked={Boolean(feedToken)}
          className="ag-switch"
          style={{ marginTop: 16 }}
          disabled={busy || feedToken === undefined}
          onClick={toggle}
        >
          Sincronizzazione attiva
          <i aria-hidden />
        </button>

        {feedUrl ? (
          <>
            <div className="ag-actions" style={{ marginTop: 16 }}>
              <a className="ag-btn primary" style={{ flex: 1 }} href={googleUrl!} target="_blank" rel="noreferrer">
                Google Calendar
              </a>
              <a className="ag-btn" style={{ flex: 1 }} href={webcalUrl!}>
                iPhone
              </a>
            </div>
            <p className="ag-muted" style={{ fontSize: 13, marginTop: 12 }}>
              Google aggiorna il calendario ogni qualche ora. Altri calendari:{" "}
              <button type="button" className="ag-link" style={{ fontSize: 13 }} onClick={copy}>
                {copied ? "Link copiato" : "copia il link"}
              </button>
              . Non condividerlo: chi lo ha vede i tuoi appuntamenti.
            </p>
            {/* P2 della verifica (docs/CHANGELOG.md §310): spegnere il link non cancella quello che il calendario ha già copiato. */}
            <p className="ag-muted" style={{ fontSize: 13, marginTop: 8 }}>
              Se spegni la sincronizzazione, togli il calendario anche da Google o dall&apos;iPhone: gli appuntamenti già copiati restano lì.
            </p>
          </>
        ) : null}

        {error ? (
          <div className="ag-banner error" role="alert" style={{ marginTop: 14, marginBottom: 0 }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
