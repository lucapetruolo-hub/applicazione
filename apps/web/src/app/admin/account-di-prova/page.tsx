"use client";

import { Suspense } from "react";
import { AdminUsersList } from "@/components/admin/AdminUsersList";

/** Impostazioni → Account di prova: gli account segnati "Di prova" in un elenco solo. (docs/changelog/2026-10-30-admin-riordino.md) */
export default function AdminAccountDiProvaPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersList preset={{ status: "test" }} title="Account di prova" intro="Fuori da numeri e statistiche (CLAUDE.md §5 punto 17)." />
    </Suspense>
  );
}
