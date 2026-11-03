"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_PROPOSAL_KINDS_INFO, type AdminProposal, type AdminProposalAction, type AdminProposalList } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { errorMessage } from "@/components/admin/adminUi";

/** Dopo una decisione: una riga che dice cosa è successo, al posto della scheda. */
type Outcome = { id: string; text: string; undo: { label: string; href: string } | null };

/** Destinatari visibili subito; gli altri dietro "Vedi tutti". */
const RECIPIENTS_SHOWN = 3;

/**
 * "Da approvare" in cima a Da fare (richiesta di Luca,
 * docs/changelog/2026-11-03-automazioni-admin.md): modifiche già pronte con
 * l'anteprima esatta e il motivo. "Approva" fa quello che farebbe il
 * pulsante a mano della pagina di sempre; "Non ora" la rimanda di 14
 * giorni; "No, mai" non la ripropone più. Ogni admin vede solo quelle del
 * suo permesso. Nessuna scheda se non c'è niente da approvare.
 */
export function AdminProposalsPanel({ token }: { token: string }) {
  const [list, setList] = useState<AdminProposalList | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const load = useCallback(() => {
    apiClient
      .adminProposals(token)
      .then(setList)
      .catch(() => setList(null));
  }, [token]);
  useEffect(load, [load]);

  async function decide(item: AdminProposal, action: AdminProposalAction) {
    const info = ADMIN_PROPOSAL_KINDS_INFO[item.kind];
    if (action === "approve" && info.confirm && confirming !== item.id) {
      setConfirming(item.id);
      return;
    }
    setPending(item.id);
    setErrors((e) => ({ ...e, [item.id]: "" }));
    try {
      const res = await apiClient.adminDecideProposal(token, item.id, action);
      const text =
        action === "approve"
          ? `Fatto: ${item.title.charAt(0).toLowerCase()}${item.title.slice(1)}.${res.result ? ` ${res.result}.` : ""}`
          : action === "snooze"
            ? `Rimandata di 14 giorni: ${item.title}.`
            : `Non te la riproporremo: ${item.title}.`;
      setOutcomes((o) => [{ id: item.id, text, undo: action === "approve" ? info.undo : null }, ...o].slice(0, 3));
      setConfirming(null);
      load();
    } catch (err) {
      setErrors((e) => ({ ...e, [item.id]: errorMessage(err) }));
      // Proposta cambiata o tolta da un altro admin: si ricarica l'elenco.
      load();
    } finally {
      setPending(null);
    }
  }

  const items = list?.items ?? [];
  if (items.length === 0 && outcomes.length === 0) return null;

  return (
    <section className="proposals" aria-labelledby="proposals-title">
      <div className="proposals-head">
        <h2 id="proposals-title" className="proposals-title">
          Da approvare
          {list && list.total > 0 ? <span className="proposals-count">{list.total}</span> : null}
        </h2>
        <p className="proposals-intro">Il sito le ha già preparate: approvando fanno quello che faresti a mano.</p>
      </div>

      <div role="status" aria-live="polite" className="proposals-outcomes">
        {outcomes.map((o) => (
          <p key={o.id} className="proposals-outcome">
            {o.text}
            {o.undo ? (
              <>
                {" "}
                <Link href={o.undo.href}>{o.undo.label}</Link>
              </>
            ) : null}
          </p>
        ))}
      </div>

      {items.length > 0 ? (
        <ol className="proposals-list">
          {items.map((item) => {
            const info = ADMIN_PROPOSAL_KINDS_INFO[item.kind];
            const busy = pending === item.id;
            const askConfirm = confirming === item.id;
            const error = errors[item.id];
            return (
              <li key={item.id} className="proposal">
                <span className="proposal-kind">{info.label}</span>
                <h3 className="proposal-title">{item.title}</h3>
                <p className="proposal-why">
                  <span>Perché: </span>
                  {item.why}
                </p>

                <div className="proposal-preview">
                  <span className="proposal-preview-label">Cosa cambia</span>
                  {item.preview.type === "lines" ? (
                    <ul className="proposal-lines">
                      {item.preview.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <EmailPreview preview={item.preview} />
                  )}
                </div>

                {askConfirm && info.confirm ? (
                  <p className="proposal-confirm" role="alert">
                    {info.confirm}
                  </p>
                ) : null}
                {error ? (
                  <p className="proposal-error" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="proposal-actions">
                  <button type="button" className="admin-link-button is-primary" disabled={busy} onClick={() => void decide(item, "approve")}>
                    {busy ? "Attendi..." : askConfirm ? `Sì, ${info.approveLabel.charAt(0).toLowerCase()}${info.approveLabel.slice(1)}` : info.approveLabel}
                  </button>
                  {askConfirm ? (
                    <button type="button" className="admin-link-button" disabled={busy} onClick={() => setConfirming(null)}>
                      Annulla
                    </button>
                  ) : (
                    <>
                      <button type="button" className="admin-link-button" disabled={busy} onClick={() => void decide(item, "snooze")} aria-label={`Non ora: ${item.title}`}>
                        Non ora
                      </button>
                      <button type="button" className="proposal-never" disabled={busy} onClick={() => void decide(item, "never")} aria-label={`No, mai: ${item.title}`}>
                        No, mai
                      </button>
                    </>
                  )}
                </div>
                <p className="proposal-undo">{info.undo ? `${info.undo.label}.` : "Non si annulla dopo."}</p>
              </li>
            );
          })}
        </ol>
      ) : null}
      {list && list.total > items.length ? <p className="proposals-more">Altre {list.total - items.length} dopo queste.</p> : null}
    </section>
  );
}

function EmailPreview({ preview }: { preview: Extract<AdminProposal["preview"], { type: "email" }> }) {
  const shown = preview.recipients.slice(0, RECIPIENTS_SHOWN);
  const rest = preview.recipients.slice(RECIPIENTS_SHOWN);
  return (
    <div className="proposal-email-wrap">
      <p className="proposal-recipients-label">
        Parte a {preview.recipients.length === 1 ? "1 persona" : `${preview.recipients.length} persone`}:
      </p>
      <ul className="proposal-recipients">
        {shown.map((r) => (
          <Recipient key={`${r.label}-${r.href ?? ""}`} r={r} />
        ))}
      </ul>
      {rest.length > 0 ? (
        <details className="proposal-more-recipients">
          <summary>Vedi gli altri {rest.length}</summary>
          <ul className="proposal-recipients">
            {rest.map((r) => (
              <Recipient key={`${r.label}-${r.href ?? ""}`} r={r} />
            ))}
          </ul>
        </details>
      ) : null}
      <div className="proposal-email" aria-label="Anteprima dell'email">
        <p className="proposal-email-subject">
          <span>Oggetto: </span>
          {preview.subject}
        </p>
        <p className="proposal-email-title">{preview.title}</p>
        {preview.paragraphs.map((p) => (
          <p key={p} className="proposal-email-text">
            {p}
          </p>
        ))}
        {preview.cta ? <span className="proposal-email-cta">{preview.cta}</span> : null}
      </div>
      {preview.recipients.length > 1 ? <p className="proposal-email-note">Agli altri cambiano solo il nome e i dettagli.</p> : null}
    </div>
  );
}

function Recipient({ r }: { r: { label: string; detail: string | null; href: string | null } }) {
  return (
    <li>
      {r.href ? <Link href={r.href}>{r.label}</Link> : <strong>{r.label}</strong>}
      {r.detail ? <span> · {r.detail}</span> : null}
    </li>
  );
}
