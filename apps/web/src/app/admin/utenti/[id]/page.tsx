"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminRoleName, AdminUserDetail, AdminUserReview } from "@professionisti/api-client";
import {
  ADMIN_ROLE_DESCRIPTION,
  ADMIN_ROLE_LABEL,
  ADMIN_USER_SIGNAL_LABEL,
  CONTENT_REPORT_REASONS,
  CONTENT_REPORT_TARGET_LABEL,
  JOB_ISSUE_STATUS_LABEL,
  MODERATION_GROUNDS,
  MODERATION_REASON_TEMPLATES,
  PROFESSIONAL_STATUS_ONE_LABEL,
  adminCan,
  adminRolesLabel,
  moderationActionAdminLabel,
  type ContentReportReasonCode,
  type ModerationGroundCode,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { SkeletonSummaryRow } from "@/components/Skeleton";

const ROLE_LABEL = { CLIENT: "Cliente", PROFESSIONAL: "Professionista", ADMIN: "Amministratore" } as const;
const KIND_ICON: Record<string, string> = { account: "👤", request: "📝", booking: "📅", review: "⭐", report: "🚩", admin: "🛡️" };

/** Schede della persona (docs/changelog/2026-10-30-admin-persone.md), salvate nell'indirizzo. */
const TABS = [
  { key: "riepilogo", label: "Riepilogo" },
  { key: "richieste", label: "Richieste" },
  { key: "lavori", label: "Lavori" },
  { key: "recensioni", label: "Recensioni" },
  { key: "pagamenti", label: "Pagamenti" },
  { key: "segnalazioni", label: "Segnalazioni" },
  { key: "cronologia", label: "Cronologia" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AdminUserDetailPage() {
  return (
    <Suspense fallback={null}>
      <UserDetail />
    </Suspense>
  );
}

/**
 * Scheda della persona (docs/CHANGELOG.md §145, a schede dal riordino
 * dell'Admin, docs/changelog/2026-10-30-admin-persone.md): in cima i segnali
 * da controllare, poi le schede con richieste, lavori, recensioni, pagamenti,
 * segnalazioni e cronologia. Le recensioni si nascondono e il profilo si
 * toglie dalla ricerca da qui, sulla strada delle segnalazioni.
 */
function UserDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("scheda");
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "riepilogo";
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

  function setTab(key: TabKey) {
    const next = new URLSearchParams(searchParams.toString());
    if (key === "riepilogo") next.delete("scheda");
    else next.set("scheda", key);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

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
  const canModerate = adminCan(myRoles, "MODERATION") && !detail.deletedAt;
  const profile = detail.professionalProfile;
  // "Attivo" solo se può davvero lavorare: un profilo fuori dalla ricerca non lo è (misura prima del riordino).
  const active = !detail.deletedAt && !detail.suspendedAt && (!profile || profile.searchStatus === "VISIBLE");
  const hiddenReviews = detail.counts.reviewsReceived - detail.counts.reviewsReceivedVisible;
  const tabCount: Partial<Record<TabKey, number>> = {
    richieste: detail.requests.length,
    lavori: detail.jobs.length,
    recensioni: detail.reviewsWritten.length + detail.reviewsReceived.length,
    pagamenti: detail.jobs.filter((j) => j.paidOnline).length,
    segnalazioni: detail.reportsMade.length + detail.reportsReceived.length,
  };

  return (
    <YStack gap="$4">
      <YStack gap="$2">
        <Link href="/admin/utenti" style={{ fontSize: 14, color: brand.grafite70 }}>
          ← Persone
        </Link>
        <AdminPageHeader
          title={profile?.businessName ?? (fullName || (detail.deletedAt ? "Account chiuso" : detail.email) || "Utente")}
          description={detail.deletedAt ? "Account chiuso: nome, email e telefono sono stati cancellati." : [detail.email, detail.phone].filter(Boolean).join(" · ") || undefined}
        />
        <XStack gap="$2" flexWrap="wrap" marginTop={-8}>
          <AdminPill>{detail.role === "ADMIN" ? `Admin · ${adminRolesLabel(detail.adminRoles)}` : ROLE_LABEL[detail.role]}</AdminPill>
          {detail.deletedAt ? <AdminPill>Account chiuso il {formatAdminDate(detail.deletedAt)}</AdminPill> : null}
          {detail.suspendedAt ? <AdminPill tone="danger">Sospeso dal {formatAdminDate(detail.suspendedAt)}</AdminPill> : null}
          {!detail.suspendedAt && !detail.deletedAt && profile && profile.searchStatus !== "VISIBLE" ? (
            <AdminPill tone="warn">{PROFESSIONAL_STATUS_ONE_LABEL[profile.searchStatus]}</AdminPill>
          ) : null}
          {active ? <AdminPill tone="ok">Attivo</AdminPill> : null}
          {detail.testAccountAt ? <AdminPill tone="warn">Account di prova: fuori dai numeri</AdminPill> : null}
          <AdminPill>Iscritto il {formatAdminDate(detail.createdAt)}</AdminPill>
        </XStack>
      </YStack>

      {detail.signals.length > 0 ? (
        <section className="admin-signals" aria-label="Da controllare">
          <Text fontWeight="800" color={brand.grafite}>
            Da controllare
          </Text>
          <ul className="admin-signal-list">
            {detail.signals.map((signal, index) => (
              <li key={`${signal.kind}-${index}`}>
                <strong>{ADMIN_USER_SIGNAL_LABEL[signal.kind]}</strong>
                {signal.others.length > 0 ? (
                  <>
                    {": anche "}
                    {signal.others.map((other, i) => (
                      <span key={other.id}>
                        {i > 0 ? ", " : ""}
                        <Link href={`/admin/utenti/${other.id}`}>{other.label}</Link>
                      </span>
                    ))}
                  </>
                ) : (
                  `: ${signal.detail}`
                )}
              </li>
            ))}
          </ul>
          <Text fontSize={13} color={brand.grafite70}>
            Da soli non provano niente: guardali insieme alle recensioni e ai lavori prima di decidere.
          </Text>
        </section>
      ) : null}

      <AdminTabs tabs={TABS.map((t) => ({ key: t.key, label: tabCount[t.key] ? `${t.label} (${tabCount[t.key]})` : t.label }))} value={tab} onChange={setTab} />

      {tab === "riepilogo" ? (
        <YStack gap="$4">
          {profile ? (
            <ProfilePanel detail={detail} token={token ?? ""} canModerate={canModerate} onChanged={reload} />
          ) : null}

          <div className="admin-kpi-grid admin-kpi-grid-3">
            {[
              { label: "Richieste", value: String(detail.counts.requests) },
              { label: "Lavori", value: String(detail.counts.bookings) },
              { label: "Recensioni scritte", value: String(detail.counts.reviewsWritten) },
              {
                label: hiddenReviews > 0 ? `Recensioni ricevute (${hiddenReviews} nascost${hiddenReviews === 1 ? "a" : "e"}: il profilo ne mostra ${detail.counts.reviewsReceivedVisible})` : "Recensioni ricevute",
                value: String(detail.counts.reviewsReceived),
              },
              { label: "Segnalazioni fatte", value: String(detail.counts.reportsMade) },
              { label: "Segnalazioni ricevute", value: String(detail.counts.reportsReceived), urgent: detail.counts.reportsReceived > 0 },
            ].map((k) => (
              <div key={k.label} className={`admin-kpi${k.urgent ? " is-urgent" : ""}`}>
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
        </YStack>
      ) : null}

      {tab === "richieste" ? (
        detail.requests.length === 0 ? (
          <EmptyTab text="Nessuna richiesta." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Lavoro</th>
                  <th>Descrizione</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {detail.requests.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatAdminDate(r.createdAt)}</td>
                    <td>
                      {r.categoryLabel}
                      {r.city ? ` · ${r.city}` : ""}
                    </td>
                    <td>{r.description}</td>
                    <td>
                      {r.status}
                      {r.hidden ? " · nascosta" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "lavori" ? (
        detail.jobs.length === 0 ? (
          <EmptyTab text="Nessun lavoro." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Appuntamento</th>
                  <th>Con chi</th>
                  <th>Stato</th>
                  <th>Problema</th>
                </tr>
              </thead>
              <tbody>
                {detail.jobs.map((j) => (
                  <tr key={j.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatAdminDate(j.scheduledAt, true)}</td>
                    <td>
                      {j.as === "CLIENT" ? "Professionista: " : "Cliente: "}
                      {j.otherUserId ? <Link href={`/admin/utenti/${j.otherUserId}`}>{j.other}</Link> : j.other}
                      {j.categoryLabel ? ` · ${j.categoryLabel}` : ""}
                    </td>
                    <td>{j.status}</td>
                    <td>
                      {j.issueStatus ? (
                        <Link href="/admin/problemi">{JOB_ISSUE_STATUS_LABEL[j.issueStatus as keyof typeof JOB_ISSUE_STATUS_LABEL] ?? "Problema segnalato"}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "recensioni" ? (
        <YStack gap="$4">
          <ReviewsTable
            title={`Scritte da ${detail.role === "PROFESSIONAL" ? "questa persona come cliente" : "questa persona"}`}
            rows={detail.reviewsWritten}
            otherLabel="Professionista"
            detail={detail}
            token={token ?? ""}
            canModerate={canModerate}
            onChanged={reload}
          />
          {profile ? (
            <ReviewsTable
              title={hiddenReviews > 0 ? `Ricevute (il profilo pubblico ne mostra ${detail.counts.reviewsReceivedVisible}: le nascoste non si vedono)` : "Ricevute"}
              rows={detail.reviewsReceived}
              otherLabel="Cliente"
              detail={detail}
              token={token ?? ""}
              canModerate={canModerate}
              onChanged={reload}
            />
          ) : null}
        </YStack>
      ) : null}

      {tab === "pagamenti" ? (
        detail.jobs.length === 0 ? (
          <EmptyTab text="Nessun lavoro, quindi nessun pagamento." />
        ) : (
          <YStack gap="$2">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Appuntamento</th>
                    <th>Con chi</th>
                    <th>Pagamento</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.jobs.map((j) => (
                    <tr key={j.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatAdminDate(j.scheduledAt)}</td>
                      <td>{j.other}</td>
                      <td>{j.paymentLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {adminCan(myRoles, "FINANCE") ? (
              <Link href="/admin/pagamenti" style={{ fontSize: 14 }}>
                Rimborsi e contestazioni in Pagamenti
              </Link>
            ) : null}
          </YStack>
        )
      ) : null}

      {tab === "segnalazioni" ? (
        <YStack gap="$4">
          {detail.reportsReceived.length === 0 && detail.reportsMade.length === 0 ? <EmptyTab text="Nessuna segnalazione." /> : null}
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
          {adminCan(myRoles, "MODERATION") && detail.reportsReceived.some((r) => r.status === "OPEN") ? (
            <Link href="/admin/segnalazioni" style={{ fontSize: 14 }}>
              Decidi le segnalazioni aperte
            </Link>
          ) : null}
        </YStack>
      ) : null}

      {tab === "cronologia" ? (
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
      ) : null}
    </YStack>
  );
}

function EmptyTab({ text }: { text: string }) {
  return <Text color={brand.grafite70}>{text}</Text>;
}

/**
 * Profilo nella ricerca o no, con "Togli dalla ricerca" separato da
 * "Sospendi account" (misura prima del riordino): il profilo sparisce da
 * ricerca e pagina pubblica, la persona può ancora entrare e lavorare sui
 * lavori già presi.
 */
function ProfilePanel({ detail, token, canModerate, onChanged }: { detail: AdminUserDetail; token: string; canModerate: boolean; onChanged: () => void }) {
  const profile = detail.professionalProfile!;
  const [modal, setModal] = useState<"hide" | "show" | null>(null);
  return (
    <AdminCard highlight={profile.searchStatus !== "VISIBLE"}>
      <XStack gap="$2" alignItems="center" flexWrap="wrap">
        <Text fontWeight="700" color={brand.grafite}>
          Profilo professionista
        </Text>
        <AdminPill tone={profile.searchStatus === "VISIBLE" ? "ok" : "warn"}>{PROFESSIONAL_STATUS_ONE_LABEL[profile.searchStatus]}</AdminPill>
      </XStack>
      <Text color={brand.grafite}>
        {profile.businessName} · {profile.categoryLabel} · {profile.city}
      </Text>
      {profile.hiddenBy?.note ? <Text color={brand.grafite70}>Motivo: {profile.hiddenBy.note}</Text> : null}
      <XStack gap="$3" flexWrap="wrap" alignItems="center">
        {profile.searchStatus === "VISIBLE" && !detail.deletedAt ? (
          <Link href={`/professionista/${profile.id}`} target="_blank" style={{ fontSize: 14 }}>
            Apri il profilo pubblico
          </Link>
        ) : null}
        {canModerate && !profile.suspendedAt ? (
          <Button variant="secondary" size="$3" onPress={() => setModal("hide")}>
            Togli dalla ricerca
          </Button>
        ) : null}
        {canModerate && profile.hiddenBy && !detail.suspendedAt ? (
          <Button variant="primary" size="$3" onPress={() => setModal("show")}>
            Rimetti nella ricerca
          </Button>
        ) : null}
      </XStack>
      {modal === "hide" ? (
        <ModerateModal
          kind="PROFESSIONAL_PROFILE"
          targetId={profile.id}
          who={profile.businessName}
          detail={detail}
          token={token}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            onChanged();
          }}
        />
      ) : null}
      {modal === "show" && profile.hiddenBy ? (
        <RevertModal
          title="Rimetti nella ricerca"
          description={`${profile.businessName} torna nella ricerca e sulla pagina pubblica. Riceve un'email che la decisione è stata annullata.`}
          reportId={profile.hiddenBy.reportId}
          token={token}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            onChanged();
          }}
        />
      ) : null}
    </AdminCard>
  );
}

function ReviewsTable({
  title,
  rows,
  otherLabel,
  detail,
  token,
  canModerate,
  onChanged,
}: {
  title: string;
  rows: AdminUserReview[];
  otherLabel: string;
  detail: AdminUserDetail;
  token: string;
  canModerate: boolean;
  onChanged: () => void;
}) {
  const [hiding, setHiding] = useState<AdminUserReview | null>(null);
  const [showing, setShowing] = useState<AdminUserReview | null>(null);
  return (
    <YStack gap="$2">
      <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
        {title}
      </Text>
      {rows.length === 0 ? (
        <EmptyTab text="Nessuna recensione." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>{otherLabel}</th>
                <th>Voto e testo</th>
                <th>Stato</th>
                {canModerate ? <th>Azione</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatAdminDate(r.createdAt)}</td>
                  <td>{r.other}</td>
                  <td>
                    <strong>{r.rating}★</strong> {r.comment ?? ""}
                  </td>
                  <td>
                    {r.hiddenAt ? `Nascosta dal ${formatAdminDate(r.hiddenAt)}` : "Visibile"}
                    {r.hiddenBy?.note ? <small className="admin-cell-note">Motivo: {r.hiddenBy.note}</small> : null}
                  </td>
                  {canModerate ? (
                    <td style={{ whiteSpace: "nowrap" }}>
                      {!r.hiddenAt ? (
                        <button type="button" className="admin-link-button" onClick={() => setHiding(r)}>
                          Nascondi
                        </button>
                      ) : r.hiddenBy ? (
                        <button type="button" className="admin-link-button" onClick={() => setShowing(r)}>
                          Rimetti visibile
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hiding ? (
        <ModerateModal
          kind="REVIEW"
          targetId={hiding.id}
          who={`la recensione da ${hiding.rating}★ ${otherLabel === "Cliente" ? `di ${hiding.other}` : `a ${hiding.other}`}`}
          detail={detail}
          token={token}
          onClose={() => setHiding(null)}
          onDone={() => {
            setHiding(null);
            onChanged();
          }}
        />
      ) : null}
      {showing?.hiddenBy ? (
        <RevertModal
          title="Rimetti visibile la recensione"
          description="La recensione torna sul profilo e nella media dei voti. L'autore riceve un'email che la decisione è stata annullata."
          reportId={showing.hiddenBy.reportId}
          token={token}
          onClose={() => setShowing(null)}
          onDone={() => {
            setShowing(null);
            onChanged();
          }}
        />
      ) : null}
    </YStack>
  );
}

const selectStyle = { padding: 10, borderRadius: 10, border: `1px solid ${brand.bordoCampo}`, backgroundColor: "#ffffff", fontSize: 16, fontFamily: "inherit", color: brand.grafite, width: "100%" };

/**
 * "Nascondi la recensione" e "Togli dalla ricerca": motivo da un elenco,
 * regola o legge violata e spiegazione per l'autore, tutti obbligatori. Il
 * pulsante dice cosa fa. Sotto è una segnalazione decisa subito: l'autore
 * riceve la stessa email delle segnalazioni, con come contestare.
 */
function ModerateModal({
  kind,
  targetId,
  who,
  detail,
  token,
  onClose,
  onDone,
}: {
  kind: "REVIEW" | "PROFESSIONAL_PROFILE";
  targetId: string;
  who: string;
  detail: AdminUserDetail;
  token: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<ContentReportReasonCode | "">("");
  const [ground, setGround] = useState<ModerationGroundCode | "">("");
  const [note, setNote] = useState("");
  const isReview = kind === "REVIEW";
  const label = moderationActionAdminLabel(isReview ? "HIDE_CONTENT" : "SUSPEND_PROFILE", kind);
  const confirm = isReview ? "Nascondi la recensione" : "Togli dalla ricerca";

  async function submit() {
    if (!reason) throw new Error("Scegli il motivo.");
    if (!ground) throw new Error("Scegli la regola o la legge violata.");
    if (note.trim().length < 10) throw new Error("Spiega all'autore cosa non va, in almeno una frase.");
    await apiClient.adminModerateFromUser(token, detail.id, { targetType: kind, targetId, reason, ground, note: note.trim() });
    onDone();
  }

  return (
    <CancelBookingModal
      title={confirm}
      description={
        isReview
          ? `Nascondi ${who}: sparisce dal profilo e dalla media dei voti. L'autore riceve un'email con il motivo e come contestare.`
          : `${label} di ${who}. La persona può ancora entrare e finire i lavori già presi. Riceve un'email con il motivo e come contestare.`
      }
      confirmLabel={confirm}
      confirmingLabel="Un momento..."
      backLabel="Annulla"
      showNote={false}
      onClose={onClose}
      onCancel={submit}
    >
      <YStack gap="$3">
        <label className="admin-field">
          <span>Motivo</span>
          <select style={selectStyle} value={reason} onChange={(e) => setReason(e.target.value as ContentReportReasonCode)}>
            <option value="">Scegli…</option>
            {CONTENT_REPORT_REASONS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Regola o legge violata</span>
          <select style={selectStyle} value={ground} onChange={(e) => setGround(e.target.value as ModerationGroundCode)}>
            <option value="">Scegli…</option>
            {MODERATION_GROUNDS.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          <span>Spiegazione per l&apos;autore</span>
          <textarea className="admin-input admin-textarea" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Cosa non va e perché" />
        </label>
        <XStack gap="$2" flexWrap="wrap">
          {MODERATION_REASON_TEMPLATES.map((t) => (
            <button key={t.label} type="button" className="admin-chip-button" onClick={() => setNote(t.text)}>
              {t.label}
            </button>
          ))}
        </XStack>
      </YStack>
    </CancelBookingModal>
  );
}

/** "Rimetti visibile" / "Rimetti nella ricerca": annulla la decisione, con il motivo obbligatorio. */
function RevertModal({ title, description, reportId, token, onClose, onDone }: { title: string; description: string; reportId: string; token: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  async function submit() {
    if (note.trim().length < 3) throw new Error("Scrivi il motivo.");
    await apiClient.adminRevertContentReport(token, reportId, note.trim());
    onDone();
  }
  return (
    <CancelBookingModal title={title} description={description} confirmLabel={title} confirmingLabel="Un momento..." backLabel="Annulla" showNote={false} onClose={onClose} onCancel={submit}>
      <label className="admin-field">
        <span>Motivo</span>
        <textarea className="admin-input admin-textarea" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Es. ricorso accolto, errore" />
      </label>
    </CancelBookingModal>
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
      const trial =
        result.trial === "NOT_LAUNCHED"
          ? " Il mese gratuito parte dal lancio: finché non c'è la data di lancio non finisce."
          : result.trial === "STRIPE"
            ? " L'abbonamento pagato lo rinnova Stripe: il suo periodo non cambia."
            : result.trial === "MOVED"
              ? " Anche il mese gratuito è andato avanti."
              : "";
      setDone(`Fatto: ${requests} e ${bookings} avanti di ${days === "1" ? "1 giorno" : `${days} giorni`}. Promemoria, chiusure e sblocchi sono partiti.${trial}`);
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
        Solo per le prove: richieste, lavori e mese gratuito di questo account vanno avanti come se fossero passati i giorni scelti, poi partono
        subito promemoria, chiusure e sblocchi dei soldi. Vale solo dove anche l&apos;altra persona è un account di prova.
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
