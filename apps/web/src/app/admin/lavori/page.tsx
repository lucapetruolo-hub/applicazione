"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminCompletedJob } from "@professionisti/api-client";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AdminCard, AdminPageHeader, AdminPill, AdminTabs, errorMessage, formatAdminDate } from "@/components/admin/adminUi";
import { MediaPreview } from "@/components/MediaPreview";
import { SkeletonTableRows } from "@/components/Skeleton";

type Filter = "all" | "changes" | "notes";

function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
}

function quoteRange(job: AdminCompletedJob): string | null {
  if (job.quoteMinEurCents === null) return null;
  if (job.quoteMaxEurCents === null) return `da ${eur(job.quoteMinEurCents)}`;
  return job.quoteMaxEurCents === job.quoteMinEurCents ? eur(job.quoteMinEurCents) : `${eur(job.quoteMinEurCents)} – ${eur(job.quoteMaxEurCents)}`;
}

function Photos({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <XStack gap="$2" flexWrap="wrap">
      {urls.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" style={{ width: 84, height: 84, borderRadius: 8, overflow: "hidden", border: `1px solid ${brand.filetto}`, display: "block" }}>
          <MediaPreview url={url} />
        </a>
      ))}
    </XStack>
  );
}

/** Una parte (professionista o cliente): cosa ha scritto e allegato a lavoro terminato. */
function Side({ title, done, note, photos }: { title: string; done: string; note: string | null; photos: string[] }) {
  return (
    <YStack flex={1} minWidth={240} gap="$2">
      <Text fontWeight="700" color={brand.grafite}>
        {title}
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        {done}
      </Text>
      {note ? <Text color={brand.grafite}>“{note}”</Text> : <Text fontSize={13} color={brand.grafite70}>Nessuna nota.</Text>}
      <Photos urls={photos} />
    </YStack>
  );
}

/**
 * Lavori terminati (docs/CHANGELOG.md §163, richiesta esplicita
 * dell'utente): note e foto/video di professionista e cliente, importo
 * finale rispetto al preventivo e motivo delle differenze. Utile per
 * controllare la qualità e per le contestazioni.
 */
export default function AdminLavoriPage() {
  const { token } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<AdminCompletedJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setRows(null);
    apiClient
      .adminListCompletedJobs(token, filter)
      .then(setRows)
      .catch((err) => setError(errorMessage(err)));
  }, [token, filter]);

  return (
    <YStack>
      <AdminPageHeader
        title="Lavori terminati"
        description="Note e foto/video lasciate da professionista e cliente a lavoro terminato, con l'importo finale rispetto al preventivo."
      />
      <AdminTabs
        tabs={[
          { key: "all", label: "Tutti" },
          { key: "changes", label: "Differenze dal preventivo" },
          { key: "notes", label: "Con note" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      {rows === null && !error ? (
        <SkeletonTableRows rows={3} cols={4} />
      ) : rows && rows.length === 0 ? (
        <Text color={brand.grafite70}>Nessun lavoro terminato in questa vista.</Text>
      ) : rows ? (
        <YStack gap="$3">
          {rows.map((job) => {
            const range = quoteRange(job);
            return (
              <AdminCard key={job.bookingId} highlight={Boolean(job.changeReason)}>
                <XStack justifyContent="space-between" gap="$2" flexWrap="wrap">
                  <YStack gap="$1" flex={1} minWidth={220}>
                    <Text fontWeight="800" color={brand.grafite}>
                      {job.categoryLabel ?? "Prenotazione dall'agenda"}
                      {job.city ? ` · ${job.city}` : ""}
                    </Text>
                    <Text fontSize={13} color={brand.grafite70}>
                      <Link href={`/admin/utenti/${job.professional.userId}`}>{job.professional.businessName}</Link>
                      {" per "}
                      {job.client.accountDeleted ? "account eliminato" : <Link href={`/admin/utenti/${job.client.userId}`}>{job.client.name ?? "cliente"}</Link>}
                      {` · appuntamento del ${formatAdminDate(job.scheduledAt)}`}
                    </Text>
                    {job.guidedRequestId ? (
                      <Link href={`/admin/chat/${job.guidedRequestId}/${job.professional.profileId}`} style={{ fontSize: 13, fontWeight: 700 }}>
                        Leggi la chat
                      </Link>
                    ) : null}
                  </YStack>
                  <YStack alignItems="flex-end" gap="$1">
                    {job.finalAmountEurCents !== null ? (
                      <Text fontWeight="800" fontSize={18} color={brand.grafite}>
                        {eur(job.finalAmountEurCents)}
                      </Text>
                    ) : null}
                    {range ? (
                      <Text fontSize={13} color={brand.grafite70}>
                        Preventivo {range}
                      </Text>
                    ) : null}
                    {job.direction === "ABOVE" ? <AdminPill tone="danger">Più alto del preventivo</AdminPill> : null}
                    {job.direction === "BELOW" ? <AdminPill tone="warn">Più basso del preventivo</AdminPill> : null}
                  </YStack>
                </XStack>

                {job.description ? (
                  <Text fontSize={13} color={brand.grafite70}>
                    Richiesta: {job.description.length > 200 ? `${job.description.slice(0, 200)}…` : job.description}
                  </Text>
                ) : null}

                {job.finalItems.length > 0 ? (
                  <YStack gap={2}>
                    {job.finalItems.map((item, index) => (
                      <XStack key={index} justifyContent="space-between" gap="$2">
                        <Text fontSize={14} color={brand.grafite}>
                          {item.name}
                          {item.added ? "  (aggiunta)" : ""}
                        </Text>
                        <Text fontSize={14} color={brand.grafite}>
                          {eur(item.priceEurCents)}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>
                ) : null}

                {job.changeReason ? (
                  <YStack padding="$3" borderRadius={12} backgroundColor={brand.urgenzaVelo} gap="$1">
                    <Text fontWeight="700" color={brand.grafite}>
                      Motivo delle differenze (professionista)
                    </Text>
                    <Text color={brand.grafite}>“{job.changeReason}”</Text>
                  </YStack>
                ) : null}

                <XStack gap="$4" flexWrap="wrap" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
                  <Side
                    title="Professionista"
                    done={job.professionalCompleted ? "Ha segnato il lavoro come terminato." : "Non ha ancora segnato il lavoro come terminato."}
                    note={job.professionalNote}
                    photos={job.professionalPhotoUrls}
                  />
                  <Side
                    title="Cliente"
                    done={job.clientConfirmedAt ? `Ha confermato il ${formatAdminDate(job.clientConfirmedAt, true)}.` : "Non ha ancora confermato."}
                    note={job.clientNote}
                    photos={job.clientPhotoUrls}
                  />
                </XStack>
              </AdminCard>
            );
          })}
        </YStack>
      ) : null}
    </YStack>
  );
}
