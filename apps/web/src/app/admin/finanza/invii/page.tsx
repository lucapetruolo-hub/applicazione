"use client";

import { useAuth } from "@/lib/AuthContext";
import { AdminFiscalSendsSection } from "@/components/admin/AdminFiscalSendsSection";

/** Fisco e fatture → Registro invii (docs/changelog/2026-11-24-fatture-del-mese-zip.md). */
export default function AdminRegistroInviiPage() {
  const { token } = useAuth();
  if (!token) return null;
  return <AdminFiscalSendsSection token={token} />;
}
