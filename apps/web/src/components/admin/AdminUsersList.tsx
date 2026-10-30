"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  AdminUsersPage,
  AdminUsersQuery,
} from "@professionisti/api-client";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import {
  PROFESSIONAL_CATEGORIES,
  PROFESSIONAL_STATUS_ONE_LABEL,
  adminCan,
  adminRolesLabel,
} from "@professionisti/shared";
import {
  AdminPageHeader,
  AdminPill,
  downloadTextFile,
  errorMessage,
  formatAdminDate,
} from "./adminUi";
import { SkeletonTableRows } from "@/components/Skeleton";

const ROLE_LABEL = {
  CLIENT: "Cliente",
  PROFESSIONAL: "Professionista",
  ADMIN: "Admin",
} as const;

/**
 * Elenco utenti con ricerca e filtri (docs/CHANGELOG.md §144): prima tre
 * tabelle complete senza ricerca, e un account eliminato sembrava attivo.
 * Resta una vera tabella HTML (si possono copiare le email, CHANGELOG §57).
 * Con `preset` è la stessa tabella per Amministratori e Account di prova
 * (docs/changelog/2026-10-30-admin-riordino.md).
 */
export function AdminUsersList({
  preset,
  title = "Utenti",
  intro,
}: {
  preset?: Pick<AdminUsersQuery, "role" | "status">;
  title?: string;
  intro?: string;
}) {
  const { token, user } = useAuth();
  const isSuper = adminCan(user?.adminRoles ?? [], "SUPER");
  const searchParams = useSearchParams();
  // `?q=` arriva dai consigli di Andamento del sito (§372): apre già la ricerca.
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [query, setQuery] = useState<AdminUsersQuery>({
    q: searchParams.get("q")?.trim() || undefined,
    role:
      preset?.role ??
      (searchParams.get("ruolo") as AdminUsersQuery["role"]) ??
      undefined,
    status:
      preset?.status ??
      (searchParams.get("stato") as AdminUsersQuery["status"]) ??
      undefined,
    category: searchParams.get("categoria") ?? undefined,
    city: searchParams.get("citta") ?? undefined,
    page: 1,
  });
  // Categoria e città solo per i professionisti (docs/CHANGELOG.md §368).
  const professionalFilters =
    query.role === "PROFESSIONAL" || Boolean(query.category || query.city);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!token || !professionalFilters || cityOptions.length) return;
    apiClient
      .adminProfessionalStats(token)
      .then((stats) => setCityOptions(stats.cityOptions))
      .catch(() => setCityOptions([]));
  }, [token, professionalFilters, cityOptions.length]);
  const [error, setError] = useState<string | null>(null);
  // Risultati insieme alla ricerca da cui arrivano: a ogni ricerca nuova si
  // torna allo scheletro finché non arrivano quelli nuovi.
  const [loaded, setLoaded] = useState<{
    query: AdminUsersQuery;
    data: AdminUsersPage;
  } | null>(null);
  const data = loaded?.query === query ? loaded.data : null;

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminListUsers(token, query)
      .then((page) => {
        setLoaded({ query, data: page });
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [token, query]);

  // Ricerca mentre si scrive, con una piccola attesa per non chiamare l'API a ogni tasto.
  useEffect(() => {
    const handle = setTimeout(
      () =>
        setQuery((prev) =>
          prev.q === (q.trim() || undefined)
            ? prev
            : { ...prev, q: q.trim() || undefined, page: 1 },
        ),
      300,
    );
    return () => clearTimeout(handle);
  }, [q]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  // "Di prova" riga per riga (richiesta di Luca, docs/CHANGELOG.md §395): la
  // casella cambia subito e torna com'era se il server dice di no.
  const [savingTestId, setSavingTestId] = useState<string | null>(null);
  async function toggleTestAccount(id: string, testAccount: boolean) {
    if (!token || !loaded) return;
    const setRow = (testAccountAt: string | null) =>
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              data: {
                ...prev.data,
                rows: prev.data.rows.map((r) =>
                  r.id === id ? { ...r, testAccountAt } : r,
                ),
              },
            }
          : prev,
      );
    const before =
      loaded.data.rows.find((r) => r.id === id)?.testAccountAt ?? null;
    setSavingTestId(id);
    setRow(testAccount ? new Date().toISOString() : null);
    try {
      const result = await apiClient.adminSetTestAccount(
        token,
        id,
        testAccount,
      );
      setRow(result.testAccountAt);
      setError(null);
    } catch (err) {
      setRow(before);
      setError(errorMessage(err));
    } finally {
      setSavingTestId(null);
    }
  }
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    if (!token) return;
    setExporting(true);
    try {
      const csv = await apiClient.adminDownloadCsv(token, "users", {
        q: query.q,
        role: query.role,
        status: query.status,
        category: query.category,
        city: query.city,
      });
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
        title={title}
        description={[
          intro,
          data
            ? `${data.total} ${data.total === 1 ? "risultato" : "risultati"}. Apri un utente per vedere la sua scheda.`
            : "Cerca per email, nome o nome dell'attività.",
        ]
          .filter(Boolean)
          .join(" ")}
        right={
          <Button
            variant="secondary"
            size="$3"
            disabled={exporting}
            onPress={exportCsv}
          >
            {exporting ? "Esportazione…" : "Esporta CSV"}
          </Button>
        }
      />
      <XStack gap="$2" flexWrap="wrap" marginBottom="$3">
        <input
          aria-label="Cerca utenti"
          className="admin-input"
          style={{ flex: 1, minWidth: 220 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nome e cognome, email o attività"
        />
        {preset?.role ? null : (
          <select
            aria-label="Ruolo"
            className="admin-input"
            value={query.role ?? ""}
            onChange={(e) => {
              const role = (e.target.value ||
                undefined) as AdminUsersQuery["role"];
              // Categoria e città restano solo sui professionisti.
              setQuery((prev) => ({
                ...prev,
                role,
                ...(role === "PROFESSIONAL"
                  ? {}
                  : { category: undefined, city: undefined }),
                page: 1,
              }));
            }}
          >
            <option value="">Tutti i ruoli</option>
            <option value="CLIENT">Clienti</option>
            <option value="PROFESSIONAL">Professionisti</option>
            <option value="ADMIN">Admin</option>
          </select>
        )}
        {preset?.status ? null : (
          <select
            aria-label="Stato"
            className="admin-input"
            value={query.status ?? ""}
            onChange={(e) =>
              setQuery((prev) => ({
                ...prev,
                status: (e.target.value ||
                  undefined) as AdminUsersQuery["status"],
                page: 1,
              }))
            }
          >
            <option value="">Tutti gli stati</option>
            <option value="active">Attivi</option>
            <option value="suspended">Sospesi</option>
            <option value="deleted">Eliminati</option>
            <option value="test">Account di prova</option>
          </select>
        )}
        {professionalFilters ? (
          <>
            <select
              aria-label="Categoria"
              className="admin-input"
              value={query.category ?? ""}
              onChange={(e) =>
                setQuery((prev) => ({
                  ...prev,
                  category: e.target.value || undefined,
                  page: 1,
                }))
              }
            >
              <option value="">Tutte le categorie</option>
              {PROFESSIONAL_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Città"
              className="admin-input"
              value={query.city ?? ""}
              onChange={(e) =>
                setQuery((prev) => ({
                  ...prev,
                  city: e.target.value || undefined,
                  page: 1,
                }))
              }
            >
              <option value="">Tutte le città</option>
              {[
                ...new Set([
                  ...(query.city ? [query.city] : []),
                  ...cityOptions,
                ]),
              ].map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </XStack>
      {query.role === "PROFESSIONAL" ? (
        <Link
          href={`/admin/numeri-professionisti${query.category || query.city ? `?${new URLSearchParams({ ...(query.category ? { categoria: query.category } : {}), ...(query.city ? { citta: query.city } : {}) })}` : ""}`}
          style={{ marginBottom: 12, alignSelf: "flex-start" }}
        >
          Vedi i numeri e le percentuali
        </Link>
      ) : null}

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
                {isSuper ? <th>Di prova</th> : null}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/admin/utenti/${row.id}`}>
                      {/* L'email di un account chiuso è cancellata: lo si ritrova con l'email esatta (docs/changelog/2026-10-30-admin-persone.md). */}
                      {row.deletedAt
                        ? "Account chiuso"
                        : (row.email ?? "(senza email)")}
                    </Link>
                  </td>
                  <td className="admin-cell-main">
                    {[row.name, row.surname].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td>
                    {row.role === "ADMIN"
                      ? `Admin · ${adminRolesLabel(row.adminRoles)}`
                      : ROLE_LABEL[row.role]}
                  </td>
                  <td>
                    {row.businessName &&
                    row.professionalProfileId &&
                    !row.deletedAt ? (
                      <Link
                        href={`/professionista/${row.professionalProfileId}`}
                        target="_blank"
                      >
                        {row.businessName}
                      </Link>
                    ) : (
                      (row.businessName ?? "—")
                    )}
                  </td>
                  <td>
                    <XStack gap={4} flexWrap="wrap">
                      {row.deletedAt ? (
                        <AdminPill>
                          Chiuso il {formatAdminDate(row.deletedAt)}
                        </AdminPill>
                      ) : null}
                      {row.suspendedAt ? (
                        <AdminPill tone="danger">Sospeso</AdminPill>
                      ) : null}
                      {!row.deletedAt &&
                      !row.suspendedAt &&
                      row.searchStatus &&
                      row.searchStatus !== "VISIBLE" ? (
                        <AdminPill tone="warn">
                          {PROFESSIONAL_STATUS_ONE_LABEL[row.searchStatus]}
                        </AdminPill>
                      ) : null}
                      {!row.deletedAt &&
                      !row.suspendedAt &&
                      (!row.searchStatus || row.searchStatus === "VISIBLE") ? (
                        <AdminPill tone="ok">Attivo</AdminPill>
                      ) : null}
                      {row.testAccountAt && !isSuper ? (
                        <AdminPill tone="warn">Di prova</AdminPill>
                      ) : null}
                    </XStack>
                  </td>
                  <td>{formatAdminDate(row.createdAt)}</td>
                  {isSuper ? (
                    <td>
                      {row.role !== "ADMIN" && !row.deletedAt ? (
                        <label className="admin-test-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(row.testAccountAt)}
                            disabled={savingTestId === row.id}
                            onChange={(e) =>
                              toggleTestAccount(row.id, e.target.checked)
                            }
                            aria-label={`Account di prova: ${row.email ?? [row.name, row.surname].filter(Boolean).join(" ")}`}
                          />
                          <span aria-hidden="true">Di prova</span>
                        </label>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {data && totalPages > 1 ? (
        <XStack gap="$2" alignItems="center" marginTop="$3">
          <Button
            variant="secondary"
            size="$3"
            disabled={data.page <= 1}
            onPress={() =>
              setQuery((prev) => ({ ...prev, page: data.page - 1 }))
            }
          >
            Precedente
          </Button>
          <Text color={brand.grafite70}>
            Pagina {data.page} di {totalPages}
          </Text>
          <Button
            variant="secondary"
            size="$3"
            disabled={data.page >= totalPages}
            onPress={() =>
              setQuery((prev) => ({ ...prev, page: data.page + 1 }))
            }
          >
            Successiva
          </Button>
        </XStack>
      ) : null}
    </YStack>
  );
}
