"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_SIGNAL_ADVICE_LEVEL_LABEL, ADMIN_USER_SIGNAL_LABEL, type AdminSuspiciousUsers } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ADVICE_TONE, AdminPageHeader, AdminPill, errorMessage, formatAdminDate } from "@/components/admin/adminUi";

const ROLE_LABEL = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", ADMIN: "Amministratore" } as const;

/**
 * Persone → Account sospetti (docs/changelog/2026-10-30-admin-persone.md):
 * in cima cosa conviene fare, già deciso dai segnali, così non serve aprire
 * ogni scheda; sotto tutti gli account con almeno un segnale. Il controllo
 * gira ogni mattina alle 7; "Controlla ora" lo rifà subito. Il sito non
 * decide niente da solo.
 */
export default function AdminSuspiciousUsersPage() {
  const { token } = useAuth();
  const [data, setData] = useState<AdminSuspiciousUsers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiClient
      .adminSuspiciousUsers(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }, [token]);

  const checkNow = async () => {
    if (!token) return;
    setChecking(true);
    setError(null);
    try {
      setData(await apiClient.adminCheckSuspiciousUsers(token));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const todo = data?.users.filter((u) => u.advice.level !== "BASSA") ?? [];

  return (
    <YStack gap="$4">
      <AdminPageHeader
        title="Account sospetti"
        description="Stesso telefono, indirizzo o codice fiscale di un altro account, recensioni tra account con gli stessi dati o scritte subito dopo l'iscrizione, lavori chiusi prima dell'appuntamento, acconti del 100% da professionisti nuovi. Fuori gli account chiusi e quelli di prova."
        right={
          <button type="button" className="admin-link-button is-primary" onClick={checkNow} disabled={checking || !token} aria-busy={checking}>
            {checking ? "Controllo in corso…" : "Controlla ora"}
          </button>
        }
      />
      {data ? (
        <Text fontSize={13} color={brand.grafite70}>
          {data.checkedAt ? `Ultimo controllo: ${formatAdminDate(data.checkedAt, true)}. Si rifà da solo ogni mattina alle 7.` : "Il controllo non è ancora stato fatto: parte da solo ogni mattina alle 7."}
        </Text>
      ) : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}

      {todo.length > 0 ? (
        <section className="admin-signals" aria-label="Cosa fare">
          <Text tag="h3" margin={0} fontWeight="800" fontSize="$5" color={brand.grafite}>
            Cosa fare
          </Text>
          <ul className="admin-advice-list">
            {todo.map((user) => (
              <li key={user.id}>
                <XStack gap="$2" alignItems="center" flexWrap="wrap">
                  <AdminPill tone={ADVICE_TONE[user.advice.level]}>{ADMIN_SIGNAL_ADVICE_LEVEL_LABEL[user.advice.level]}</AdminPill>
                  <Link href={`/admin/utenti/${user.id}?scheda=${user.advice.tab}`}>{user.label}</Link>
                </XStack>
                <Text color={brand.grafite}>{user.advice.text}</Text>
              </li>
            ))}
          </ul>
        </section>
      ) : data && data.users.length > 0 ? (
        <Text color={brand.grafite70}>Niente da fare: i segnali di oggi non chiedono nessuna azione.</Text>
      ) : null}

      {data && data.users.length === 0 ? <Text color={brand.grafite70}>Nessun account con segnali da controllare.</Text> : null}
      {data && data.users.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Persona</th>
                <th>Cosa fare</th>
                <th>Segnali</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((row) => (
                <tr key={row.id}>
                  <td className="admin-cell-main">
                    <Link href={`/admin/utenti/${row.id}`}>{row.label}</Link>
                    <small className="admin-cell-note">
                      {ROLE_LABEL[row.role]} · trovato il {formatAdminDate(row.firstSeenAt)}
                    </small>
                  </td>
                  <td>
                    <AdminPill tone={ADVICE_TONE[row.advice.level]}>{ADMIN_SIGNAL_ADVICE_LEVEL_LABEL[row.advice.level]}</AdminPill>
                    <small className="admin-cell-note">{row.advice.text}</small>
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
    </YStack>
  );
}
