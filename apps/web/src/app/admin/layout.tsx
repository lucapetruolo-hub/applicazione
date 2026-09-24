"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminOverview } from "@professionisti/api-client";
import { Button, H1, Paragraph, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { AdminOverviewContext } from "@/components/admin/AdminOverviewContext";

/**
 * Guscio comune dell'area admin (docs/CHANGELOG.md §144, scelta "A"
 * dell'utente): menu sempre visibile — colonna a sinistra su schermi larghi,
 * barra orizzontale scorrevole su telefono — e una sotto-pagina per sezione
 * invece della vecchia pagina unica con le cose da fare in fondo. Il
 * controllo "solo admin" vive qui una volta sola; `/admin/promuovi` resta
 * fuori (serve proprio a diventare il primo admin).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, token, isLoading } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const isAdmin = user?.role === "ADMIN";

  // Ricaricati a ogni cambio pagina: i numeri nel menu restano allineati
  // dopo aver gestito una segnalazione o un messaggio.
  function refreshOverview() {
    if (!token || !isAdmin) return;
    apiClient
      .adminOverview(token)
      .then(setOverview)
      .catch(() => setOverview(null));
  }
  useEffect(() => {
    refreshOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAdmin, pathname]);

  if (pathname === "/admin/promuovi") return <>{children}</>;
  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per continuare
          </H1>
          <Link href={`/accedi?redirect=${pathname}`} style={{ textDecoration: "none" }}>
            <Button size="$5">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!isAdmin) {
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
    <AdminOverviewContext.Provider value={{ overview, refresh: refreshOverview }}>
      <div className="admin-shell">
        <AdminNav overview={overview} />
        <main className="admin-main">{children}</main>
      </div>
    </AdminOverviewContext.Provider>
  );
}
