"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatEurCents, matchesClientSearch, PROFESSIONAL_CLIENT_NOTE_MAX, type ProfessionalClient, type ProfessionalClientJob } from "@professionisti/shared";
import { Button, Chip, EmptyState, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SITE_URL } from "@/lib/siteUrl";
import { CardButton } from "@/components/CardButton";
import { ExternalJobModal } from "@/components/ExternalJobModal";
import { ItalianDateInput } from "@/components/ItalianDateInput";
import { ItalianTimeInput } from "@/components/ItalianTimeInput";
import { TimelineModal } from "@/components/TimelineModal";
import { WaitBarSignal } from "@/components/WaitBar";
import { PageLoading } from "@/components/PageLoading";

type Filter = "ALL" | "SITE" | "EXTERNAL";

const fieldStyle = { padding: 10, borderRadius: 10, border: `1px solid ${brand.bordoCampo}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite, backgroundColor: brand.calce };

const STATUS_LABEL: Record<ProfessionalClientJob["status"], string> = { SCHEDULED: "Fissato", COMPLETED: "Terminato", CANCELED: "Annullato" };
const STATUS_COLOR: Record<ProfessionalClientJob["status"], string> = { SCHEDULED: brand.cianografiaScuro, COMPLETED: brand.verificato, CANCELED: brand.grafite70 };

// Date in ora italiana scritta come UTC, come in tutta l'agenda: si leggono in UTC.
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function formatAppointment(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${day}, ${time}`;
}

/** "giovedì 20 novembre alle 9:00" per il messaggio al cliente. */
function proposalWhen(dateStr: string, time: string): string {
  const day = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return `${day} alle ${time.replace(/^0(\d)/, "$1")}`;
}

function jobsSummary(client: ProfessionalClient): string {
  const parts = [client.jobsDone === 1 ? "1 lavoro terminato" : `${client.jobsDone} lavori terminati`];
  if (client.lastJobAt) parts.push(`ultimo il ${formatDay(client.lastJobAt)}`);
  if (client.totalEurCents > 0) parts.push(formatEurCents(client.totalEurCents));
  return parts.join(" · ");
}

/**
 * Rubrica "I miei clienti" del professionista (collaudo dell'08/11, funzione
 * nuova n. 7; docs/changelog/2026-11-08-rubrica-clienti.md): i clienti dei
 * lavori presi sul sito e di quelli aggiunti a mano in Agenda, con storico,
 * nota privata e "Proponi una data". Riusa le strade che ci sono già: la chat
 * del lavoro per i clienti del sito, "Aggiungi un lavoro" dell'Agenda per gli
 * altri. I contatti di un cliente del sito compaiono solo con un lavoro
 * accettato (CLAUDE.md §5 punto 9).
 */
export default function DashboardClientiPage() {
  const { user, token, isLoading } = useAuth();
  const [clients, setClients] = useState<ProfessionalClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [chat, setChat] = useState<{ client: ProfessionalClient; message: string } | null>(null);
  const [newJobFor, setNewJobFor] = useState<ProfessionalClient | null>(null);
  const [addedFor, setAddedFor] = useState<string | null>(null);

  function load() {
    if (!token) return;
    apiClient
      .myClients(token)
      .then(setClients)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }

  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si ricarica solo al cambio di account
  }, [token, user?.isProfessional]);

  const shown = useMemo(
    () => (clients ?? []).filter((client) => (filter === "ALL" || client.kind === filter) && matchesClientSearch(client, query)),
    [clients, filter, query],
  );

  // Sagoma e barra di attesa al posto della pagina vuota (docs/changelog/2026-11-10-barra-in-ogni-attesa.md).
  if (isLoading) return <PageLoading />;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <YStack width="100%" maxWidth={480} gap="4" alignItems="center">
          <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard/clienti" style={{ textDecoration: "none" }}>
            <Button tabIndex={-1} variant="primary">
              Accedi
            </Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="9" paddingHorizontal="4">
        <Text fontFamily="heading" fontWeight="800" fontSize="7" color={brand.grafite} textAlign="center">
          Questa sezione è per i professionisti
        </Text>
      </YStack>
    );
  }

  const siteCount = clients?.filter((c) => c.kind === "SITE").length ?? 0;
  const externalCount = (clients?.length ?? 0) - siteCount;
  const bookingLink = user.professionalProfileId
    ? `${SITE_URL}/preventivo?${new URLSearchParams({ professionista: user.professionalProfileId, nomeProfessionista: user.businessName ?? "" }).toString()}`
    : null;

  return (
    <YStack width="100%" alignItems="center" paddingVertical="8" paddingHorizontal="4">
      <YStack width="100%" maxWidth={880} gap="5">
        <YStack gap="1">
          <Text render="h1" margin={0} fontFamily="heading" fontWeight="800" fontSize={30} color={brand.inchiostro}>
            I miei clienti
          </Text>
          <Text fontSize={16} color={brand.grafite70}>
            Chi ha lavorato con te, dal sito o aggiunto in agenda. Le note le vedi solo tu.
          </Text>
        </YStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}
        {clients === null && !error ? <Text color={brand.grafite70}>
            Caricamento...
            <WaitBarSignal />
          </Text> : null}

        {clients && clients.length === 0 ? (
          <EmptyState
            icon="users"
            title="Ancora nessun cliente"
            description="Qui arrivano i clienti dei preventivi accettati e dei lavori che aggiungi in Agenda."
            action={
              <Link href="/dashboard/agenda" style={{ textDecoration: "none" }}>
                <Button tabIndex={-1} variant="secondary">
                  Vai all&apos;agenda
                </Button>
              </Link>
            }
          />
        ) : null}

        {clients && clients.length > 0 ? (
          <>
            <YStack gap="3">
              <input
                type="search"
                aria-label="Cerca un cliente"
                placeholder="Cerca per nome, telefono o via"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ ...fieldStyle, width: "100%", boxSizing: "border-box" }}
              />
              <XStack gap="2" flexWrap="wrap">
                <Chip selected={filter === "ALL"} onPress={() => setFilter("ALL")}>
                  {`Tutti (${clients.length})`}
                </Chip>
                {siteCount > 0 && externalCount > 0 ? (
                  <>
                    <Chip selected={filter === "SITE"} onPress={() => setFilter("SITE")}>
                      {`Dal sito (${siteCount})`}
                    </Chip>
                    <Chip selected={filter === "EXTERNAL"} onPress={() => setFilter("EXTERNAL")}>
                      {`Aggiunti da te (${externalCount})`}
                    </Chip>
                  </>
                ) : null}
              </XStack>
            </YStack>

            {shown.length === 0 ? <Text color={brand.grafite70}>Nessun cliente trovato.</Text> : null}

            <YStack gap="3" role="list" aria-label="Clienti">
              {shown.map((client) => (
                <ClientCard
                  key={client.key}
                  client={client}
                  token={token}
                  open={openKey === client.key}
                  added={addedFor === client.key}
                  onToggle={() => setOpenKey((key) => (key === client.key ? null : client.key))}
                  onPropose={(dateStr, time) => {
                    const firstName = client.name.split(" ")[0] ?? client.name;
                    const message = `Ciao ${firstName}, per il prossimo intervento ti andrebbe bene ${proposalWhen(dateStr, time)}?${bookingLink ? ` Se ti va, chiedimi il preventivo da qui: ${bookingLink}` : ""}`;
                    setChat({ client, message });
                  }}
                  onNewJob={() => setNewJobFor(client)}
                  onNoteSaved={(note) => setClients((list) => list?.map((c) => (c.key === client.key ? { ...c, note } : c)) ?? null)}
                />
              ))}
            </YStack>
          </>
        ) : null}
      </YStack>

      {chat && chat.client.chatGuidedRequestId && user.professionalProfileId ? (
        <TimelineModal
          token={token}
          guidedRequestId={chat.client.chatGuidedRequestId}
          professionalProfileId={user.professionalProfileId}
          viewerRole="PROFESSIONAL"
          otherPartyName={chat.client.name}
          initialMessage={chat.message}
          onClose={() => setChat(null)}
        />
      ) : null}

      {newJobFor ? (
        <ExternalJobModal
          token={token}
          prefill={{ clientName: newJobFor.name, clientPhone: newJobFor.phone, address: newJobFor.address }}
          onClose={() => setNewJobFor(null)}
          onSaved={() => {
            setAddedFor(newJobFor.key);
            setNewJobFor(null);
            load();
          }}
        />
      ) : null}
    </YStack>
  );
}

function ClientCard({
  client,
  token,
  open,
  added,
  onToggle,
  onPropose,
  onNewJob,
  onNoteSaved,
}: {
  client: ProfessionalClient;
  token: string;
  open: boolean;
  added: boolean;
  onToggle: () => void;
  onPropose: (dateStr: string, time: string) => void;
  onNewJob: () => void;
  onNoteSaved: (note: string | null) => void;
}) {
  const [proposing, setProposing] = useState(false);
  const [dateStr, setDateStr] = useState("");
  const [time, setTime] = useState("09:00");
  const [note, setNote] = useState(client.note ?? "");
  const [noteState, setNoteState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const detailsId = `cliente-${client.key.replace(/[^a-zA-Z0-9]/g, "-")}`;
  const canChat = client.kind === "SITE" && client.chatGuidedRequestId !== null;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

  async function saveNote() {
    setNoteState("saving");
    try {
      const saved = await apiClient.setClientNote(token, client.key, note);
      onNoteSaved(saved.note);
      setNoteState("saved");
    } catch {
      setNoteState("error");
    }
  }

  return (
    <div role="listitem">
      <Surface gap="3" className="client-card">
        <XStack alignItems="flex-start" justifyContent="space-between" gap="3" flexWrap="wrap">
          <YStack gap={4} flex={1} minWidth={200}>
            <XStack alignItems="center" gap="2" flexWrap="wrap">
              <Text render="h2" margin={0} fontWeight="700" fontSize={18} color={brand.inchiostro}>
                {client.name}
              </Text>
              <Text fontSize={12} fontWeight="700" color={brand.grafite} paddingHorizontal={8} paddingVertical={2} borderRadius={10} backgroundColor={brand.filetto}>
                {client.kind === "SITE" ? "Dal sito" : "Aggiunto da te"}
              </Text>
            </XStack>
            <Text fontSize={14} color={brand.grafite70}>
              {jobsSummary(client)}
            </Text>
            {client.nextJobAt ? (
              <XStack alignItems="center" gap="1">
                <Icon name="calendar" size={14} strokeWidth={2} color={brand.cianografiaScuro} />
                <Text fontSize={14} fontWeight="700" color={brand.cianografiaScuro}>
                  Prossimo: {formatAppointment(client.nextJobAt)}
                </Text>
              </XStack>
            ) : null}
            {client.note && !open ? (
              <Text fontSize={14} color={brand.grafite} numberOfLines={1}>
                <Text fontSize={14} fontWeight="700" color={brand.grafite}>
                  Nota:
                </Text>{" "}
                {client.note}
              </Text>
            ) : null}
          </YStack>
        </XStack>

        <XStack gap="2" flexWrap="wrap">
          {client.phone ? (
            <a href={`tel:${client.phone.replace(/\s/g, "")}`} style={{ textDecoration: "none" }} aria-label={`Chiama ${client.name}`}>
              <CardButton tabIndex={-1} compactOnPhone>
                <XStack alignItems="center" gap="1">
                  <Icon name="phone" size={15} strokeWidth={2} color={brand.grafite} />
                  <Text color={brand.grafite} fontWeight="600" fontSize="3 xs:13px">
                    Chiama
                  </Text>
                </XStack>
              </CardButton>
            </a>
          ) : null}
          {canChat ? (
            <CardButton tone="primary" compactOnPhone onPress={() => setProposing((v) => !v)} aria-expanded={proposing}>
              Proponi una data
            </CardButton>
          ) : client.kind === "EXTERNAL" ? (
            <CardButton tone="primary" compactOnPhone onPress={onNewJob}>
              Aggiungi un lavoro
            </CardButton>
          ) : null}
          <CardButton compactOnPhone onPress={onToggle} aria-expanded={open} aria-controls={detailsId}>
            {open ? "Chiudi" : "Storico e nota"}
          </CardButton>
        </XStack>

        {added ? (
          <Text fontSize={14} color={brand.verificato} fontWeight="600" role="status">
            Lavoro aggiunto in agenda.
          </Text>
        ) : null}

        {proposing && canChat ? (
          <YStack className="client-propose" gap="2" padding="3" borderRadius="3" backgroundColor={brand.cianografiaVelo}>
            <Text fontSize={14} color={brand.grafite}>
              Scegli giorno e ora: prepariamo il messaggio nella chat con {client.name.split(" ")[0]}, lo controlli e lo mandi tu.
            </Text>
            <XStack gap="2" flexWrap="wrap" alignItems="center">
              <ItalianDateInput ariaLabel="Giorno proposto" value={dateStr} onChange={setDateStr} min={today} style={fieldStyle} />
              <ItalianTimeInput ariaLabel="Ora proposta" value={time} onChange={setTime} style={fieldStyle} />
              <CardButton tone="primary" disabled={!dateStr || !time} onPress={() => onPropose(dateStr, time)}>
                Scrivi il messaggio
              </CardButton>
            </XStack>
          </YStack>
        ) : null}

        {open ? (
          <YStack id={detailsId} gap="4" paddingTop="3" borderTopWidth={1} borderTopColor={brand.filetto}>
            {client.phone || client.email || client.address ? (
              <YStack gap="1">
                {client.phone ? <ContactLine icon="phone" text={client.phone} /> : null}
                {client.email ? <ContactLine icon="mail" text={client.email} /> : null}
                {client.address ? <ContactLine icon="map-pin" text={client.address} /> : null}
              </YStack>
            ) : null}

            <YStack gap="2">
              <Text fontWeight="700" color={brand.grafite}>
                Storico
              </Text>
              <YStack gap="0">
                {client.jobs.map((job, index) => (
                  <XStack key={job.id} gap="3" alignItems="center" justifyContent="space-between" paddingVertical="2" borderTopWidth={index === 0 ? 0 : 1} borderTopColor={brand.filetto} flexWrap="wrap">
                    <YStack gap={2} flex={1} minWidth={180}>
                      <Text fontSize={14} fontWeight="600" color={brand.grafite}>
                        {job.label}
                      </Text>
                      <Text fontSize={13} color={brand.grafite70}>
                        {formatDay(job.at)} ·{" "}
                        <Text fontSize={13} fontWeight="700" color={STATUS_COLOR[job.status]}>
                          {STATUS_LABEL[job.status]}
                        </Text>
                        {job.amountEurCents !== null && job.status !== "CANCELED" ? ` · ${formatEurCents(job.amountEurCents)}` : ""}
                      </Text>
                    </YStack>
                    <Link
                      href={job.kind === "BOOKING" && job.guidedRequestId ? `/dashboard/richieste?open=${job.guidedRequestId}` : `/dashboard/agenda?esterno=${job.id}`}
                      className="client-job-link"
                      aria-label={`Apri ${job.label} del ${formatDay(job.at)}`}
                    >
                      Apri
                    </Link>
                  </XStack>
                ))}
              </YStack>
            </YStack>

            <YStack gap="2">
              <label htmlFor={`${detailsId}-nota`} style={{ fontWeight: 700, color: brand.grafite, fontSize: 16 }}>
                Nota privata
              </label>
              <textarea
                id={`${detailsId}-nota`}
                value={note}
                maxLength={PROFESSIONAL_CLIENT_NOTE_MAX}
                onChange={(e) => {
                  setNote(e.target.value);
                  setNoteState("idle");
                }}
                placeholder="Es. citofono rotto, ha un cane, preferisce il mattino"
                rows={3}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
              <XStack gap="3" alignItems="center">
                <CardButton waitingLabel={noteState === "saving" ? "Salvataggio…" : undefined}
                  onPress={saveNote}
                  disabled={noteState === "saving" || note.trim() === (client.note ?? "")}
                  opacity={noteState !== "saving" && note.trim() === (client.note ?? "") ? 0.6 : 1}
                >
                  Salva la nota
                </CardButton>
                {noteState === "saved" ? (
                  <Text fontSize={14} color={brand.verificato} fontWeight="600" role="status">
                    Salvata
                  </Text>
                ) : null}
                {noteState === "error" ? (
                  <Text fontSize={14} color={brand.urgenza} role="alert">
                    Non salvata, riprova.
                  </Text>
                ) : null}
              </XStack>
            </YStack>
          </YStack>
        ) : null}
      </Surface>
    </div>
  );
}

function ContactLine({ icon, text }: { icon: "phone" | "mail" | "map-pin"; text: string }) {
  return (
    <XStack alignItems="center" gap="2">
      <Icon name={icon} size={15} strokeWidth={2} color={brand.grafite70} />
      <Text fontSize={14} color={brand.grafite}>
        {text}
      </Text>
    </XStack>
  );
}
