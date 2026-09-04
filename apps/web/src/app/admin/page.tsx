"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminUserRow, AdminUsersByRole } from "@professionisti/api-client";
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
