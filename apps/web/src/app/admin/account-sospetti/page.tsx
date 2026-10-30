"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_USER_SIGNAL_LABEL, type AdminSuspiciousUser } from "@professionisti/shared";
import { Text, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminPageHeader, errorMessage } from "@/components/admin/adminUi";

const ROLE_LABEL = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", ADMIN: "Amministratore" } as const;

/**
 * Persone → Account sospetti (docs/changelog/2026-10-30-admin-persone.md):
 * chi ha almeno un segnale da controllare, prima chi ne ha di più. Il sito
 * non decide niente da solo: si apre la scheda e si guarda.
 */
export default function AdminSuspiciousUsersPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AdminSuspiciousUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminSuspiciousUsers(token)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  return (
    <>
      <AdminPageHeader
        title="Account sospetti"
        description="Stesso telefono, indirizzo o codice fiscale di un altro account, recensioni scritte subito dopo l'iscrizione, lavori chiusi prima dell'appuntamento, acconti del 100% da professionisti nuovi. Fuori gli account chiusi e quelli di prova."
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows && rows.length === 0 ? <Text color={brand.grafite70}>Nessun account con segnali da controllare.</Text> : null}
      {rows && rows.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Da controllare</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="admin-cell-main">
                    <Link href={`/admin/utenti/${row.id}`}>{row.label}</Link>
                    <small className="admin-cell-note">{ROLE_LABEL[row.role]}</small>
                  </td>
                  <td>
                    <ul className="admin-signal-list">
                      {row.signals.map((signal, index) => (
                        <li key={`${signal.kind}-${index}`}>
                          {ADMIN_USER_SIGNAL_LABEL[signal.kind]}: {signal.detail}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}
