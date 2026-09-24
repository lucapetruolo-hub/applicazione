"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ProfessionalBooking, ProfessionalInsights, ProfessionalLead } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { classifyLeadStage } from "@/lib/requestStage";
import { formatCompetitors, formatLeadDeadline } from "@/lib/leadDeadline";
import { accountMenuUnreadCounts } from "@/lib/notificationSections";
import { SkeletonSummaryRow } from "@/components/Skeleton";

/**
 * Home "Oggi" del professionista (docs/CHANGELOG.md §147, decisione esplicita
 * dell'utente): una lista di cose da fare, non un secondo elenco di
 * richieste (quello vive in "Richieste e lavori"). In cima le richieste da
 * rispondere con la scadenza — in un mercato locale vince chi risponde per
 * primo (CLAUDE.md §8) — poi gli appuntamenti di oggi e domani, poi i propri
 * numeri rispetto alla zona. Modelli: Thumbtack Pro/Angi Pro per i lead,
 * Fresha/Treatwell per la giornata.
 */
export default function DashboardTodayPage() {
  const { user, token, isLoading, unreadNotifications } = useAuth();
  const [leads, setLeads] = useState<ProfessionalLead[] | null>(null);
  const [bookings, setBookings] = useState<ProfessionalBooking[] | null>(null);
  const [insights, setInsights] = useState<ProfessionalInsights | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    const onError = (err: unknown) => {
      if (err instanceof Error && err.message.includes("profilo")) setProfileMissing(true);
      else setError(err instanceof Error ? err.message : "Errore nel caricamento.");
    };
    apiClient.myLeads(token).then(setLeads).catch(onError);
    apiClient.myProfessionalBookings(token).then(setBookings).catch(onError);
    apiClient.getMyInsights(token).then(setInsights).catch(() => setInsights(null));
  }, [token, user?.isProfessional]);

  // I conti alla rovescia si aggiornano da soli ogni minuto.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <Text color={brand.grafite70}>Questa sezione è riservata ai professionisti.</Text>
      </YStack>
    );
  }

  if (profileMissing) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Completa il tuo profilo per iniziare
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            Serve un profilo completo (nome attività, categoria, città) per comparire in ricerca e ricevere richieste.
          </Text>
          <Link href="/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button variant="primary">Completa profilo</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  const toAnswer = (leads ?? [])
    .filter((lead) => classifyLeadStage(lead) === "da_quotare")
    .sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
  const datesToConfirm = (leads ?? []).filter((lead) => lead.quote?.status === "MODIFICATION_REQUESTED" && lead.quote.clientProposedDate);
  const unreadMessages = accountMenuUnreadCounts(true, unreadNotifications)["/chat"] ?? 0;

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const endTomorrow = new Date(startToday);
  endTomorrow.setDate(endTomorrow.getDate() + 2);
  const upcoming = (bookings ?? [])
    .filter((b) => (b.status === "CONFIRMED" || b.status === "PENDING") && new Date(b.scheduledAt) >= startToday && new Date(b.scheduledAt) < endTomorrow)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  const loading = leads === null || bookings === null;
  const greetingName = user.businessName ?? user.name ?? "";

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$6" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1000} gap="$6">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Oggi
          </Text>
          <Text color={brand.grafite70}>
            {greetingName ? `Ciao ${greetingName}, ` : ""}
            {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </Text>
        </YStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        <div className="today-kpis">
          <TodayCounter href="/dashboard/richieste?stage=da_quotare" icon="file-text" value={toAnswer.length} label="Richieste da rispondere" urgent={toAnswer.length > 0} loading={loading} />
          <TodayCounter href="/dashboard/richieste?stage=modifica_richiesta" icon="calendar" value={datesToConfirm.length} label="Date da confermare" urgent={datesToConfirm.length > 0} loading={loading} />
          <TodayCounter href="/chat" icon="message-circle" value={unreadMessages} label="Messaggi non letti" urgent={unreadMessages > 0} loading={false} />
        </div>

        <TodaySection title="Da rispondere ora" action={{ href: "/dashboard/richieste", label: "Tutte le richieste" }}>
          {loading ? (
            <Skeletons />
          ) : toAnswer.length === 0 ? (
            <EmptyLine text="Nessuna richiesta in attesa: ti avvisiamo appena ne arriva una nuova." />
          ) : (
            toAnswer.slice(0, 5).map((lead) => <LeadToAnswerRow key={lead.id} lead={lead} />)
          )}
        </TodaySection>

        {datesToConfirm.length > 0 ? (
          <TodaySection title="Date proposte dai clienti">
            {datesToConfirm.map((lead) => (
              <Link key={lead.id} href={`/dashboard/richieste?open=${lead.guidedRequest.id}`} className="today-row">
                <span className="today-row-main">
                  <strong>
                    {lead.guidedRequest.categoryLabel} · {lead.guidedRequest.clientName ?? "Cliente"}
                  </strong>
                  <span className="today-row-sub">
                    Nuova data proposta: {formatDateTime(lead.quote!.clientProposedDate!)}
                  </span>
                </span>
                <span className="today-row-cta">Rispondi</span>
              </Link>
            ))}
          </TodaySection>
        ) : null}

        <TodaySection title="Oggi e domani" action={{ href: "/dashboard/agenda", label: "Apri l'agenda" }}>
          {loading ? (
            <Skeletons />
          ) : upcoming.length === 0 ? (
            <EmptyLine text="Nessun appuntamento oggi e domani." />
          ) : (
            upcoming.map((booking) => (
              <Link
                key={booking.id}
                href={booking.guidedRequestId ? `/dashboard/richieste?open=${booking.guidedRequestId}` : `/dashboard/agenda?booking=${booking.id}`}
                className="today-row"
              >
                <span className="today-time">{dayLabel(booking.scheduledAt)}</span>
                <span className="today-row-main">
                  <strong>{booking.clientName ?? "Cliente"}</strong>
                  <span className="today-row-sub">
                    {[booking.items[0]?.name, booking.city ?? booking.address].filter(Boolean).join(" · ") || "Intervento"}
                    {booking.status === "PENDING" ? " · da confermare" : ""}
                  </span>
                </span>
              </Link>
            ))
          )}
        </TodaySection>

        <TodaySection title="Il tuo andamento" subtitle={insights ? `Rispetto agli altri professionisti di ${insights.areaLabel}` : undefined}>
          {insights ? <InsightsGrid insights={insights} /> : <Skeletons />}
        </TodaySection>

        {insights ? <Suggestion insights={insights} /> : null}
      </YStack>
    </YStack>
  );
}

function TodayCounter({ href, icon, value, label, urgent, loading }: { href: string; icon: IconName; value: number; label: string; urgent: boolean; loading: boolean }) {
  return (
    <Link href={href} className={`admin-kpi${urgent ? " is-urgent" : ""}`}>
      <Icon name={icon} size={18} color={urgent ? "#dc3545" : "#6e6459"} />
      <span className="admin-kpi-value">{loading ? "…" : value}</span>
      <span className="admin-kpi-label">{label}</span>
    </Link>
  );
}

function TodaySection({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <YStack gap="$3">
      <XStack justifyContent="space-between" alignItems="flex-end" gap="$2" flexWrap="wrap">
        <YStack>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            {title}
          </Text>
          {subtitle ? (
            <Text fontSize="$2" color={brand.grafite70}>
              {subtitle}
            </Text>
          ) : null}
        </YStack>
        {action ? (
          <Link href={action.href} style={{ color: brand.cianografia, fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
            {action.label} →
          </Link>
        ) : null}
      </XStack>
      <div className="today-list">{children}</div>
    </YStack>
  );
}

function LeadToAnswerRow({ lead }: { lead: ProfessionalLead }) {
  const deadline = formatLeadDeadline(lead.expiresAt);
  const competitors = formatCompetitors(lead.competitors);
  return (
    <Link href={`/dashboard/richieste?open=${lead.guidedRequest.id}`} className="today-row">
      <span className="today-row-main">
        <strong>
          {lead.guidedRequest.isUrgent ? "🔴 " : ""}
          {lead.guidedRequest.categoryLabel} · {lead.guidedRequest.city}
        </strong>
        <span className="today-row-sub">{truncate(lead.guidedRequest.description, 110)}</span>
        <span className="today-row-meta">
          {deadline ? <span className={deadline.urgent ? "today-deadline is-urgent" : "today-deadline"}>{deadline.label}</span> : null}
          {competitors ? <span className="today-competitors">{competitors}</span> : null}
        </span>
      </span>
      <span className="today-row-cta">Invia preventivo</span>
    </Link>
  );
}

function InsightsGrid({ insights }: { insights: ProfessionalInsights }) {
  const cells: { label: string; value: string; compare: string | null }[] = [
    {
      label: "Visite al profilo (30 giorni)",
      value: String(insights.profileViews30d),
      compare: insights.areaAvgProfileViews30d !== null ? `Media della zona: ${insights.areaAvgProfileViews30d}` : null,
    },
    {
      label: "Tempo medio di risposta",
      value: insights.avgResponseTimeMinutes !== null ? formatMinutes(insights.avgResponseTimeMinutes) : "—",
      compare: insights.areaAvgResponseTimeMinutes !== null ? `Media della zona: ${formatMinutes(insights.areaAvgResponseTimeMinutes)}` : null,
    },
    {
      label: "Recensioni",
      value: insights.rating !== null ? `${insights.rating.toLocaleString("it-IT")} ★` : "—",
      compare: `${insights.reviewCount} recension${insights.reviewCount === 1 ? "e" : "i"}`,
    },
  ];
  return (
    <div className="today-kpis">
      {cells.map((cell) => (
        <div key={cell.label} className="admin-kpi">
          <span className="admin-kpi-label">{cell.label}</span>
          <span className="admin-kpi-value">{cell.value}</span>
          {cell.compare ? <span style={{ fontSize: 12, color: "#6e6459", fontWeight: 600 }}>{cell.compare}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** Un solo suggerimento alla volta, solo quando c'è un motivo concreto (nessun acquisto: l'upsell si decide a parte). */
function Suggestion({ insights }: { insights: ProfessionalInsights }) {
  let text: string | null = null;
  let href = "/dashboard/profilo";
  let cta = "Vai al profilo";
  if (insights.avgResponseTimeMinutes !== null && insights.areaAvgResponseTimeMinutes !== null && insights.avgResponseTimeMinutes > insights.areaAvgResponseTimeMinutes) {
    text = "Rispondi più in fretta della media della tua zona: chi risponde per primo vince più spesso il lavoro.";
    href = "/dashboard/richieste?stage=da_quotare";
    cta = "Vedi le richieste";
  } else if (insights.areaAvgProfileViews30d !== null && insights.profileViews30d < insights.areaAvgProfileViews30d) {
    text = "Il tuo profilo è visitato meno della media della zona: foto, prestazioni con prezzo e disponibilità aiutano a farti scegliere.";
  } else if (insights.reviewCount === 0) {
    text = "Non hai ancora recensioni: a fine lavoro ricorda al cliente di lasciarne una, il profilo diventa più credibile.";
    href = "/dashboard/richieste?stage=completata";
    cta = "Lavori completati";
  }
  if (!text) return null;
  return (
    <XStack gap="$3" alignItems="center" padding="$4" borderRadius={16} backgroundColor={brand.cianografiaVelo} flexWrap="wrap">
      <Icon name="sparkles" size={20} color={brand.cianografia} />
      <Text flex={1} minWidth={220} color={brand.grafite}>
        {text}
      </Text>
      <Link href={href} style={{ textDecoration: "none" }}>
        <Button variant="secondary" size="$3">
          {cta}
        </Button>
      </Link>
    </XStack>
  );
}

function Skeletons() {
  return (
    <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
      <SkeletonSummaryRow />
      <SkeletonSummaryRow />
    </YStack>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="today-empty">{text}</div>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" })}, ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${isToday ? "Oggi" : "Domani"} ${time}`;
}
