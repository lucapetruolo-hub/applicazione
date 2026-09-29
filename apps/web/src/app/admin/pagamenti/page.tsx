"use client";

import { useEffect, useState } from "react";
import type { AdminDispute, AdminRefund } from "@professionisti/api-client";
import type { AdminUnpaidBalance } from "@professionisti/shared";
import Link from "next/link";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";
import { AdminCard, AdminPageHeader, AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";

const REFUND_STATUS: Record<AdminRefund["status"], { label: string; tone: "warn" | "ok" | "neutral" | "danger" }> = {
  REQUESTED: { label: "Da decidere", tone: "warn" },
  APPROVED: { label: "Approvato", tone: "ok" },
  PROCESSED: { label: "Rimborsato", tone: "ok" },
  REJECTED: { label: "Rifiutato", tone: "neutral" },
};
const DISPUTE_STATUS: Record<AdminDispute["status"], { label: string; tone: "warn" | "ok" | "neutral" | "danger" }> = {
  OPEN: { label: "Aperta", tone: "warn" },
  UNDER_REVIEW: { label: "In esame", tone: "warn" },
  RESOLVED_CLIENT: { label: "Risolta a favore del cliente", tone: "ok" },
  RESOLVED_PROFESSIONAL: { label: "Risolta a favore del professionista", tone: "ok" },
  CLOSED: { label: "Chiusa", tone: "neutral" },
};

function euro(cents: number | undefined): string {
  return cents === undefined ? "—" : (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

/**
 * Rimborsi e contestazioni sui pagamenti (docs/CHANGELOG.md §144): le API
 * esistevano già (CLAUDE.md §88) ma nessuna pagina le usava.
 */
export default function AdminPagamentiPage() {
  const { token } = useAuth();
  const { refresh } = useAdminOverview();
  const [refunds, setRefunds] = useState<AdminRefund[] | null>(null);
  const [disputes, setDisputes] = useState<AdminDispute[] | null>(null);
  const [unpaid, setUnpaid] = useState<AdminUnpaidBalance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!token) return;
    Promise.all([apiClient.adminListRefunds(token), apiClient.adminListDisputes(token), apiClient.adminListUnpaidBalances(token)])
      .then(([r, d, u]) => {
        setRefunds(r);
        setDisputes(d);
        setUnpaid(u);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
    refresh();
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <YStack gap="$6">
      <AdminPageHeader
        title="Pagamenti e rimborsi"
        description="Saldi dei pagamenti online non pagati, rimborsi e contestazioni. I rimborsi delle segnalazioni accolte e degli annullamenti partono da soli; qui restano quelli da controllare."
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      <YStack gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Saldi non pagati
        </Text>
        <Text fontSize={13} color={brand.grafite70}>
          Clienti che non hanno pagato il saldo online entro 7 giorni dalla chiusura del lavoro: il professionista ha ricevuto quanto già
          pagato. Sollecita il cliente; se paga dal sito il saldo arriva da solo al professionista.
        </Text>
        {unpaid && unpaid.length === 0 ? <Text color={brand.grafite70}>Nessun saldo scoperto.</Text> : null}
        {unpaid?.map((row) => <UnpaidCard key={row.jobPaymentId} row={row} token={token ?? ""} onChanged={reload} />)}
      </YStack>

      <YStack gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Rimborsi
        </Text>
        {refunds && refunds.length === 0 ? <Text color={brand.grafite70}>Nessuna richiesta di rimborso.</Text> : null}
        {refunds?.map((refund) => <RefundCard key={refund.id} refund={refund} token={token ?? ""} onChanged={reload} />)}
      </YStack>

      <YStack gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Contestazioni
        </Text>
        {disputes && disputes.length === 0 ? <Text color={brand.grafite70}>Nessuna contestazione.</Text> : null}
        {disputes?.map((dispute) => <DisputeCard key={dispute.id} dispute={dispute} token={token ?? ""} onChanged={reload} />)}
      </YStack>
    </YStack>
  );
}

function RefundCard({ refund, token, onChanged }: { refund: AdminRefund; token: string; onChanged: () => void }) {
  const [confirming, setConfirming] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = REFUND_STATUS[refund.status];

  async function decide(decision: "APPROVED" | "REJECTED") {
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminDecideRefund(token, refund.id, { decision });
      setConfirming(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard highlight={refund.status === "REQUESTED"}>
      <XStack justifyContent="space-between" gap="$2" flexWrap="wrap" alignItems="center">
        <XStack gap="$2" alignItems="center">
          <AdminPill tone={status.tone}>{status.label}</AdminPill>
          <Text fontWeight="700" color={brand.grafite}>
            {euro(refund.amountEurCents)} · {refund.jobPayment.booking.professionalProfile.businessName}
          </Text>
        </XStack>
        <Text fontSize="$2" color={brand.grafite70}>
          Richiesto il {formatAdminDate(refund.createdAt)}
        </Text>
      </XStack>
      {refund.reason ? <Text color={brand.grafite}>Motivo: {refund.reason}</Text> : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {refund.status === "REQUESTED" ? (
        confirming ? (
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Text color={brand.grafite}>{confirming === "APPROVED" ? "Approvare e rimborsare il cliente?" : "Rifiutare il rimborso?"}</Text>
            <Button variant="primary" size="$3" disabled={busy} onPress={() => decide(confirming)}>
              {busy ? "…" : "Conferma"}
            </Button>
            <Button variant="secondary" size="$3" onPress={() => setConfirming(null)}>
              Annulla
            </Button>
          </XStack>
        ) : (
          <XStack gap="$2">
            <Button variant="primary" size="$3" onPress={() => setConfirming("APPROVED")}>
              Approva
            </Button>
            <Button variant="secondary" size="$3" onPress={() => setConfirming("REJECTED")}>
              Rifiuta
            </Button>
          </XStack>
        )
      ) : null}
    </AdminCard>
  );
}

function DisputeCard({ dispute, token, onChanged }: { dispute: AdminDispute; token: string; onChanged: () => void }) {
  const [choice, setChoice] = useState<"RESOLVED_CLIENT" | "RESOLVED_PROFESSIONAL" | "CLOSED" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = DISPUTE_STATUS[dispute.status];
  const isOpen = dispute.status === "OPEN" || dispute.status === "UNDER_REVIEW";

  async function resolve() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminResolveDispute(token, dispute.id, { status: choice, resolutionNote: note.trim() || undefined });
      setChoice(null);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard highlight={isOpen}>
      <XStack justifyContent="space-between" gap="$2" flexWrap="wrap" alignItems="center">
        <XStack gap="$2" alignItems="center">
          <AdminPill tone={status.tone}>{status.label}</AdminPill>
          <Text fontWeight="700" color={brand.grafite}>
            {dispute.jobPayment.booking.professionalProfile.businessName}
          </Text>
        </XStack>
        <Text fontSize="$2" color={brand.grafite70}>
          Aperta il {formatAdminDate(dispute.createdAt)}
        </Text>
      </XStack>
      <Text color={brand.grafite}>Motivo: {dispute.reason}</Text>
      {dispute.resolutionNote ? <Text color={brand.grafite70}>Esito: {dispute.resolutionNote}</Text> : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {isOpen ? (
        <YStack gap="$2">
          <XStack gap="$2" flexWrap="wrap">
            {(["RESOLVED_CLIENT", "RESOLVED_PROFESSIONAL", "CLOSED"] as const).map((value) => (
              <Button key={value} variant={choice === value ? "primary" : "secondary"} size="$3" onPress={() => setChoice(value)}>
                {value === "RESOLVED_CLIENT" ? "A favore del cliente" : value === "RESOLVED_PROFESSIONAL" ? "A favore del professionista" : "Chiudi senza esito"}
              </Button>
            ))}
          </XStack>
          {choice ? (
            <>
              <textarea className="admin-input admin-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota sull'esito (facoltativa)" />
              <XStack gap="$2">
                <Button variant="primary" size="$3" disabled={busy} onPress={resolve}>
                  {busy ? "…" : "Conferma esito"}
                </Button>
                <Button variant="secondary" size="$3" onPress={() => setChoice(null)}>
                  Annulla
                </Button>
              </XStack>
            </>
          ) : null}
        </YStack>
      ) : null}
    </AdminCard>
  );
}

function UnpaidCard({ row, token, onChanged }: { row: AdminUnpaidBalance; token: string; onChanged: () => void }) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eur = (c: number) => `€${(c / 100).toFixed(2)}`;

  async function close() {
    setError(null);
    if (note.trim().length < 3) {
      setError("Scrivi come si è chiuso il saldo.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.adminCloseUnpaidBalance(token, row.jobPaymentId, note.trim());
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <Text fontWeight="800" color={brand.grafite}>
        Saldo scoperto: {eur(row.dueEurCents)}
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Importo finale {row.finalAmountEurCents !== null ? eur(row.finalAmountEurCents) : "—"} · pagato {eur(row.paidEurCents)} · dal{" "}
        {formatAdminDate(row.balanceUnpaidAt, true)}
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Cliente <Link href={`/admin/utenti/${row.client.userId}`}>{row.client.name ?? row.client.email}</Link> ({row.client.email}) · professionista{" "}
        <Link href={`/admin/utenti/${row.professional.userId}`}>{row.professional.businessName}</Link>
      </Text>
      {open ? (
        <YStack gap="$2">
          <textarea className="admin-input admin-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Come si è chiuso (es. pagato al professionista, rinuncia)" />
          {error ? <Text color={brand.urgenza}>{error}</Text> : null}
          <XStack gap="$2">
            <Button variant="primary" size="$3" disabled={busy} onPress={close}>
              {busy ? "…" : "Chiudi il saldo"}
            </Button>
            <Button variant="secondary" size="$3" onPress={() => setOpen(false)}>
              Annulla
            </Button>
          </XStack>
        </YStack>
      ) : (
        <Button variant="secondary" size="$3" alignSelf="flex-start" onPress={() => setOpen(true)}>
          Chiudi il saldo
        </Button>
      )}
    </AdminCard>
  );
}
