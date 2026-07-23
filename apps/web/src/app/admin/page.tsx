"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminUserRow, AdminUsersByRole } from "@professionisti/api-client";
import { Button, H1, H2, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

export default function AdminPage() {
  const { user, token, isLoading } = useAuth();
  const [data, setData] = useState<AdminUsersByRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || user?.role !== "ADMIN") return;
    apiClient
      .adminListUsers(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
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
          <Paragraph color="$color10" textAlign="center">
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

        {error ? <Text color="$red10">{error}</Text> : null}

        {data === null && !error ? (
          <Text color="$color9">Caricamento...</Text>
        ) : data ? (
          <>
            <UserGroup title={`Professionisti (${data.professionals.length})`} rows={data.professionals} showBusiness />
            <UserGroup title={`Clienti (${data.clients.length})`} rows={data.clients} showBusiness={false} />
          </>
        ) : null}
      </YStack>
    </YStack>
  );
}

function UserGroup({ title, rows, showBusiness }: { title: string; rows: AdminUserRow[]; showBusiness: boolean }) {
  return (
    <YStack gap="$3">
      <H2 size="$6">{title}</H2>
      {rows.length === 0 ? (
        <Text color="$color9">Nessuno finora.</Text>
      ) : (
        <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" overflow="hidden">
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
              backgroundColor={index % 2 === 0 ? "transparent" : "$color2"}
            >
              <YStack gap="$1" minWidth={200}>
                <Text fontWeight="600">{row.email ?? "—"}</Text>
                <Text fontSize="$2" color="$color10">
                  {[row.name, row.surname].filter(Boolean).join(" ") || "—"}
                  {showBusiness && row.businessName ? ` · ${row.businessName}` : ""}
                </Text>
              </YStack>
              <Text fontSize="$2" color="$color9">
                {new Date(row.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
              </Text>
            </YStack>
          ))}
        </YStack>
      )}
    </YStack>
  );
}
