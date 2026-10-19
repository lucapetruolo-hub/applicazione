"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { TAX_ID_KIND_LABEL, type ProfessionalVerificationFilter, type ProfessionalVerificationRow } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

type Row = ProfessionalVerificationRow;

const IDENTITY_LABEL: Record<NonNullable<Row["identity"]>["status"], { text: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  STARTED: { text: "Documento e selfie: iniziata", tone: "neutral" },
  PROCESSING: { text: "Documento e selfie: in attesa di esito", tone: "neutral" },
  APPROVED: { text: "Documento e selfie: approvata", tone: "ok" },
  NEEDS_REVIEW: { text: "Documento e selfie: da rifare", tone: "danger" },
  DECLINED: { text: "Documento e selfie: rifiutata", tone: "danger" },
  EXPIRED: { text: "Documento e selfie: scaduta", tone: "neutral" },
};

const TAX_TONE: Record<Row["taxIdChecks"][number]["status"], "ok" | "warn" | "danger" | "neutral"> = {
  VALID: "ok",
  REVIEW: "neutral",
  INVALID: "danger",
  PENDING: "neutral",
};

const TAX_TEXT: Record<Row["taxIdChecks"][number]["status"], string> = {
  VALID: "confermato",
  REVIEW: "non nel registro imprese",
  INVALID: "non valido",
  PENDING: "in controllo",
};

/** Esiti dei controlli automatici: documento e selfie (Didit), codice fiscale e partita IVA (VIES, Openapi). */
function AutomaticChecks({ row, onRecheck, rechecking }: { row: Row; onRecheck?: () => void; rechecking?: boolean }) {
  if (!row.identity && row.taxIdChecks.length === 0) return null;
  // Servizio di verifica irraggiungibile all'avvio: id provvisorio "standby-…" (§256).
  const identity = row.identity
    ? row.identity.status === "STARTED" && row.identity.providerSessionId.startsWith("standby-")
      ? { text: "Documento e selfie: in attesa del servizio", tone: "neutral" as const }
      : IDENTITY_LABEL[row.identity.status]
    : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, marginTop: 4 }}>
      {row.taxIdChecks.map((check) => (
        <div key={check.kind}>
          <AdminPill tone={TAX_TONE[check.status]}>
            {TAX_ID_KIND_LABEL[check.kind]}: {TAX_TEXT[check.status]}
            {check.detail ? ` (${check.detail.toLowerCase()})` : ""}
          </AdminPill>
          {check.officialName ? <div style={{ color: brand.grafite70, fontSize: 13 }}>Registro: {check.officialName}</div> : null}
        </div>
      ))}
      {onRecheck && row.taxIdChecks.length > 0 ? (
        <button
          type="button"
          onClick={onRecheck}
          disabled={rechecking}
          style={{ background: "none", border: "none", padding: 0, color: brand.cianografiaScuro, fontWeight: 700, fontSize: 13, textDecoration: "underline", cursor: rechecking ? "wait" : "pointer" }}
        >
          {rechecking ? "Verifica in corso…" : "Ricontrolla ora"}
        </button>
      ) : null}
      {identity && row.identity ? (
        <div>
          <AdminPill tone={identity.tone}>{identity.text}</AdminPill>
          {row.identity.reason ? <div style={{ color: brand.grafite70, fontSize: 13 }}>{row.identity.reason}</div> : null}
          <div style={{ color: brand.grafite70, fontSize: 12 }}>
            Sessione {row.identity.provider}: <code>{row.identity.providerSessionId}</code>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Verifica dei professionisti (docs/CHANGELOG.md §200, §253, §255): tutto
 * automatico, documento e selfie con Didit, codice fiscale e P.IVA con VIES
 * e Openapi. L'admin non accetta né rifiuta nessuno (decisione dell'utente):
 * qui vede a che punto è ciascuno, può ricontrollare i dati fiscali e
 * togliere il badge. Nessun documento viene caricato o conservato sul sito.
 */
export default function AdminVerifichePage() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<ProfessionalVerificationFilter>("pending");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ProfessionalVerificationRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // Riga su cui si sta agendo: il pannello di conferma compare sopra l'elenco.
  const [selected, setSelected] = useState<Row | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Profilo su cui è in corso "Ricontrolla ora" (§254).
  const [recheckingId, setRecheckingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setListError(null);
    apiClient
      .adminListProfessionalVerifications(token, filter, query.trim())
      .then(setRows)
      .catch((err) => setListError(errorMessage(err)));
  }, [token, filter, query]);

  // La ricerca parte poco dopo l'ultima lettera, non a ogni tasto.
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function recheck(row: Row) {
    if (!token) return;
    setRecheckingId(row.professionalProfileId);
    setListError(null);
    try {
      const checks = await apiClient.adminRecheckTaxIds(token, row.professionalProfileId);
      const pending = checks.filter((check) => check.status === "PENDING").length;
      setDone(
        pending > 0
          ? `${row.businessName}: il servizio non ha risposto, riproviamo da soli tra poco.`
          : `${row.businessName}: codice fiscale e partita IVA verificati di nuovo.`,
      );
      load();
    } catch (err) {
      setListError(errorMessage(err));
    } finally {
      setRecheckingId(null);
    }
  }

  function open(row: Row) {
    setSelected(row);
    setNote("");
    setActionError(null);
    setDone(null);
  }

  async function confirm() {
    if (!token || !selected) return;
    setSaving(true);
    setActionError(null);
    try {
      if (note.trim().length < 3) {
        setActionError("Scrivi il motivo: arriva al professionista.");
        return;
      }
      await apiClient.adminUnverifyProfessional(token, selected.professionalProfileId, note.trim());
      setDone(`Verifica tolta a ${selected.businessName}.`);
      setSelected(null);
      load();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <YStack gap="$4">
      <AdminPageHeader
        title="Verifica profili"
        description="La verifica è tutta automatica: documento e selfie con Didit, codice fiscale e partita IVA con VIES e Openapi. Se qualcosa non torna il professionista riceve il motivo e la rifà da solo. Qui vedi a che punto è ognuno, puoi ricontrollare i dati fiscali o togliere il badge a chi non lo merita più."
      />

      <AdminTabs
        tabs={[
          { key: "pending", label: "Non ancora verificati" },
          { key: "verified", label: "Verificati" },
        ]}
        value={filter}
        onChange={(key) => {
          setFilter(key);
          setSelected(null);
          setRows(null);
        }}
      />

      {done ? <Text color={brand.verificato}>{done}</Text> : null}

      {selected ? (
        <AdminCard highlight>
          <YStack gap="$3">
            <Text fontWeight="700" color={brand.grafite}>
              Togli la verifica a {selected.businessName}
            </Text>
            <textarea
              aria-label="Motivo"
              className="admin-input"
              rows={2}
              placeholder="Motivo (lo riceve il professionista) *"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {actionError ? <Text color={brand.urgenza}>{actionError}</Text> : null}
            <XStack gap="$2">
              <Button size="$3" disabled={saving} backgroundColor={brand.urgenza} onPress={() => void confirm()}>
                {saving ? "…" : "Togli verifica"}
              </Button>
              <Button variant="secondary" size="$3" onPress={() => setSelected(null)}>
                Annulla
              </Button>
            </XStack>
          </YStack>
        </AdminCard>
      ) : null}

      <input aria-label="Cerca profili"
        className="admin-input"
        placeholder="Cerca per nome attività, comune o email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {listError ? <Text color={brand.urgenza}>{listError}</Text> : null}
      {rows === null && !listError ? (
        <SkeletonTableRows rows={4} cols={5} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70}>{filter === "pending" ? "Tutti i professionisti sono verificati." : "Nessun profilo verificato."}</Text>
      ) : rows ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Attività</th>
                <th>Contatti</th>
                <th>Categoria e comune</th>
                <th>Dati fiscali</th>
                <th>{filter === "pending" ? "Iscritto il" : "Verificato"}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.professionalProfileId}>
                  <td>
                    <Link href={`/professionista/${row.professionalProfileId}`} target="_blank">
                      {row.businessName}
                    </Link>
                    {row.ownerName ? <div style={{ color: brand.grafite70, fontSize: 13 }}>{row.ownerName}</div> : null}
                  </td>
                  <td>
                    {row.email}
                    {row.phone ? <div style={{ color: brand.grafite70, fontSize: 13 }}>{row.phone}</div> : null}
                  </td>
                  <td>
                    {row.categoryLabel}, {row.city}
                  </td>
                  <td>
                    {row.vatNumber || row.codiceFiscale ? (
                      <>
                        {row.vatNumber ? <div>P.IVA {row.vatNumber}</div> : null}
                        {row.codiceFiscale ? <div>CF {row.codiceFiscale}</div> : null}
                      </>
                    ) : (
                      <AdminPill tone="warn">Non compilati</AdminPill>
                    )}
                    {row.hasLiabilityInsurance ? <div style={{ color: brand.grafite70, fontSize: 13 }}>RC dichiarata</div> : null}
                    <AutomaticChecks row={row} onRecheck={() => void recheck(row)} rechecking={recheckingId === row.professionalProfileId} />
                  </td>
                  <td>
                    {row.verified ? (
                      <>
                        {formatAdminDate(row.verifiedAt)}
                        {row.verifiedByName ? <div style={{ color: brand.grafite70, fontSize: 13 }}>da {row.verifiedByName}</div> : null}
                      </>
                    ) : (
                      <>
                        {formatAdminDate(row.createdAt)}
                        {row.verificationRequestedAt ? (
                          <div>
                            <AdminPill tone="ok">Ha chiesto la verifica il {formatAdminDate(row.verificationRequestedAt)}</AdminPill>
                          </div>
                        ) : null}
                        {row.verificationNote ? <div style={{ color: brand.grafite70, fontSize: 13 }}>Verifica tolta: {row.verificationNote}</div> : null}
                      </>
                    )}
                  </td>
                  <td>
                    {row.verified ? (
                      <Button variant="secondary" size="$2" onPress={() => open(row)}>
                        Togli verifica
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </YStack>
  );
}
