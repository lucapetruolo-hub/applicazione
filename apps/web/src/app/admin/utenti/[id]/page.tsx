"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { AdminRoleName, AdminUserDetail } from "@professionisti/api-client";
import { ADMIN_ROLE_DESCRIPTION, ADMIN_ROLE_LABEL, CONTENT_REPORT_TARGET_LABEL, adminCan, adminRolesLabel, moderationActionAdminLabel } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { SkeletonSummaryRow } from "@/components/Skeleton";

const ROLE_LABEL = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", ADMIN: "Amministratore" } as const;
const KIND_ICON: Record<string, string> = { account: "👤", request: "📝", booking: "📅", review: "⭐", report: "🚩", admin: "🛡️" };

/**
 * Scheda utente (docs/CHANGELOG.md §145), come la pagina cliente di Stripe
 * o Shopify: stato, numeri, segnalazioni fatte e ricevute, cronologia, e
 * le azioni sospendi/riattiva (moderatori) e ruolo admin (super admin).
 */
export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const { user: me, token } = useAuth();
  const myRoles = me?.adminRoles ?? [];
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!token) return;
    apiClient
      .adminGetUser(token, params.id)
      .then((d) => {
        setDetail(d);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, params.id]);

  if (error && !detail) return <Text color={brand.urgenza}>{error}</Text>;
  if (!detail) {
    return (
      <YStack backgroundColor={brand.calce} borderRadius={20} overflow="hidden">
        <SkeletonSummaryRow />
        <SkeletonSummaryRow />
      </YStack>
    );
  }

  const fullName = [detail.name, detail.surname].filter(Boolean).join(" ");
  const isSelf = me?.id === detail.id;

  return (
    <YStack gap="$5">
      <YStack gap="$2">
        <Link href="/admin/utenti" style={{ fontSize: 14, color: brand.grafite70 }}>
          ← Utenti
        </Link>
        <AdminPageHeader
          title={detail.professionalProfile?.businessName ?? (fullName || detail.email || "Utente")}
          description={[detail.email, detail.phone].filter(Boolean).join(" · ") || undefined}
        />
        <XStack gap="$2" flexWrap="wrap" marginTop={-8}>
          <AdminPill>{detail.role === "ADMIN" ? `Admin · ${adminRolesLabel(detail.adminRoles)}` : ROLE_LABEL[detail.role]}</AdminPill>
          {detail.deletedAt ? <AdminPill>Eliminato il {formatAdminDate(detail.deletedAt)}</AdminPill> : null}
          {detail.suspendedAt ? <AdminPill tone="danger">Sospeso dal {formatAdminDate(detail.suspendedAt)}</AdminPill> : null}
          {!detail.suspendedAt && detail.professionalProfile?.suspendedAt ? <AdminPill tone="warn">Profilo tolto dalla ricerca</AdminPill> : null}
          {!detail.deletedAt && !detail.suspendedAt ? <AdminPill tone="ok">Attivo</AdminPill> : null}
          {detail.testAccountAt ? <AdminPill tone="warn">Account di prova: fuori dai numeri</AdminPill> : null}
          <AdminPill>Iscritto il {formatAdminDate(detail.createdAt)}</AdminPill>
        </XStack>
      </YStack>

      {detail.professionalProfile ? (
        <AdminCard>
          <Text fontWeight="700" color={brand.grafite}>
            Profilo professionista
          </Text>
          <Text color={brand.grafite}>
            {detail.professionalProfile.businessName} · {detail.professionalProfile.categoryLabel} · {detail.professionalProfile.city}
          </Text>
          {!detail.professionalProfile.suspendedAt && !detail.deletedAt ? (
            <Link href={`/professionista/${detail.professionalProfile.id}`} target="_blank" style={{ fontSize: 14 }}>
              Apri il profilo pubblico
            </Link>
          ) : null}
        </AdminCard>
      ) : null}

      <div className="admin-kpi-grid admin-kpi-grid-3">
        {[
          { label: "Richieste", value: detail.counts.requests },
          { label: "Interventi", value: detail.counts.bookings },
          { label: "Recensioni scritte", value: detail.counts.reviewsWritten },
          { label: "Recensioni ricevute", value: detail.counts.reviewsReceived },
          { label: "Segnalazioni fatte", value: detail.counts.reportsMade },
          { label: "Segnalazioni ricevute", value: detail.counts.reportsReceived },
        ].map((k) => (
          <div key={k.label} className={`admin-kpi${k.label === "Segnalazioni ricevute" && k.value > 0 ? " is-urgent" : ""}`}>
            <span className="admin-kpi-value">{k.value}</span>
            <span className="admin-kpi-label">{k.label}</span>
          </div>
        ))}
      </div>

      {adminCan(myRoles, "MODERATION") && !detail.deletedAt && detail.role !== "ADMIN" ? (
        <SuspendPanel detail={detail} token={token ?? ""} onChanged={reload} />
      ) : null}

      {adminCan(myRoles, "SUPER") && !detail.deletedAt && !isSelf ? <AdminRolePanel detail={detail} token={token ?? ""} onChanged={reload} /> : null}

      {adminCan(myRoles, "SUPER") && !detail.deletedAt && !isSelf && detail.role === "ADMIN" ? (
        <TwoFactorResetPanel detail={detail} token={token ?? ""} onChanged={reload} />
      ) : null}

      {adminCan(myRoles, "SUPER") && !isSelf && detail.role !== "ADMIN" ? <TestAccountPanel detail={detail} token={token ?? ""} onChanged={reload} /> : null}
      {adminCan(myRoles, "SUPER") && detail.testAccountAt && !detail.deletedAt ? <TestTimePanel detail={detail} token={token ?? ""} onChanged={reload} /> : null}

      {detail.reportsReceived.length > 0 ? (
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Segnalazioni che lo riguardano
          </Text>
          <ReportsTable rows={detail.reportsReceived} />
        </YStack>
      ) : null}
      {detail.reportsMade.length > 0 ? (
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Segnalazioni fatte
          </Text>
          <ReportsTable rows={detail.reportsMade} />
        </YStack>
      ) : null}

      <YStack gap="$2">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          Cronologia
        </Text>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <tbody>
              {detail.timeline.map((item, index) => (
                <tr key={`${item.at}-${index}`}>
                  <td style={{ whiteSpace: "nowrap", width: 150 }}>{formatAdminDate(item.at, true)}</td>
                  <td>
                    <span aria-hidden="true">{KIND_ICON[item.kind] ?? "•"} </span>
                    {item.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </YStack>
    </YStack>
  );
}

function ReportsTable({ rows }: { rows: AdminUserDetail["reportsMade"] }) {
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Contenuto</th>
            <th>Motivo</th>
            <th>Esito</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{formatAdminDate(r.createdAt)}</td>
              <td>{CONTENT_REPORT_TARGET_LABEL[r.targetType]}</td>
              <td>{r.reason}</td>
              <td>{r.status === "OPEN" ? "Da gestire" : r.status === "DISMISSED" ? "Non accolta" : r.revertedAt ? "Misura annullata" : `Accolta${r.action ? `: ${moderationActionAdminLabel(r.action, r.targetType).toLowerCase()}` : ""}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SuspendPanel({ detail, token, onChanged }: { detail: AdminUserDetail; token: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspended = Boolean(detail.suspendedAt);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      if (suspended) await apiClient.adminReactivateUser(token, detail.id, note);
      else await apiClient.adminSuspendUser(token, detail.id, note);
      setOpen(false);
      setNote("");
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard highlight={suspended}>
      <Text fontWeight="700" color={brand.grafite}>
        {suspended ? "Account sospeso" : "Sospensione dell'account"}
      </Text>
      {suspended && detail.suspensionNote ? <Text color={brand.grafite70}>Motivazione: {detail.suspensionNote}</Text> : null}
      <Text fontSize="$3" color={brand.grafite70}>
        {suspended
          ? "Riattivando l'account l'utente può di nuovo accedere e, se professionista, torna visibile in ricerca. Riceve una notifica e un'email."
          : "L'utente non potrà più accedere e, se professionista, sparisce da ricerca e profilo pubblico. Riceve la motivazione per notifica ed email. Per un contenuto segnalato usa invece la pagina Segnalazioni."}
      </Text>
      {open ? (
        <YStack gap="$2">
          <textarea aria-label="Motivo"
            className="admin-input admin-textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={suspended ? "Motivo della riattivazione (obbligatorio)" : "Motivazione per l'utente (obbligatoria): cosa ha fatto e quale regola ha violato"}
          />
          {error ? <Text color={brand.urgenza}>{error}</Text> : null}
          <XStack gap="$2">
            <Button variant="primary" size="$3" disabled={busy || note.trim().length < 3} onPress={confirm}>
              {busy ? "…" : suspended ? "Conferma riattivazione" : "Conferma sospensione"}
            </Button>
            <Button variant="secondary" size="$3" onPress={() => setOpen(false)}>
              Annulla
            </Button>
          </XStack>
        </YStack>
      ) : (
        <XStack>
          <Button variant={suspended ? "primary" : "secondary"} size="$3" onPress={() => setOpen(true)}>
            {suspended ? "Riattiva account" : "Sospendi account"}
          </Button>
        </XStack>
      )}
    </AdminCard>
  );
}

/**
 * Account di prova, solo super admin. Interruttore "Account di prova"
 * (docs/CHANGELOG.md §395): l'account resta com'è ma esce per sempre dai
 * numeri e dai "primi 100"; si può spegnere. Sotto, l'eliminazione per
 * sempre con tutto quello che ha creato (§372): si scrive ELIMINA per
 * confermare, il server rifiuta gli account con pagamenti online veri.
 */
function TestAccountPanel({ detail, token, onChanged }: { detail: AdminUserDetail; token: string; onChanged: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const isTest = Boolean(detail.testAccountAt);

  async function toggleTest() {
    setMarking(true);
    setError(null);
    try {
      await apiClient.adminSetTestAccount(token, detail.id, !isTest);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setMarking(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminDeleteTestAccount(token, detail.id);
      router.push("/admin/utenti");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <div className="notif-switch-row">
        <div>
          <strong>Account di prova</strong>
          <small>
            {isTest
              ? `Segnato il ${formatAdminDate(detail.testAccountAt)}: non conta nei numeri e non prende un posto dei primi 100.`
              : "Acceso: l'account funziona come prima ma non conta mai nei numeri e non prende un posto dei primi 100."}
          </small>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isTest}
          aria-label="Account di prova"
          className={`notif-switch${isTest ? " is-on" : ""}`}
          disabled={marking}
          onClick={toggleTest}
        >
          <span />
        </button>
      </div>
      {error && !open ? <Text color={brand.urgenza}>{error}</Text> : null}
      <Text fontSize="$3" color={brand.grafite70}>
        Non ti serve più? Eliminalo: spariscono per sempre l&apos;account, le richieste, i preventivi, i messaggi e le recensioni che ha creato. Per un
        utente vero usa invece la sospensione.
      </Text>
      {open ? (
        <YStack gap="$2" padding="$3" borderRadius={10} backgroundColor="#FBEAE8">
          <Text color={brand.grafite}>
            Non si può annullare. Scrivi <Text fontWeight="800">ELIMINA</Text> per confermare.
          </Text>
          <input
            aria-label="Scrivi ELIMINA per confermare"
            className="admin-input"
            style={{ maxWidth: 240 }}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="ELIMINA"
          />
          {error ? <Text color={brand.urgenza}>{error}</Text> : null}
          <XStack gap="$2" flexWrap="wrap">
            <Button variant="urgent" size="$3" disabled={busy || confirmText.trim().toUpperCase() !== "ELIMINA"} opacity={busy ? 0.6 : 1} onPress={remove}>
              {busy ? "Eliminazione..." : "Elimina per sempre"}
            </Button>
            <Button
              variant="secondary"
              size="$3"
              onPress={() => {
                setOpen(false);
                setConfirmText("");
                setError(null);
              }}
            >
              Annulla
            </Button>
          </XStack>
        </YStack>
      ) : (
        <XStack>
          <Button variant="secondary" size="$3" onPress={() => setOpen(true)}>
            Elimina account di prova
          </Button>
        </XStack>
      )}
    </AdminCard>
  );
}

const TIME_STEPS = ["1", "3", "7", "14", "30"] as const;

/**
 * "Fai passare il tempo", solo sugli account di prova
 * (docs/changelog/2026-10-29-collaudo-tempo.md): per provare in pochi minuti
 * promemoria, chiusure d'ufficio e sblocco dei soldi che altrimenti
 * arriverebbero dopo giorni. Il server tocca solo lavori e richieste in cui
 * anche l'altra persona è un account di prova.
 */
function TestTimePanel({ detail, token, onChanged }: { detail: AdminUserDetail; token: string; onChanged: () => void }) {
  const [days, setDays] = useState<(typeof TIME_STEPS)[number]>("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function move() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = await apiClient.adminMoveTestTime(token, detail.id, Number(days));
      const requests = result.requests === 1 ? "1 richiesta" : `${result.requests} richieste`;
      const bookings = result.bookings === 1 ? "1 lavoro" : `${result.bookings} lavori`;
      setDone(`Fatto: ${requests} e ${bookings} avanti di ${days === "1" ? "1 giorno" : `${days} giorni`}. Promemoria, chiusure e sblocchi sono partiti.`);
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
        Fai passare il tempo
      </Text>
      <Text fontSize="$3" color={brand.grafite70}>
        Solo per le prove: richieste e lavori di questo account vanno avanti come se fossero passati i giorni scelti, poi partono subito promemoria,
        chiusure e sblocchi dei soldi. Vale solo dove anche l&apos;altra persona è un account di prova.
      </Text>
      <AdminTabs tabs={TIME_STEPS.map((step) => ({ key: step, label: step === "1" ? "1 giorno" : `${step} giorni` }))} value={days} onChange={setDays} />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {done ? (
        <Text color={brand.cianografiaScuro} role="status">
          {done}
        </Text>
      ) : null}
      <XStack>
        <Button size="$3" disabled={busy} opacity={busy ? 0.6 : 1} onPress={move}>
          {busy ? "Un momento..." : `Fai passare ${days === "1" ? "1 giorno" : `${days} giorni`}`}
        </Button>
      </XStack>
    </AdminCard>
  );
}

/**
 * Verifica in due passaggi di un altro admin (docs/CHANGELOG.md §359): se ha
 * perso il telefono e non riceve l'email col codice, un super admin la azzera e lui
 * la riattiva al prossimo ingresso. Le sue sessioni aperte si chiudono.
 */
function TwoFactorResetPanel({ detail, token, onChanged }: { detail: AdminUserDetail; token: string; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminTwoFactorReset(token, detail.id);
      setConfirming(false);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminCard>
      <XStack gap="$2" alignItems="center" flexWrap="wrap">
        <Text fontWeight="700" color={brand.grafite}>
          Verifica in due passaggi
        </Text>
        <AdminPill tone={detail.adminTwoFactorEnabled ? "ok" : "warn"}>{detail.adminTwoFactorEnabled ? "Attiva" : "Da attivare"}</AdminPill>
      </XStack>
      <Text fontSize="$3" color={brand.grafite70}>
        {detail.adminTwoFactorEnabled
          ? "Se ha perso il telefono e non riceve l'email con il codice, azzerala: lo faremo uscire da tutti i dispositivi e la riattiverà al prossimo ingresso."
          : "La attiverà da solo la prossima volta che apre l'area admin."}
      </Text>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {detail.adminTwoFactorEnabled ? (
        confirming ? (
          <XStack gap="$2" flexWrap="wrap">
            <Button variant="primary" size="$3" disabled={busy} onPress={reset}>
              {busy ? "…" : "Conferma azzeramento"}
            </Button>
            <Button variant="secondary" size="$3" onPress={() => setConfirming(false)}>
              Annulla
            </Button>
          </XStack>
        ) : (
          <XStack>
            <Button variant="secondary" size="$3" onPress={() => setConfirming(true)}>
              Azzera la verifica
            </Button>
          </XStack>
        )
      ) : null}
    </AdminCard>
  );
}

/**
 * Ruoli admin combinabili (docs/CHANGELOG.md §146): Moderatore e Finanza si
 * possono spuntare insieme; Super admin comprende già tutto. Nessuna
 * casella = non più admin.
 */
function AdminRolePanel({ detail, token, onChanged }: { detail: AdminUserDetail; token: string; onChanged: () => void }) {
  const current: AdminRoleName[] = detail.role === "ADMIN" ? detail.adminRoles : [];
  const [selected, setSelected] = useState<AdminRoleName[]>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSuper = selected.includes("SUPER");
  const changed = [...selected].sort().join() !== [...current].sort().join();

  function toggle(role: AdminRoleName) {
    setSelected((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminSetAdminRoles(token, detail.id, isSuper ? ["SUPER"] : selected);
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const checkbox = (role: AdminRoleName, disabled = false) => (
    <label key={role} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" checked={isSuper && role !== "SUPER" ? true : selected.includes(role)} disabled={disabled} onChange={() => toggle(role)} />
      <span>
        <strong>{ADMIN_ROLE_LABEL[role]}</strong> — {ADMIN_ROLE_DESCRIPTION[role]}
      </span>
    </label>
  );

  return (
    <AdminCard>
      <Text fontWeight="700" color={brand.grafite}>
        Ruoli di amministratore
      </Text>
      <Text fontSize="$3" color={brand.grafite70}>
        Puoi spuntarne più di uno. Nessuna casella: {detail.professionalProfile ? "resta professionista" : "resta cliente"}, senza accesso al pannello.
      </Text>
      <YStack gap="$2">
        {checkbox("MODERATOR", isSuper)}
        {checkbox("FINANCE", isSuper)}
        {checkbox("SUPER")}
      </YStack>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <XStack>
        <Button variant="primary" size="$3" disabled={busy || !changed} onPress={save}>
          {busy ? "…" : "Salva ruoli"}
        </Button>
      </XStack>
    </AdminCard>
  );
}
