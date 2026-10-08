"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ProfessionalVerificationFilter, ProfessionalVerificationRow } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

/**
 * Verifica manuale dei professionisti (docs/CHANGELOG.md §200): l'admin
 * controlla fuori dal sito un documento d'identità e la partita IVA (o il
 * codice fiscale) e qui assegna il badge "Verificato". Nessun documento
 * viene caricato o conservato sul sito.
 */
export default function AdminVerifichePage() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<ProfessionalVerificationFilter>("pending");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ProfessionalVerificationRow[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // Riga su cui si sta agendo: il pannello di conferma compare sopra l'elenco.
  const [selected, setSelected] = useState<ProfessionalVerificationRow | null>(null);
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

  function open(row: ProfessionalVerificationRow) {
    setSelected(row);
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
      if (selected.verified) {
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
        description="Controlla un documento d'identità e la partita IVA (o il codice fiscale, per chi non ha partita IVA) in videochiamata o per email, poi assegna il badge Verificato. Sul sito non si carica nessun documento."
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
              {selected.verified ? `Togli la verifica a ${selected.businessName}` : `Verifica ${selected.businessName}`}
            </Text>
            {selected.verified ? null : (
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
            <textarea aria-label={selected.verified ? "Motivo" : "Nota interna"}
              className="admin-input"
              rows={2}
              placeholder={selected.verified ? "Motivo (lo riceve il professionista) *" : "Nota interna (facoltativa, es. come hai fatto il controllo)"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {actionError ? <Text color={brand.urgenza}>{actionError}</Text> : null}
            <XStack gap="$2">
              <Button size="$3" disabled={saving} backgroundColor={selected.verified ? brand.urgenza : undefined} onPress={() => void confirm()}>
                {saving ? "…" : selected.verified ? "Togli verifica" : "Segna come verificato"}
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
                    <Button variant="secondary" size="$2" onPress={() => open(row)}>
                      {row.verified ? "Togli verifica" : "Verifica"}
                    </Button>
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
