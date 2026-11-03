"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ADMIN_SIGNAL_ADVICE_LEVEL_LABEL,
  ADMIN_SIGNAL_ARCHIVE_LABEL,
  ADMIN_USER_SIGNAL_LABEL,
  SUSPICIOUS_NO_ACTION_EXPIRY_DAYS,
  type AdminSuspiciousStatus,
  type AdminSuspiciousUser,
  type AdminSuspiciousUsers,
} from "@professionisti/shared";
import { Text, YStack, XStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ADVICE_TONE, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SuspiciousDismissModal } from "@/components/admin/SuspiciousDismissModal";

const ROLE_LABEL = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", ADMIN: "Amministratore" } as const;
const VIEWS: { key: string; status: AdminSuspiciousStatus; label: string }[] = [
  { key: "gestire", status: "TODO", label: "Da gestire" },
  { key: "nessuna-azione", status: "NO_ACTION", label: "Nessuna azione" },
  { key: "archiviati", status: "ARCHIVED", label: "Archiviati" },
];

/**
 * Persone → Account sospetti (docs/changelog/2026-10-30-admin-persone.md):
 * tre schede, così si vede solo il lavoro da fare (richiesta di Luca del
 * 02/11/2026). "Da gestire" ha il consiglio già scritto; "Nessuna azione"
 * esce da sola dopo 90 giorni senza novità; "Archiviati" tiene "Va bene così",
 * i casi gestiti con una misura e quelli con i segnali spariti, per 2 anni,
 * con la ricerca. Il controllo gira ogni mattina alle 7; "Controlla ora" lo
 * rifà subito. Il sito non decide niente da solo.
 */
function SuspiciousUsers() {
  const { token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = VIEWS.find((v) => v.key === searchParams.get("vista")) ?? VIEWS[0]!;
  const [data, setData] = useState<AdminSuspiciousUsers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissing, setDismissing] = useState<{ id: string; label: string } | null>(null);
  const [query, setQuery] = useState("");

  function reload() {
    if (!token) return;
    apiClient
      .adminSuspiciousUsers(token)
      .then(setData)
      .catch((err) => setError(errorMessage(err)));
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function setView(key: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (key === VIEWS[0]!.key) next.delete("vista");
    else next.set("vista", key);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }

  function reopen(user: AdminSuspiciousUser) {
    if (!token) return;
    apiClient
      .adminUndismissSuspiciousUser(token, user.id)
      .then(reload)
      .catch((err) => setError(errorMessage(err)));
  }

  const users = data?.users ?? [];
  const count = (status: AdminSuspiciousStatus) => users.filter((u) => u.status === status).length;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = users.filter((u) => u.status === view.status && words.every((w) => `${u.label} ${u.archived?.note ?? ""}`.toLowerCase().includes(w)));

  return (
    <YStack gap="4">
      <AdminPageHeader
        title="Account sospetti"
        description="Stessi dati di un altro account (telefono, indirizzo, codice fiscale, IBAN), recensioni sospette, contatti scritti in chat prima dell'accettazione, ritorni dopo un account chiuso, email usa e getta, troppi problemi sul lavoro, lavori chiusi prima dell'appuntamento, acconti del 100% da professionisti nuovi. Fuori gli account chiusi e quelli di prova."
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

      {data ? (
        <AdminTabs tabs={VIEWS.map((v) => ({ key: v.key, label: `${v.label} (${count(v.status)})` }))} value={view.key} onChange={setView} />
      ) : null}

      {data && view.status === "TODO" ? (
        shown.length > 0 ? (
          <section className="admin-signals" aria-label="Cosa fare">
            <Text render="h3" margin={0} fontWeight="800" fontSize="5" color={brand.grafite}>
              Cosa fare
            </Text>
            <ul className="admin-advice-list">
              {shown.map((user) => (
                <li key={user.id}>
                  <XStack gap="2" alignItems="center" flexWrap="wrap">
                    <AdminPill tone={ADVICE_TONE[user.advice.level]}>{ADMIN_SIGNAL_ADVICE_LEVEL_LABEL[user.advice.level]}</AdminPill>
                    <Link href={`/admin/utenti/${user.id}?scheda=${user.advice.tab}`}>{user.label}</Link>
                    <Text fontSize={13} color={brand.grafite70}>
                      {ROLE_LABEL[user.role]} · trovato il {formatAdminDate(user.firstSeenAt)}
                    </Text>
                  </XStack>
                  <Text color={brand.grafite}>{user.advice.text}</Text>
                  <SignalList user={user} />
                  <XStack>
                    <button type="button" className="admin-chip-button" onClick={() => setDismissing({ id: user.id, label: user.label })} aria-label={`Va bene così: ${user.label}`}>
                      Va bene così
                    </button>
                  </XStack>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <Text color={brand.grafite70}>Niente da gestire: tutto in ordine.</Text>
        )
      ) : null}

      {data && view.status === "NO_ACTION" ? (
        <>
          <Text fontSize={13} color={brand.grafite70}>
            Segnali che da soli non chiedono niente (es. la stessa famiglia). Escono da soli dopo {SUSPICIOUS_NO_ACTION_EXPIRY_DAYS} giorni senza novità; con un segnale nuovo passano in &quot;Da gestire&quot;.
          </Text>
          {shown.length === 0 ? <Text color={brand.grafite70}>Nessun account.</Text> : <UsersTable users={shown} />}
        </>
      ) : null}

      {data && view.status === "ARCHIVED" ? (
        <>
          <Text fontSize={13} color={brand.grafite70}>
            &quot;Va bene così&quot;, casi gestiti con una misura, segnali spariti e &quot;Nessuna azione&quot; senza novità. Si tengono 2 anni per i precedenti; con un segnale nuovo tornano in &quot;Da gestire&quot;.
          </Text>
          <label className="admin-field">
            <span>Cerca negli archiviati</span>
            <input className="admin-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome o motivo" />
          </label>
          {shown.length === 0 ? <Text color={brand.grafite70}>{query ? "Nessun archiviato con questa ricerca." : "Nessun account archiviato."}</Text> : <UsersTable users={shown} onReopen={reopen} />}
        </>
      ) : null}

      {dismissing && token ? (
        <SuspiciousDismissModal
          userId={dismissing.id}
          label={dismissing.label}
          token={token}
          onClose={() => setDismissing(null)}
          onDone={() => {
            setDismissing(null);
            reload();
          }}
        />
      ) : null}
    </YStack>
  );
}

function SignalList({ user }: { user: AdminSuspiciousUser }) {
  return (
    <ul className="admin-signal-list">
      {user.signals.map((signal, index) => (
        <li key={`${signal.kind}-${index}`}>
          {ADMIN_USER_SIGNAL_LABEL[signal.kind]}: {signal.detail}
        </li>
      ))}
    </ul>
  );
}

function UsersTable({ users, onReopen }: { users: AdminSuspiciousUser[]; onReopen?: (user: AdminSuspiciousUser) => void }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Persona</th>
            <th>{onReopen ? "Archiviato" : "Perché"}</th>
            <th>Segnali</th>
            {onReopen ? <th>Azioni</th> : null}
          </tr>
        </thead>
        <tbody>
          {users.map((row) => (
            <tr key={row.id}>
              <td className="admin-cell-main">
                <Link href={`/admin/utenti/${row.id}`}>{row.label}</Link>
                <small className="admin-cell-note">
                  {ROLE_LABEL[row.role]} · trovato il {formatAdminDate(row.firstSeenAt)}
                </small>
              </td>
              <td>
                {row.archived ? (
                  <>
                    <AdminPill tone="ok">{ADMIN_SIGNAL_ARCHIVE_LABEL[row.archived.reason]}</AdminPill>
                    <small className="admin-cell-note">
                      {[row.archived.by, formatAdminDate(row.archived.at)].filter(Boolean).join(", ")}
                      {row.archived.note ? `: ${row.archived.note}` : ""}
                    </small>
                  </>
                ) : (
                  <>
                    <AdminPill tone={ADVICE_TONE[row.advice.level]}>{ADMIN_SIGNAL_ADVICE_LEVEL_LABEL[row.advice.level]}</AdminPill>
                    <small className="admin-cell-note">{row.advice.text}</small>
                  </>
                )}
              </td>
              <td>
                <SignalList user={row} />
              </td>
              {onReopen ? (
                <td>
                  <button type="button" className="admin-chip-button" onClick={() => onReopen(row)} aria-label={`Riapri: ${row.label}`}>
                    Riapri
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminSuspiciousUsersPage() {
  return (
    <Suspense fallback={null}>
      <SuspiciousUsers />
    </Suspense>
  );
}
