import { redirect } from "next/navigation";

/**
 * Il tipo di attività si sceglie ora in registrazione (docs/CHANGELOG.md
 * §243) e si cambia da "Dati fiscali e pagamenti": questo vecchio indirizzo
 * resta solo per i link già salvati o arrivati per email.
 */
export default async function DashboardTipoAttivitaPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string }>;
}) {
  const { entityType } = await searchParams;
  redirect(entityType ? `/dashboard/fiscale?entityType=${encodeURIComponent(entityType)}` : "/dashboard/fiscale");
}
