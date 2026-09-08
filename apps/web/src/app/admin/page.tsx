"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminContactMessage, AdminContentReport, AdminUserRow, AdminUsersByRole } from "@professionisti/api-client";
import { Button, H1, H2, Paragraph, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { LoadingState } from "@/components/LoadingState";

export default function AdminPage() {
  const { user, token, isLoading } = useAuth();
  const [data, setData] = useState<AdminUsersByRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Email raccolte dal riquadro "Arriviamo presto nella tua zona" in
  // homepage (richiesta esplicita dell'utente: "salvale in un elenco
  // visualizzabile dai profili admin") — erano già scritte su DB, mai
  // lette da nessuna pagina prima d'ora.
  const [waitlist, setWaitlist] = useState<{ email: string; createdAt: string }[] | null>(null);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  // Segnalazioni contenuti (richiesta esplicita dell'utente, "Verbale di
  // Conformità" — meccanismo di notice-and-action, Reg. (UE) 2022/2065 art.
  // 16). Caricate tutte in un colpo solo (nessun parametro `status`, a
  // differenza di prima): richiesta esplicita dell'utente di conservare un
  // archivio consultabile di ogni segnalazione già gestita insieme
  // all'azione presa, non solo far sparire le righe risolte/ignorate — la
  // riga si sposta dalla sezione "aperte" a "Archivio" invece di sparire
  // del tutto, derivate entrambe qui sotto da `reports`.
  const [reports, setReports] = useState<AdminContentReport[] | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const openReports = reports?.filter((report) => report.status === "OPEN") ?? null;
  const archivedReports = reports
    ? [...reports.filter((report) => report.status !== "OPEN")].sort(
        (a, b) => new Date(b.resolvedAt ?? b.createdAt).getTime() - new Date(a.resolvedAt ?? a.createdAt).getTime(),
      )
    : null;

  // Messaggi dal form "Contatti" del footer (richiesta esplicita
  // dell'utente, al posto dell'elenco categorie "Servizi") — solo quelli
  // ancora da gestire, stesso principio già seguito per le segnalazioni
  // contenuti sopra.
  const [contactMessages, setContactMessages] = useState<AdminContactMessage[] | null>(null);
  const [contactMessagesError, setContactMessagesError] = useState<string | null>(null);

  function reloadReports() {
    if (!token) return;
    apiClient
      .adminListContentReports(token)
      .then(setReports)
      .catch((err) => setReportsError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }

  function reloadContactMessages() {
    if (!token) return;
    apiClient
      .adminListContactMessages(token)
      .then(setContactMessages)
      .catch((err) => setContactMessagesError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    apiClient
      .adminListUsers(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
    apiClient
      .adminListWaitlist(token)
      .then(setWaitlist)
      .catch((err) => setWaitlistError(err instanceof Error ? err.message : "Errore nel caricamento."));
    reloadReports();
    reloadContactMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per continuare
          </H1>
          <Link href="/accedi?redirect=/admin" style={{ textDecoration: "none" }}>
            <Button size="$5">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (user.role !== "ADMIN") {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$3" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accesso riservato
          </H1>
          <Paragraph color={brand.grafite70} textAlign="center">
            Questa pagina è visibile solo agli amministratori.
          </Paragraph>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={800} gap="$6">
        <H1 size="$8">Utenti registrati</H1>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        {data === null && !error ? (
          <LoadingState />
        ) : data ? (
          <>
            <UserGroup title={`Amministratori (${data.admins.length})`} rows={data.admins} showBusiness={false} />
            <UserGroup title={`Professionisti (${data.professionals.length})`} rows={data.professionals} showBusiness />
            <UserGroup title={`Clienti (${data.clients.length})`} rows={data.clients} showBusiness={false} />
          </>
        ) : null}

        <YStack gap="$3">
          <H2 size="$6">Segnalazioni contenuti</H2>
          {reportsError ? (
            <Text color={brand.urgenza}>{reportsError}</Text>
          ) : openReports === null ? (
            <LoadingState />
          ) : openReports.length === 0 ? (
            <Text color={brand.grafite70}>Nessuna segnalazione aperta.</Text>
          ) : (
            <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
              {openReports.map((report, index) => (
                <ReportRow key={report.id} report={report} zebra={index % 2 !== 0} token={token} onResolved={reloadReports} />
              ))}
            </YStack>
          )}
        </YStack>

        <YStack gap="$3">
          <H2 size="$6">Archivio segnalazioni</H2>
          {reportsError ? null : archivedReports === null ? (
            <LoadingState />
          ) : archivedReports.length === 0 ? (
            <Text color={brand.grafite70}>Nessuna segnalazione gestita finora.</Text>
          ) : (
            <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
              {archivedReports.map((report, index) => (
                <ArchivedReportRow key={report.id} report={report} zebra={index % 2 !== 0} />
              ))}
            </YStack>
          )}
        </YStack>

        <YStack gap="$3">
          <H2 size="$6">Messaggi di contatto</H2>
          {contactMessagesError ? (
            <Text color={brand.urgenza}>{contactMessagesError}</Text>
          ) : contactMessages === null ? (
            <LoadingState />
          ) : contactMessages.length === 0 ? (
            <Text color={brand.grafite70}>Nessun messaggio da gestire.</Text>
          ) : (
            <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
              {contactMessages.map((message, index) => (
                <ContactMessageRow
                  key={message.id}
                  message={message}
                  zebra={index % 2 !== 0}
                  token={token}
                  onResolved={reloadContactMessages}
                />
              ))}
            </YStack>
          )}
        </YStack>

        <YStack gap="$3">
          <H2 size="$6">Lista d&apos;attesa (&quot;Arriviamo presto nella tua zona&quot;)</H2>
          {waitlistError ? (
            <Text color={brand.urgenza}>{waitlistError}</Text>
          ) : waitlist === null ? (
            <LoadingState />
          ) : waitlist.length === 0 ? (
            <Text color={brand.grafite70}>Nessuna email raccolta finora.</Text>
          ) : (
            <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
              {waitlist.map((row, index) => (
                <YStack
                  key={row.email}
                  flexDirection="row"
                  justifyContent="space-between"
                  alignItems="center"
                  flexWrap="wrap"
                  gap="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$3"
                  backgroundColor={index % 2 === 0 ? "transparent" : brand.gesso}
                >
                  <Text fontWeight="600">{row.email}</Text>
                  <Text fontSize="$2" color={brand.grafite70}>
                    {new Date(row.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
                  </Text>
                </YStack>
              ))}
            </YStack>
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}

function UserGroup({ title, rows, showBusiness }: { title: string; rows: AdminUserRow[]; showBusiness: boolean }) {
  return (
    <YStack gap="$3">
      <H2 size="$6">{title}</H2>
      {rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessuno finora.</Text>
      ) : (
        <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
          {rows.map((row, index) => (
            <YStack
              key={row.email ?? index}
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              flexWrap="wrap"
              gap="$2"
              paddingHorizontal="$3"
              paddingVertical="$3"
              backgroundColor={index % 2 === 0 ? "transparent" : brand.gesso}
            >
              <YStack gap="$1" minWidth={200}>
                <Text fontWeight="600">{row.email ?? "—"}</Text>
                <Text fontSize="$2" color={brand.grafite70}>
                  {[row.name, row.surname].filter(Boolean).join(" ") || "—"}
                  {showBusiness && row.businessName ? ` · ${row.businessName}` : ""}
                </Text>
              </YStack>
              <Text fontSize="$2" color={brand.grafite70}>
                {new Date(row.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
              </Text>
            </YStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}

const REPORT_TARGET_LABEL: Record<AdminContentReport["targetType"], string> = {
  PROFESSIONAL_PROFILE: "Profilo professionista",
  REVIEW: "Recensione",
  CLIENT_REVIEW: "Recensione sul cliente",
};

/**
 * Costruisce il link pubblico verso il contenuto segnalato, quando esiste
 * — richiesta esplicita dell'utente ("aggiungi un pulsante dove ti porta
 * alla segnalazione"). Nessun link per una recensione sul cliente: non ha
 * una pagina pubblica in questo marketplace (CLAUDE.md §40/§45), un
 * bottone verso il nulla non sarebbe stato onesto.
 */
function reportTargetHref(report: AdminContentReport): string | null {
  if (report.targetType === "PROFESSIONAL_PROFILE") {
    return `/professionista/${report.targetId}`;
  }
  if (report.targetType === "REVIEW" && report.linkedProfessionalProfileId) {
    return `/professionista/${report.linkedProfessionalProfileId}#recensione-${report.targetId}`;
  }
  return null;
}

/**
 * Stile condiviso dai tre bottoni di una riga segnalazione — stessa
 * dimensione/forma/font per tutti (richiesta esplicita dell'utente: "devono
 * essere uniformi nelle dimensioni e nell'aspetto, il colore può essere
 * differente"), un solo colore libero per bottone invece dei quattro
 * `variant` di `Button` (che mescolavano un riempimento pieno con uno
 * "ghost" trasparente, la causa reale della disuniformità segnalata).
 */
const REPORT_ACTION_STYLE = {
  height: 34,
  paddingHorizontal: 16,
  borderRadius: 999,
  fontSize: 13,
  fontWeight: "700" as const,
  borderWidth: 0,
};

function ReportActionButton({
  label,
  backgroundColor,
  color,
  onPress,
  disabled,
}: {
  label: string;
  backgroundColor: string;
  color: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Button {...REPORT_ACTION_STYLE} backgroundColor={backgroundColor} color={color} disabled={disabled} onPress={onPress}>
      {label}
    </Button>
  );
}

function ReportRow({
  report,
  zebra,
  token,
  onResolved,
}: {
  report: AdminContentReport;
  zebra: boolean;
  token: string;
  onResolved: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetHref = reportTargetHref(report);

  async function resolve(status: "RESOLVED" | "DISMISSED") {
    setIsSubmitting(true);
    try {
      await apiClient.adminResolveContentReport(token, report.id, status);
      onResolved();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack gap="$2" paddingHorizontal="$3" paddingVertical="$3" backgroundColor={zebra ? brand.gesso : "transparent"}>
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1" minWidth={220} flex={1}>
          <Text fontWeight="600">
            {REPORT_TARGET_LABEL[report.targetType]}
            {report.targetLabel ? ` · ${report.targetLabel}` : ""}
          </Text>
          <Text fontSize="$2" color={brand.grafite}>
            {report.reason}
          </Text>
          {report.details ? (
            <Text fontSize="$2" color={brand.grafite70}>
              {report.details}
            </Text>
          ) : null}
          <Text fontSize="$1" color={brand.grafite70}>
            Da {report.reporterName ?? report.reporterEmail ?? "un utente"} ·{" "}
            {new Date(report.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </YStack>
        <YStack flexDirection="row" gap="$2" flexWrap="wrap">
          {targetHref ? (
            <Link href={targetHref} target="_blank" style={{ textDecoration: "none" }}>
              <ReportActionButton label="Vai alla segnalazione" backgroundColor={brand.cianografia} color="white" />
            </Link>
          ) : null}
          <ReportActionButton
            label="Risolvi"
            backgroundColor={brand.verificato}
            color="white"
            disabled={isSubmitting}
            onPress={() => resolve("RESOLVED")}
          />
          <ReportActionButton
            label="Ignora"
            backgroundColor={brand.filetto}
            color={brand.grafite}
            disabled={isSubmitting}
            onPress={() => resolve("DISMISSED")}
          />
        </YStack>
      </YStack>
    </YStack>
  );
}

const REPORT_STATUS_LABEL: Record<"RESOLVED" | "DISMISSED", string> = {
  RESOLVED: "Risolta",
  DISMISSED: "Ignorata",
};

/**
 * Riga di sola lettura per una segnalazione già gestita — richiesta
 * esplicita dell'utente: un'azione presa deve sparire dall'elenco delle
 * aperte ma restare consultabile in un archivio insieme all'azione
 * intrapresa, non sparire del tutto. Stesso bottone "Vai alla
 * segnalazione" di `ReportRow` (quando il contenuto ha ancora una pagina
 * pubblica raggiungibile), nessun bottone Risolvi/Ignora: qui l'azione è
 * già stata presa, mostrata come etichetta invece che come controllo.
 */
function ArchivedReportRow({ report, zebra }: { report: AdminContentReport; zebra: boolean }) {
  const targetHref = reportTargetHref(report);
  const isResolved = report.status === "RESOLVED";

  return (
    <YStack gap="$2" paddingHorizontal="$3" paddingVertical="$3" backgroundColor={zebra ? brand.gesso : "transparent"}>
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1" minWidth={220} flex={1}>
          <Text fontWeight="600">
            {REPORT_TARGET_LABEL[report.targetType]}
            {report.targetLabel ? ` · ${report.targetLabel}` : ""}
          </Text>
          <Text fontSize="$2" color={brand.grafite}>
            {report.reason}
          </Text>
          {report.details ? (
            <Text fontSize="$2" color={brand.grafite70}>
              {report.details}
            </Text>
          ) : null}
          <Text fontSize="$1" color={brand.grafite70}>
            Da {report.reporterName ?? report.reporterEmail ?? "un utente"} ·{" "}
            {new Date(report.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
            {report.resolvedAt
              ? ` · Gestita il ${new Date(report.resolvedAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}`
              : ""}
          </Text>
        </YStack>
        <YStack flexDirection="row" gap="$2" flexWrap="wrap" alignItems="center">
          {targetHref ? (
            <Link href={targetHref} target="_blank" style={{ textDecoration: "none" }}>
              <ReportActionButton label="Vai alla segnalazione" backgroundColor={brand.cianografia} color="white" />
            </Link>
          ) : null}
          <YStack
            height={REPORT_ACTION_STYLE.height}
            paddingHorizontal={REPORT_ACTION_STYLE.paddingHorizontal}
            borderRadius={REPORT_ACTION_STYLE.borderRadius}
            backgroundColor={isResolved ? brand.verificato : brand.filetto}
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize={REPORT_ACTION_STYLE.fontSize} fontWeight={REPORT_ACTION_STYLE.fontWeight} color={isResolved ? "white" : brand.grafite}>
              {REPORT_STATUS_LABEL[report.status as "RESOLVED" | "DISMISSED"]}
            </Text>
          </YStack>
        </YStack>
      </YStack>
    </YStack>
  );
}

const CONTACT_ROLE_LABEL: Record<AdminContactMessage["role"], string> = {
  CLIENT: "Cliente",
  PROFESSIONAL: "Professionista",
  OTHER: "Altro",
};

function ContactMessageRow({
  message,
  zebra,
  token,
  onResolved,
}: {
  message: AdminContactMessage;
  zebra: boolean;
  token: string;
  onResolved: () => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function resolve() {
    setIsSubmitting(true);
    try {
      await apiClient.adminResolveContactMessage(token, message.id);
      onResolved();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack gap="$2" paddingHorizontal="$3" paddingVertical="$3" backgroundColor={zebra ? brand.gesso : "transparent"}>
      <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
        <YStack gap="$1" minWidth={220} flex={1}>
          <Text fontWeight="600">
            {message.email} · {CONTACT_ROLE_LABEL[message.role]}
          </Text>
          <Text fontSize="$2" color={brand.grafite}>
            {message.content}
          </Text>
          <Text fontSize="$1" color={brand.grafite70}>
            {new Date(message.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </YStack>
        <Button size="$2" disabled={isSubmitting} onPress={resolve}>
          Segna come gestito
        </Button>
      </YStack>
    </YStack>
  );
}
