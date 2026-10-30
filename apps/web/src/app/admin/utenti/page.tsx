"use client";

import { Suspense } from "react";
import { AdminUsersList } from "@/components/admin/AdminUsersList";

/** Persone → Utenti: tutti gli account, con ricerca e filtri. */
export default function AdminUtentiPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersList />
    </Suspense>
  );
}
