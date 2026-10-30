"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatEurCents, type AdminCourtesyDocumentRow } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, AdminPill, downloadBlobFile, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

type Query = { q: string; year: number | null; bookingId: string | null };

const FIRST_YEAR = 2026;

/**
 * Documenti ai clienti (docs/CHANGELOG.md §380): ricevute per prestazione
 * occasionale (col numero dato da noi) preparate dai professionisti. Serve all'assistenza e ai problemi
 * segnalati: chi l'ha dato, a chi, con che importo. `?lavoro=` arriva da
 * "Lavori terminati" e "Problemi segnalati".
 */
export default function AdminDocumentiClientiPage() {
  return (
    <Suspense fallback={null}>
      <DocumentiClientiContent />
    </Suspense>
  );
}

function DocumentiClientiContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState<Query>({ q: "", year: null, bookingId: searchParams.get("lavoro") });
  // Righe insieme alla ricerca da cui arrivano: a ogni ricerca nuova si torna allo scheletro.
  const [loaded, setLoaded] = useState<{ query: Query; rows: AdminCourtesyDocumentRow[] } | null>(null);
  const rows = loaded?.query === query ? loaded.rows : null;
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const years = Array.from({ length: new Date().getFullYear() - FIRST_YEAR + 1 }, (_, i) => new Date().getFullYear() - i);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminCourtesyDocuments(token, { q: query.q, year: query.year ?? undefined, bookingId: query.bookingId ?? undefined })
      .then((list) => {
        setLoaded({ query, rows: list });
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token, query]);

  // Ricerca mentre si scrive, con una piccola attesa per non chiamare l'API a ogni tasto.
  useEffect(() => {
    const handle = setTimeout(() => setQuery((prev) => (prev.q === q.trim() ? prev : { ...prev, q: q.trim() })), 300);
    return () => clearTimeout(handle);
  }, [q]);

  async function openPdf(row: AdminCourtesyDocumentRow) {
    if (!token) return;
    setOpening(row.bookingId);
    setError(null);
    try {
      const fileName = `${row.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
      downloadBlobFile(fileName, await apiClient.adminCourtesyDocumentPdf(token, row.bookingId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  return (
    <YStack>
      <AdminPageHeader
        title="Documenti ai clienti"
        description="Ricevute per prestazione occasionale che i professionisti hanno preparato per i clienti. Ogni PDF che apri resta nel registro azioni."
      />
      <XStack gap="$2" flexWrap="wrap" marginBottom="$3">
        <input
          aria-label="Cerca documenti"
          className="admin-input"
          style={{ flex: 1, minWidth: 220 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Numero (es. 4/2026), professionista o cliente"
        />
        <select
          aria-label="Anno"
          className="admin-input"
          value={query.year ?? ""}
          onChange={(e) => setQuery((prev) => ({ ...prev, year: e.target.value ? Number(e.target.value) : null }))}
        >
          <option value="">Tutti gli anni</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </XStack>
      {query.bookingId ? (
        <XStack gap="$2" alignItems="center" marginBottom="$3" flexWrap="wrap">
          <AdminPill>Solo il lavoro scelto</AdminPill>
          <Text fontSize={14} fontWeight="700" color={brand.cianografiaScuro} cursor="pointer" accessibilityRole="button" onPress={() => setQuery((prev) => ({ ...prev, bookingId: null }))}>
            Mostra tutti
          </Text>
        </XStack>
      ) : null}
      {error ? (
        <Text color={brand.urgenza} role="alert" marginBottom="$3">
          {error}
        </Text>
      ) : null}
      {rows === null && !error ? (
        <SkeletonTableRows rows={4} cols={5} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessun documento trovato.</Text>
      ) : rows ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Professionista</th>
                <th>Cliente</th>
                <th>Lavoro</th>
                <th>Importo</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const changed = row.pdfTotalEurCents !== null && row.pdfTotalEurCents !== row.totalEurCents;
                return (
                  <tr key={row.bookingId}>
                    <td>
                      <strong>{row.label}</strong>
                      <br />
                      <small>Preparato il {formatAdminDate(row.createdAt)}</small>
                      {row.invoiceRequested ? (
                        <YStack paddingTop={4}>
                          <AdminPill>Fattura chiesta dal cliente</AdminPill>
                        </YStack>
                      ) : null}
                    </td>
                    <td>
                      <Link href={`/admin/utenti/${row.professional.userId}`}>{row.professional.businessName}</Link>
                    </td>
                    <td>{row.client.accountDeleted ? "Account eliminato" : <Link href={`/admin/utenti/${row.client.userId}`}>{row.client.name ?? "Cliente"}</Link>}</td>
                    <td>
                      {[row.categoryLabel ?? "Prenotazione dall'agenda", row.city].filter(Boolean).join(" · ")}
                      <br />
                      <small>Appuntamento del {formatAdminDate(row.scheduledAt)}</small>
                      {row.guidedRequestId ? (
                        <>
                          <br />
                          <Link href={`/admin/chat/${row.guidedRequestId}/${row.professional.profileId}`}>
                            <small>Leggi la chat</small>
                          </Link>
                        </>
                      ) : null}
                      {row.bookingCanceled ? (
                        <YStack paddingTop={4}>
                          <AdminPill tone="warn">Lavoro annullato</AdminPill>
                        </YStack>
                      ) : null}
                    </td>
                    <td>
                      {row.totalEurCents !== null ? formatEurCents(row.totalEurCents) : "—"}
                      {changed ? (
                        <YStack paddingTop={4}>
                          <AdminPill tone="warn">Sul PDF scaricato {formatEurCents(row.pdfTotalEurCents ?? 0)}</AdminPill>
                        </YStack>
                      ) : null}
                    </td>
                    <td>
                      <YStack gap="$2" alignItems="flex-start">
                        <small>{row.pdfDownloadedAt ? `Scaricato il ${formatAdminDate(row.pdfDownloadedAt)}` : "Non ancora scaricato"}</small>
                        <Button size="$3" variant="secondary" disabled={opening === row.bookingId} onPress={() => void openPdf(row)}>
                          {opening === row.bookingId ? "Preparo il PDF…" : "Apri PDF"}
                        </Button>
                      </YStack>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </YStack>
  );
}
