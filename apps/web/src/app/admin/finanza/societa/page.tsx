"use client";

import { YStack } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { AdminInvoicesSection } from "@/components/admin/AdminInvoicesSection";
import { AdminFeeRulesSection } from "@/components/admin/AdminFeeRulesSection";

/**
 * Fisco e fatture → Società e commercialista (riordino del 24/11/2026,
 * docs/changelog/2026-11-24-fatture-del-mese-zip.md): i dati di chi emette le
 * fatture, l'invio allo SdI con la prova, il commercialista della società e le
 * regole di commissione. Cose che si impostano una volta, separate dal lavoro
 * di ogni mese in "Fatture emesse".
 */
export default function AdminSocietaPage() {
  const { token } = useAuth();
  if (!token) return null;
  return (
    <YStack gap="7">
      <AdminInvoicesSection token={token} view="company" />
      <AdminFeeRulesSection token={token} />
    </YStack>
  );
}
