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
type Action = "verify" | "unverify" | "decline";

const IDENTITY_LABEL: Record<NonNullable<Row["identity"]>["status"], { text: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  STARTED: { text: "Documento e selfie: iniziata", tone: "neutral" },
  PROCESSING: { text: "Documento e selfie: in attesa di esito", tone: "neutral" },
  APPROVED: { text: "Documento e selfie: approvata", tone: "ok" },
  NEEDS_REVIEW: { text: "Documento e selfie: caso dubbio", tone: "warn" },
  DECLINED: { text: "Documento e selfie: rifiutata", tone: "danger" },
  EXPIRED: { text: "Documento e selfie: scaduta", tone: "neutral" },
};

const TAX_TONE: Record<Row["taxIdChecks"][number]["status"], "ok" | "warn" | "danger" | "neutral"> = {
  VALID: "ok",
  REVIEW: "warn",
  INVALID: "danger",
  PENDING: "neutral",
};

const TAX_TEXT: Record<Row["taxIdChecks"][number]["status"], string> = {
  VALID: "confermato",
  REVIEW: "da controllare",
  INVALID: "non valido",
  PENDING: "in controllo",
};

/** Esiti dei controlli automatici: documento e selfie (Didit) e Agenzia delle Entrate (Openapi). */
function AutomaticChecks({ row }: { row: Row }) {
  if (!row.identity && row.taxIdChecks.length === 0) return null;
  const identity = row.identity ? IDENTITY_LABEL[row.identity.status] : null;
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
 * Verifica dei professionisti (docs/CHANGELOG.md §200, §243): documento e
 * selfie li controlla Didit in automatico e il badge arriva da solo. Qui
 * l'admin guarda solo i casi dubbi (nome o data che non tornano, partita IVA
 * non trovata nel registro), confermandoli o rifiutandoli, e può togliere il
 * badge. Nessun documento viene caricato o conservato sul sito.
 */
export default function AdminVerifichePage() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<ProfessionalVerificationFilter>("pending");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ProfessionalVerificationRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // Riga su cui si sta agendo: il pannello di conferma compare sopra l'elenco.
  const [selected, setSelected] = useState<Row | null>(null);
  const [action, setAction] = useState<Action>("verify");
  const [identityChecked, setIdentityChecked] = useState(false);
  const [taxIdChecked, setTaxIdChecked] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  function open(row: Row, nextAction: Action) {
    setSelected(row);
    setAction(nextAction);
    setIdentityChecked(false);
    setTaxIdChecked(false);
    setNote("");
    setActionError(null);
    setDone(null);
  }

  async function confirm() {
    if (!token || !selected) return;
    setSaving(true);
    setActionError(null);
    try {
      if (action === "decline") {
        if (note.trim().length < 3) {
          setActionError("Scrivi cosa deve correggere: arriva al professionista.");
          return;
        }
        await apiClient.adminDeclineIdentityVerification(token, selected.professionalProfileId, note.trim());
        setDone(`Verifica d'identità di ${selected.businessName} rifiutata: gli abbiamo scritto il motivo.`);
      } else if (action === "unverify") {
        if (note.trim().length < 3) {
          setActionError("Scrivi il motivo: arriva al professionista.");
          return;
        }
        await apiClient.adminUnverifyProfessional(token, selected.professionalProfileId, note.trim());
        setDone(`Verifica tolta a ${selected.businessName}.`);
      } else {
        if (!identityChecked || !taxIdChecked) {
          setActionError("Spunta entrambi i controlli prima di verificare.");
          return;
        }
        await apiClient.adminVerifyProfessional(token, selected.professionalProfileId, {
          identityChecked: true,
          taxIdChecked: true,
          note: note.trim() || undefined,
        });
        setDone(`${selected.businessName} ora ha il badge Verificato.`);
      }
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
        description="Documento e selfie li controlla Didit: se tutto torna il badge Verificato arriva da solo. Qui trovi in cima i casi dubbi (nome o data che non coincidono, partita IVA non trovata): guarda la sessione nella console Didit, poi conferma o rifiuta. Sul sito non si carica nessun documento."
      />

      <AdminTabs
        tabs={[
          { key: "pending", label: "Da verificare" },
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
              {action === "unverify"
                ? `Togli la verifica a ${selected.businessName}`
                : action === "decline"
                  ? `Rifiuta la verifica d'identità di ${selected.businessName}`
                  : `Verifica ${selected.businessName}`}
            </Text>
            <AutomaticChecks row={selected} />
            {action !== "verify" ? null : (
              <YStack gap="$2">
                <Text fontSize={14} color={brand.grafite70}>
                  Titolare: {selected.ownerName || "non indicato"} · Partita IVA: {selected.vatNumber ?? "non inserita"} · Codice fiscale:{" "}
                  {selected.codiceFiscale ?? "non inserito"}
                </Text>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={identityChecked} onChange={(e) => setIdentityChecked(e.target.checked)} />
                  <Text fontSize={14}>Ho controllato un documento d&apos;identità valido del titolare</Text>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={taxIdChecked} onChange={(e) => setTaxIdChecked(e.target.checked)} />
                  <Text fontSize={14}>Ho controllato la partita IVA (o il codice fiscale) e corrisponde al titolare</Text>
                </label>
              </YStack>
            )}
            <textarea aria-label={action === "verify" ? "Nota interna" : "Motivo"}
              className="admin-input"
              rows={2}
              placeholder={
                action === "verify"
                  ? "Nota interna (facoltativa, es. come hai fatto il controllo)"
                  : action === "decline"
                    ? "Cosa deve correggere (lo riceve il professionista, es. \"il nome sul documento non è quello dei dati fiscali\") *"
                    : "Motivo (lo riceve il professionista) *"
              }
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {actionError ? <Text color={brand.urgenza}>{actionError}</Text> : null}
            <XStack gap="$2">
              <Button size="$3" disabled={saving} backgroundColor={action === "verify" ? undefined : brand.urgenza} onPress={() => void confirm()}>
                {saving ? "…" : action === "unverify" ? "Togli verifica" : action === "decline" ? "Rifiuta e avvisa" : "Segna come verificato"}
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
        <Text color={brand.grafite70}>{filter === "pending" ? "Nessun profilo da verificare." : "Nessun profilo verificato."}</Text>
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
                    <AutomaticChecks row={row} />
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
                    <XStack gap="$1.5" flexWrap="wrap">
                      <Button variant="secondary" size="$2" onPress={() => open(row, row.verified ? "unverify" : "verify")}>
                        {row.verified ? "Togli verifica" : "Verifica"}
                      </Button>
                      {!row.verified && row.identity?.status === "NEEDS_REVIEW" ? (
                        <Button variant="secondary" size="$2" onPress={() => open(row, "decline")}>
                          Rifiuta
                        </Button>
                      ) : null}
                    </XStack>
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
