"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AdminUsersPage, AdminUsersQuery } from "@professionisti/api-client";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { adminRolesLabel } from "@professionisti/shared";
import { AdminPageHeader, AdminPill, downloadTextFile, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

const ROLE_LABEL = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", ADMIN: "Admin" } as const;

/**
 * Utenti con ricerca e filtri (docs/CHANGELOG.md §144): prima tre tabelle
 * complete senza ricerca, e un account eliminato sembrava attivo. Resta una
 * vera tabella HTML (si possono copiare le email, CHANGELOG §57).
 */
export default function AdminUtentiPage() {
  return (
    <Suspense fallback={null}>
      <UtentiContent />
    </Suspense>
  );
}

function UtentiContent() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState<AdminUsersQuery>({
    role: (searchParams.get("ruolo") as AdminUsersQuery["role"]) ?? undefined,
    status: (searchParams.get("stato") as AdminUsersQuery["status"]) ?? undefined,
    page: 1,
  });
  const [data, setData] = useState<AdminUsersPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setData(null);
    apiClient
      .adminListUsers(token, query)
      .then((page) => {
        setData(page);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token, query]);

  // Ricerca mentre si scrive, con una piccola attesa per non chiamare l'API a ogni tasto.
  useEffect(() => {
    const handle = setTimeout(() => setQuery((prev) => (prev.q === (q.trim() || undefined) ? prev : { ...prev, q: q.trim() || undefined, page: 1 })), 300);
    return () => clearTimeout(handle);
  }, [q]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    if (!token) return;
    setExporting(true);
    try {
      const csv = await apiClient.adminDownloadCsv(token, "users", { q: query.q, role: query.role, status: query.status });
      downloadTextFile("utenti.csv", csv);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <YStack>
      <AdminPageHeader
        title="Utenti"
        description={data ? `${data.total} risultati. Apri un utente per vedere la sua scheda.` : "Cerca per email, nome o nome dell'attività."}
        right={
          <Button variant="secondary" size="$3" disabled={exporting} onPress={exportCsv}>
            {exporting ? "Esportazione…" : "Esporta CSV"}
          </Button>
        }
      />
      <XStack gap="$2" flexWrap="wrap" marginBottom="$3">
        <input className="admin-input" style={{ flex: 1, minWidth: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca email, nome, attività…" />
        <select
          className="admin-input"
          value={query.role ?? ""}
          onChange={(e) => setQuery((prev) => ({ ...prev, role: (e.target.value || undefined) as AdminUsersQuery["role"], page: 1 }))}
        >
          <option value="">Tutti i ruoli</option>
          <option value="CLIENT">Clienti</option>
          <option value="PROFESSIONAL">Professionisti</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select
          className="admin-input"
          value={query.status ?? ""}
          onChange={(e) => setQuery((prev) => ({ ...prev, status: (e.target.value || undefined) as AdminUsersQuery["status"], page: 1 }))}
        >
          <option value="">Tutti gli stati</option>
          <option value="active">Attivi</option>
          <option value="suspended">Sospesi</option>
          <option value="deleted">Eliminati</option>
        </select>
      </XStack>

      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {data === null && !error ? (
        <SkeletonTableRows rows={6} cols={5} />
      ) : data && data.rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessun utente trovato.</Text>
      ) : data ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Nome</th>
                <th>Ruolo</th>
                <th>Attività</th>
                <th>Stato</th>
                <th>Iscritto il</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/admin/utenti/${row.id}`}>{row.email ?? "(senza email)"}</Link>
                  </td>
                  <td>{[row.name, row.surname].filter(Boolean).join(" ") || "—"}</td>
                  <td>{row.role === "ADMIN" ? `Admin · ${adminRolesLabel(row.adminRoles)}` : ROLE_LABEL[row.role]}</td>
                  <td>
                    {row.businessName && row.professionalProfileId && !row.deletedAt ? (
                      <Link href={`/professionista/${row.professionalProfileId}`} target="_blank">
                        {row.businessName}
                      </Link>
                    ) : (
                      (row.businessName ?? "—")
                    )}
                  </td>
                  <td>
                    <XStack gap={4} flexWrap="wrap">
                      {row.deletedAt ? <AdminPill>Eliminato</AdminPill> : null}
                      {row.suspendedAt ? <AdminPill tone="danger">Sospeso</AdminPill> : null}
                      {!row.suspendedAt && row.profileSuspended ? <AdminPill tone="warn">Profilo nascosto</AdminPill> : null}
                      {!row.deletedAt && !row.suspendedAt && !row.profileSuspended ? <AdminPill tone="ok">Attivo</AdminPill> : null}
                    </XStack>
                  </td>
                  <td>{formatAdminDate(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && totalPages > 1 ? (
        <XStack gap="$2" alignItems="center" marginTop="$3">
          <Button variant="secondary" size="$3" disabled={data.page <= 1} onPress={() => setQuery((prev) => ({ ...prev, page: data.page - 1 }))}>
            Precedente
          </Button>
          <Text color={brand.grafite70}>
            Pagina {data.page} di {totalPages}
          </Text>
          <Button variant="secondary" size="$3" disabled={data.page >= totalPages} onPress={() => setQuery((prev) => ({ ...prev, page: data.page + 1 }))}>
            Successiva
          </Button>
        </XStack>
      ) : null}
    </YStack>
  );
}
