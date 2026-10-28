"use client";

import { useEffect, useState } from "react";
import type { AdminDispute, AdminRefund } from "@professionisti/api-client";
import {
  ONLINE_LIMIT_FREE_DAYS,
  ONLINE_LIMIT_FREE_JOBS,
  ONLINE_LIMIT_REASON_MAX,
  bankDisputeReasonLabel,
  bankDisputeStatusLabel,
  formatEur,
  formatEurCents,
  type AdminBankDispute,
  type AdminOnlineLimitRow,
  type AdminUnpaidBalance,
} from "@professionisti/shared";
import Link from "next/link";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { useAdminOverview } from "@/components/admin/AdminOverviewContext";
import { AdminCard, AdminPageHeader, AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { PdfButton } from "@/app/dashboard/documenti/_components/DocumentParts";

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
  return cents === undefined ? "—" : formatEurCents(cents);
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
  const [limits, setLimits] = useState<AdminOnlineLimitRow[] | null>(null);
  const [bankDisputes, setBankDisputes] = useState<AdminBankDispute[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!token) return;
    Promise.all([
      apiClient.adminListRefunds(token),
      apiClient.adminListDisputes(token),
      apiClient.adminListUnpaidBalances(token),
      apiClient.adminListOnlineLimits(token),
      apiClient.adminListBankDisputes(token),
    ])
      .then(([r, d, u, l, b]) => {
        setBankDisputes(b);
        setRefunds(r);
        setDisputes(d);
        setUnpaid(u);
        setLimits(l);
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
          Contestazioni in banca
        </Text>
        <Text fontSize={13} color={brand.grafite70}>
          Clienti che hanno contestato un pagamento online con la loro banca. Rileggi le prove già scritte dal sito e mandale prima della
          scadenza: con le prove parte anche il riepilogo PDF del lavoro.
        </Text>
        {bankDisputes && bankDisputes.length === 0 ? <Text color={brand.grafite70}>Nessuna contestazione in banca aperta.</Text> : null}
        {bankDisputes?.map((row) => <BankDisputeCard key={row.jobPaymentId} row={row} token={token ?? ""} onChanged={reload} />)}
      </YStack>

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

      <YStack gap="$3">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Tetto ai pagamenti online
        </Text>
        <Text fontSize={13} color={brand.grafite70}>
          Online si chiede al massimo un tetto a lavoro finché il professionista non ha {ONLINE_LIMIT_FREE_JOBS} lavori pagati online senza
          contestazioni e {ONLINE_LIMIT_FREE_DAYS} giorni dal primo. Puoi toglierlo a chi conosci; una contestazione in banca persa lo rimette.
        </Text>
        {limits && limits.length === 0 ? <Text color={brand.grafite70}>Nessun professionista con i pagamenti online attivi.</Text> : null}
        {limits?.map((row) => <OnlineLimitCard key={row.professionalProfileId} row={row} token={token ?? ""} onChanged={reload} />)}
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
              <textarea aria-label="Nota sull'esito" className="admin-input admin-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota sull'esito (facoltativa)" />
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
        Saldo scoperto: {formatEurCents(row.dueEurCents)}
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Importo finale {row.finalAmountEurCents !== null ? formatEurCents(row.finalAmountEurCents) : "—"} · pagato {formatEurCents(row.paidEurCents)} · dal{" "}
        {formatAdminDate(row.balanceUnpaidAt, true)}
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Cliente <Link href={`/admin/utenti/${row.client.userId}`}>{row.client.name ?? row.client.email}</Link> ({row.client.email}) · professionista{" "}
        <Link href={`/admin/utenti/${row.professional.userId}`}>{row.professional.businessName}</Link>
      </Text>
      {open ? (
        <YStack gap="$2">
          <textarea aria-label="Come si è chiuso" className="admin-input admin-textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Come si è chiuso (es. pagato al professionista, rinuncia)" />
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

function OnlineLimitCard({ row, token, onChanged }: { row: AdminOnlineLimitRow; token: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Togliere il tetto chiede un motivo, che resta nel registro azioni.
  const [askReason, setAskReason] = useState(false);
  const [reason, setReason] = useState("");
  const removedByAdmin = row.removedByAdminAt !== null;

  async function save(removed: boolean) {
    setError(null);
    if (removed && reason.trim().length < 3) {
      setError("Scrivi perché togli il tetto.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.adminSetOnlineLimit(token, row.professionalProfileId, removed, removed ? reason.trim() : undefined);
      setAskReason(false);
      setReason("");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <XStack justifyContent="space-between" gap="$2" flexWrap="wrap" alignItems="center">
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <AdminPill tone={row.limitEurCents === null ? "ok" : "neutral"}>{row.limitEurCents === null ? "Nessun tetto" : `Fino a ${formatEur(row.limitEurCents)}`}</AdminPill>
          <Text fontWeight="700" color={brand.grafite}>
            {row.businessName} · {row.city}
          </Text>
        </XStack>
        {askReason ? null : (
          <Button
            variant="secondary"
            size="$3"
            disabled={busy || (row.limitEurCents === null && !removedByAdmin)}
            onPress={() => (removedByAdmin ? save(false) : setAskReason(true))}
          >
            {busy ? "…" : removedByAdmin ? "Rimetti il tetto" : "Togli il tetto"}
          </Button>
        )}
      </XStack>
      <Text fontSize={13} color={brand.grafite70}>
        {row.cleanJobs} lavori pagati online senza contestazioni{row.firstCleanJobAt ? `, il primo il ${formatAdminDate(row.firstCleanJobAt)}` : ""}
        {removedByAdmin ? ` · tetto tolto il ${formatAdminDate(row.removedByAdminAt)}` : ""}
      </Text>
      {askReason ? (
        <YStack gap="$2">
          <textarea
            aria-label="Perché togli il tetto"
            className="admin-input admin-textarea"
            maxLength={ONLINE_LIMIT_REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Perché togli il tetto (es. professionista conosciuto, lavori grandi già fatti)"
          />
          <XStack gap="$2">
            <Button variant="primary" size="$3" disabled={busy} onPress={() => save(true)}>
              {busy ? "…" : "Togli il tetto"}
            </Button>
            <Button
              variant="secondary"
              size="$3"
              onPress={() => {
                setAskReason(false);
                setError(null);
              }}
            >
              Annulla
            </Button>
          </XStack>
        </YStack>
      ) : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
    </AdminCard>
  );
}

function BankDisputeCard({ row, token, onChanged }: { row: AdminBankDispute; token: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(row.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (field: keyof AdminBankDispute["draft"]) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [field]: e.target.value }));

  async function save(submit: boolean) {
    setError(null);
    setSaved(false);
    if (draft.explanation.trim().length < 20) {
      setError("Spiega in qualche riga perché il pagamento è dovuto.");
      return;
    }
    setBusy(true);
    try {
      await apiClient.adminSaveBankDisputeEvidence(token, row.jobPaymentId, { ...draft, submit });
      setConfirming(false);
      if (submit) onChanged();
      else setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <XStack gap="$2" alignItems="center" flexWrap="wrap">
        <AdminPill tone={row.submitted ? "neutral" : "warn"}>{bankDisputeStatusLabel(row.status)}</AdminPill>
        <Text fontWeight="800" color={brand.grafite}>
          {formatEurCents(row.amountEurCents)}
        </Text>
        <Text color={brand.grafite}>{bankDisputeReasonLabel(row.reason)}</Text>
      </XStack>
      <Text fontSize={13} color={brand.grafite70}>
        {row.businessName} · cliente {row.clientName}
        {row.dueBy && !row.submitted ? ` · prove entro il ${formatAdminDate(row.dueBy)}` : ""}
        {!row.submitted ? (row.professionalNote ? " · il professionista ha scritto la sua spiegazione" : " · il professionista non ha ancora scritto") : ""}
      </Text>
      {row.submitted ? (
        <Text fontSize={13} color={brand.grafite70}>
          Prove mandate: la banca decide di solito entro 2-3 mesi. L&apos;esito arriva da solo.
        </Text>
      ) : open ? (
        <YStack gap="$2">
          {row.professionalNote ? (
            <YStack gap="$1" padding="$3" borderRadius="$3" backgroundColor={brand.gesso}>
              <Text fontSize={13} color={brand.grafite70}>
                Spiegazione del professionista, {formatAdminDate(row.professionalNote.at)}
                {row.professionalNote.photoUrls.length ? ` · ${row.professionalNote.photoUrls.length} foto, già nel PDF` : ""}
              </Text>
              <Text color={brand.grafite} style={{ whiteSpace: "pre-wrap" }}>
                {row.professionalNote.text}
              </Text>
            </YStack>
          ) : null}
          <label>
            <Text fontSize={13} color={brand.grafite70}>
              Spiegazione per la banca
            </Text>
            <textarea aria-label="Spiegazione per la banca" className="admin-input admin-textarea" rows={9} value={draft.explanation} onChange={set("explanation")} />
          </label>
          <label>
            <Text fontSize={13} color={brand.grafite70}>
              Lavoro fatto
            </Text>
            <input aria-label="Lavoro fatto" className="admin-input" value={draft.productDescription} onChange={set("productDescription")} />
          </label>
          <XStack gap="$2" flexWrap="wrap">
            <label style={{ flex: 1, minWidth: 180 }}>
              <Text fontSize={13} color={brand.grafite70}>
                Cliente
              </Text>
              <input aria-label="Nome del cliente" className="admin-input" value={draft.customerName ?? ""} onChange={set("customerName")} />
            </label>
            <label style={{ flex: 1, minWidth: 180 }}>
              <Text fontSize={13} color={brand.grafite70}>
                Email del cliente
              </Text>
              <input aria-label="Email del cliente" className="admin-input" value={draft.customerEmail ?? ""} onChange={set("customerEmail")} />
            </label>
            <label style={{ flex: 1, minWidth: 140 }}>
              <Text fontSize={13} color={brand.grafite70}>
                Giorno del lavoro
              </Text>
              <input aria-label="Giorno del lavoro" className="admin-input" value={draft.serviceDate ?? ""} onChange={set("serviceDate")} />
            </label>
          </XStack>
          <PdfButton load={() => apiClient.adminBankDisputePdf(token, row.jobPaymentId)} fileName="riepilogo-lavoro.pdf" label="Guarda il riepilogo PDF" variant="secondary" />
          {error ? <Text color={brand.urgenza}>{error}</Text> : null}
          {saved ? <Text color={brand.grafite70}>Salvate su Stripe, non ancora mandate alla banca.</Text> : null}
          {confirming ? (
            <YStack gap="$2">
              <Text color={brand.grafite}>Dopo l&apos;invio le prove non si possono più cambiare.</Text>
              <XStack gap="$2" flexWrap="wrap">
                <Button variant="primary" size="$3" disabled={busy} onPress={() => save(true)}>
                  {busy ? "…" : "Conferma l'invio"}
                </Button>
                <Button variant="secondary" size="$3" onPress={() => setConfirming(false)}>
                  Annulla
                </Button>
              </XStack>
            </YStack>
          ) : (
            <XStack gap="$2" flexWrap="wrap">
              <Button variant="primary" size="$3" disabled={busy} onPress={() => setConfirming(true)}>
                Manda alla banca
              </Button>
              <Button variant="secondary" size="$3" disabled={busy} onPress={() => save(false)}>
                {busy ? "…" : "Salva senza mandare"}
              </Button>
              <Button variant="secondary" size="$3" onPress={() => setOpen(false)}>
                Chiudi
              </Button>
            </XStack>
          )}
        </YStack>
      ) : (
        <Button variant="primary" size="$3" alignSelf="flex-start" onPress={() => setOpen(true)}>
          Prepara le prove
        </Button>
      )}
    </AdminCard>
  );
}
