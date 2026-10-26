"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ApiError, type AdminOverview, type AdminTwoFactorStatus } from "@professionisti/api-client";
import { Button, H1, Paragraph, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ADMIN_NAV_ITEMS, AdminNav } from "@/components/admin/AdminNav";
import { AdminCommandPalette } from "@/components/admin/AdminCommandPalette";
import { adminCan } from "@professionisti/shared";
import { AdminOverviewContext } from "@/components/admin/AdminOverviewContext";
import { AdminTwoFactorGate } from "@/components/admin/AdminTwoFactorGate";

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
  const { user, token, isLoading, login } = useAuth();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const isAdmin = user?.role === "ADMIN";
  const adminRoles = isAdmin ? (user?.adminRoles ?? []) : [];
  // Verifica in due passaggi (docs/CHANGELOG.md §351): riletta a ogni cambio
  // pagina, così dopo 8 ore il codice viene richiesto alla navigazione
  // successiva invece di far fallire le pagine una per una.
  const [twoFactor, setTwoFactor] = useState<AdminTwoFactorStatus | null>(null);
  const [twoFactorError, setTwoFactorError] = useState(false);
  const [twoFactorAttempt, setTwoFactorAttempt] = useState(0);
  const verified = Boolean(isAdmin && token && twoFactor?.verified);

  useEffect(() => {
    if (!token || !isAdmin) return;
    let cancelled = false;
    apiClient
      .adminTwoFactorStatus(token)
      .then((status) => {
        if (cancelled) return;
        setTwoFactor(status);
        setTwoFactorError(false);
      })
      .catch(() => {
        if (!cancelled) setTwoFactorError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, isAdmin, pathname, twoFactorAttempt]);

  // ⌘K / Ctrl+K apre la ricerca globale ovunque nel pannello.
  useEffect(() => {
    if (!isAdmin) return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isAdmin]);

  // Ricaricati a ogni cambio pagina: i numeri nel menu restano allineati
  // dopo aver gestito una segnalazione o un messaggio.
  function refreshOverview() {
    if (!token || !verified) return;
    apiClient
      .adminOverview(token)
      .then(setOverview)
      .catch((err: unknown) => {
        setOverview(null);
        // Codice scaduto mentre la pagina era aperta: si torna alla richiesta del codice.
        if (err instanceof ApiError && err.code === "ADMIN_2FA_REQUIRED") setTwoFactorAttempt((n) => n + 1);
      });
  }
  useEffect(() => {
    refreshOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, verified, pathname]);

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

  if (!twoFactor) {
    if (!twoFactorError) return null;
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$3" alignItems="center">
          <Paragraph color={brand.grafite70} textAlign="center">
            Non riusciamo a raggiungere il server. Controlla la connessione e riprova.
          </Paragraph>
          <Button variant="secondary" onPress={() => setTwoFactorAttempt((n) => n + 1)}>
            Riprova
          </Button>
        </YStack>
      </YStack>
    );
  }

  if (!twoFactor.verified) {
    return (
      <AdminTwoFactorGate
        key={twoFactor.enabled ? "verifica" : "attivazione"}
        token={token}
        enabled={twoFactor.enabled}
        onVerified={async (newToken) => {
          await login(newToken);
          setTwoFactor({ ...twoFactor, enabled: true, verified: true });
        }}
      />
    );
  }

  // Sezione fuori dal ruolo (link diretto): messaggio chiaro invece di una
  // pagina che fallisce con un errore dell'API (docs/CHANGELOG.md §145).
  const section = [...ADMIN_NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => (item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href)));
  const allowed = !section || adminCan(adminRoles, section.scope);

  return (
    <AdminOverviewContext.Provider value={{ overview, refresh: refreshOverview }}>
      <div className="admin-shell">
        <AdminNav overview={overview} adminRoles={adminRoles} onOpenSearch={() => setSearchOpen(true)} />
        <main className="admin-main">
          {allowed ? (
            children
          ) : (
            <YStack gap="$2" paddingVertical="$6">
              <H1 size="$7">Sezione non disponibile</H1>
              <Paragraph color={brand.grafite70}>Questa sezione non rientra nel tuo ruolo di amministratore.</Paragraph>
            </YStack>
          )}
        </main>
      </div>
      <AdminCommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} token={token} adminRoles={adminRoles} />
    </AdminOverviewContext.Provider>
  );
}
