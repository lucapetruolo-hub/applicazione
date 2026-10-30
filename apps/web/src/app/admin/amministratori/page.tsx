"use client";

import { Suspense } from "react";
import { AdminUsersList } from "@/components/admin/AdminUsersList";

/** Impostazioni → Amministratori: chi entra in Admin e con quale ruolo. Prima i ruoli si vedevano solo aprendo le schede utente una per una. (docs/changelog/2026-10-30-admin-riordino.md) */
export default function AdminAmministratoriPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersList preset={{ role: "ADMIN" }} title="Amministratori" intro="Ruoli e verifica in due passaggi si cambiano dalla scheda di ognuno." />
    </Suspense>
  );
}
