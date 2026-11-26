"use client";

import { useEffect, useState } from "react";
import { formatEurCents, type AdminSubscriptionWithdrawal } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { AdminCard, AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";

const STATUS: Record<AdminSubscriptionWithdrawal["status"], { label: string; tone: "warn" | "ok" | "neutral" }> = {
  PENDING: { label: "Da decidere", tone: "warn" },
  APPROVED: { label: "Rimborsato", tone: "ok" },
  REJECTED: { label: "Rifiutato", tone: "neutral" },
};

/** "12,50" o "12" → 1250 centesimi; null se non è un importo. */
function parseEuro(text: string): number | null {
  const clean = text.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/**
 * Recessi dall'abbonamento entro 14 giorni (docs/changelog/2026-11-26-recesso-abbonamento.md):
 * il sito propone il rimborso (pagato meno giorni o lavori usati, la parte più alta),
 * la Finanza approva, cambia la cifra o rifiuta con il motivo.
 */
export function SubscriptionWithdrawalsSection({ token }: { token: string }) {
  const [rows, setRows] = useState<AdminSubscriptionWithdrawal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Dopo una decisione si aggiorna anche il numero accanto a Pagamenti nel menu.
  const { refresh } = useAdminOverview();
  function changed(next: AdminSubscriptionWithdrawal[]) {
    setRows(next);
    refresh();
  }

  useEffect(() => {
    let alive = true;
    apiClient
      .adminSubscriptionWithdrawals(token)
      .then((r) => alive && setRows(r))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <YStack gap="3">
      <Text fontFamily="heading" fontWeight="800" fontSize="6" color={brand.grafite}>
        Recessi dall&apos;abbonamento
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Chi lavora senza partita IVA può recedere per 14 giorni dopo aver pagato. Il rimborso proposto è quanto pagato meno la parte usata (giorni o
        lavori, la più alta). Approvando si chiude l&apos;abbonamento e parte il rimborso sulla carta.
      </Text>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows && rows.length === 0 ? <Text color={brand.grafite70}>Nessuna richiesta di recesso.</Text> : null}
      {rows?.map((row) => <WithdrawalCard key={row.id} row={row} token={token} onChanged={changed} />)}
    </YStack>
  );
}

function WithdrawalCard({ row, token, onChanged }: { row: AdminSubscriptionWithdrawal; token: string; onChanged: (rows: AdminSubscriptionWithdrawal[]) => void }) {
  const [amount, setAmount] = useState((row.proposedRefundEurCents / 100).toFixed(2).replace(".", ","));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = STATUS[row.status];
  const pending = row.status === "PENDING";

  async function approve() {
    const cents = parseEuro(amount);
    if (cents === null || cents > row.paidEurCents) {
      setError(`Scrivi un importo tra 0 e ${formatEurCents(row.paidEurCents)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await apiClient.adminApproveSubscriptionWithdrawal(token, row.id, { refundEurCents: cents, note: note.trim() || undefined }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (note.trim().length < 3) {
      setError("Scrivi il motivo per il professionista.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onChanged(await apiClient.adminRejectSubscriptionWithdrawal(token, row.id, note.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard highlight={pending}>
      <XStack gap="2" alignItems="center" flexWrap="wrap">
        <AdminPill tone={status.tone}>{status.label}</AdminPill>
        <Text fontWeight="700" color={brand.grafite}>
          {row.businessName} · {row.tierLabel}
        </Text>
      </XStack>
      <Text fontSize={13} color={brand.grafite70}>
        Pagato {formatEurCents(row.paidEurCents)} il {formatAdminDate(row.paidAt)} · richiesta del {formatAdminDate(row.requestedAt)} · usati {row.daysUsed} giorni
        su {row.periodDays} e {row.jobsUsed} lavori{row.jobsLimit === null ? " (senza limite)" : ` su ${row.jobsLimit}`}
      </Text>
      {row.reason ? <Text color={brand.grafite}>Motivo: {row.reason}</Text> : null}
      {pending ? (
        <YStack gap="2">
          <Text fontSize={13} color={brand.grafite70}>
            Rimborso proposto: {formatEurCents(row.proposedRefundEurCents)}
          </Text>
          <XStack gap="2" alignItems="center" flexWrap="wrap">
            <label htmlFor={`refund-${row.id}`}>
              <Text fontWeight="700" color={brand.grafite}>
                Rimborso €
              </Text>
            </label>
            <input id={`refund-${row.id}`} className="admin-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ maxWidth: 140 }} />
          </XStack>
          <textarea
            aria-label="Nota per il professionista"
            className="admin-input admin-textarea"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota per il professionista (obbligatoria se rifiuti)"
          />
          <XStack gap="2" flexWrap="wrap">
            <Button variant="primary" size="3" disabled={busy} onPress={() => void approve()}>
              {busy ? "…" : "Approva e rimborsa"}
            </Button>
            <Button variant="secondary" size="3" disabled={busy} onPress={() => void reject()}>
              Rifiuta
            </Button>
          </XStack>
        </YStack>
      ) : (
        <Text fontSize={13} color={brand.grafite70}>
          {row.status === "APPROVED" ? `Rimborsati ${formatEurCents(row.refundEurCents ?? 0)}` : "Rifiutato"}
          {row.decidedAt ? ` il ${formatAdminDate(row.decidedAt)}` : ""}
          {row.decisionNote ? ` · ${row.decisionNote}` : ""}
        </Text>
      )}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
    </AdminCard>
  );
}
