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
  // 16): solo quelle ancora aperte, le altre restano nello storico DB ma
  // non ingombrano la pagina una volta gestite.
  const [reports, setReports] = useState<AdminContentReport[] | null>(null);
  const [reportsError, setReportsError] = useState<string | null>(null);

  // Messaggi dal form "Contatti" del footer (richiesta esplicita
  // dell'utente, al posto dell'elenco categorie "Servizi") — solo quelli
  // ancora da gestire, stesso principio già seguito per le segnalazioni
  // contenuti sopra.
  const [contactMessages, setContactMessages] = useState<AdminContactMessage[] | null>(null);
  const [contactMessagesError, setContactMessagesError] = useState<string | null>(null);

  function reloadReports() {
    if (!token) return;
    apiClient
      .adminListContentReports(token, "OPEN")
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
          ) : reports === null ? (
            <LoadingState />
          ) : reports.length === 0 ? (
            <Text color={brand.grafite70}>Nessuna segnalazione aperta.</Text>
          ) : (
            <YStack backgroundColor={brand.calce} borderRadius={16} overflow="hidden">
              {reports.map((report, index) => (
                <ReportRow key={report.id} report={report} zebra={index % 2 !== 0} token={token} onResolved={reloadReports} />
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
        <YStack flexDirection="row" gap="$2">
          <Button size="$2" disabled={isSubmitting} onPress={() => resolve("RESOLVED")}>
            Risolvi
          </Button>
          <Button size="$2" variant="ghost" disabled={isSubmitting} onPress={() => resolve("DISMISSED")}>
            Ignora
          </Button>
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
