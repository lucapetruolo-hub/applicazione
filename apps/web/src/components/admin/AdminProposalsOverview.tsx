"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_PROPOSAL_KINDS_INFO, type AdminRejectedProposal } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { errorMessage, formatAdminDate } from "@/components/admin/adminUi";

/**
 * "Da approvare" in Andamento (docs/changelog/2026-11-04-automazioni-admin-migliorie.md):
 * quante modifiche pronte aspettano in Home, con il link per deciderle lì
 * (si decide in un posto solo), e le proposte fermate con "No, mai", che si
 * possono riproporre. Niente se non c'è nulla da mostrare.
 */
export function AdminProposalsOverview({ token }: { token: string }) {
  const [pending, setPending] = useState<number | null>(null);
  const [rejected, setRejected] = useState<AdminRejectedProposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiClient
      .adminProposals(token)
      .then((list) => setPending(list.total))
      .catch(() => setPending(null));
    apiClient
      .adminRejectedProposals(token)
      .then(setRejected)
      .catch(() => setRejected([]));
  }, [token]);
  useEffect(load, [load]);

  async function restore(item: AdminRejectedProposal) {
    setBusy(item.id);
    setError(null);
    setMessage(null);
    try {
      const res = await apiClient.adminRestoreProposal(token, item.id);
      setMessage(
        res.back
          ? `"${item.title}" è di nuovo in Da approvare.`
          : `Tolto il "No, mai" da "${item.title}", ma oggi non serve: tornerà da sola se i numeri la chiederanno.`,
      );
      load();
    } catch (err) {
      setError(errorMessage(err));
      load();
    } finally {
      setBusy(null);
    }
  }

  if (!pending && rejected.length === 0 && !message) return null;

  return (
    <section className="proposals-overview" aria-labelledby="proposals-overview-title">
      <h2 id="proposals-overview-title" className="proposals-title">
        Da approvare
        {pending ? <span className="proposals-count">{pending}</span> : null}
      </h2>
      {pending ? (
        <p className="proposals-intro">
          {pending === 1 ? "Una modifica già pronta aspetta" : `${pending} modifiche già pronte aspettano`} il tuo sì.{" "}
          <Link href="/admin#da-approvare" className="proposals-overview-link">
            Vai a Da approvare
          </Link>
        </p>
      ) : (
        <p className="proposals-intro">Nessuna modifica da approvare adesso.</p>
      )}

      <div role="status" aria-live="polite" className="proposals-outcomes">
        {message ? <p className="proposals-outcome">{message}</p> : null}
      </div>
      {error ? (
        <p className="proposal-error" role="alert">
          {error}
        </p>
      ) : null}

      {rejected.length > 0 ? (
        <details id="proposte-rifiutate" className="proposals-rejected">
          <summary>Fermate con &quot;No, mai&quot; ({rejected.length})</summary>
          <p className="proposals-more">Non tornano più da sole. &quot;Riproponi&quot; le rimette in Da approvare, se servono ancora.</p>
          <ul className="site-notes">
            {rejected.map((item) => (
              <li key={item.id}>
                <span>
                  <span className="proposals-rejected-kind">{ADMIN_PROPOSAL_KINDS_INFO[item.kind].label}: </span>
                  {item.title}
                </span>
                {item.decidedAt ? (
                  <time dateTime={item.decidedAt}>
                    il {formatAdminDate(item.decidedAt)}
                    {item.decidedBy ? `, ${item.decidedBy}` : ""}
                  </time>
                ) : null}
                <button type="button" className="notif-link" disabled={busy === item.id} onClick={() => void restore(item)} aria-label={`Riproponi: ${item.title}`}>
                  {busy === item.id ? "Attendi..." : "Riproponi"}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
