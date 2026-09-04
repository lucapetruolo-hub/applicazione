"use client";

import { useEffect, useState } from "react";
import type { ExternalJob, ExternalJobInput } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

const inputStyle = { padding: 10, borderRadius: 4, border: `1px solid ${brand.filetto}`, fontSize: 14, fontFamily: "inherit", color: brand.grafite };

function toIsoDateLocal(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseEuroToCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const euros = Number(normalized);
  if (Number.isNaN(euros) || euros < 0) return null;
  return Math.round(euros * 100);
}

const STATUS_LABEL: Record<ExternalJob["status"], string> = {
  SCHEDULED: "Programmato",
  COMPLETED: "Completato",
  CANCELED: "Annullato",
};
const STATUS_COLOR: Record<ExternalJob["status"], string> = {
  SCHEDULED: brand.cianografia,
  COMPLETED: brand.verificato,
  CANCELED: brand.urgenza,
};

/**
 * Lavoro preso al di fuori della piattaforma (richiesta esplicita
 * dell'utente: "dai la possibilità di inserire un lavoro preso al di
 * fuori della piattaforma, dove poter inserire tutti i dati utili per
 * effettuare l'intervento") — stesso pattern overlay DOM grezzo già in uso
 * per CompleteJobModal/BookingDetailPanel (`role="dialog"`, chiusura con
 * Escape/click sul backdrop, `alignItems: "flex-start"` per non
 * riprodurre il bug di scroll già corretto altrove per un contenuto più
 * alto del viewport). Un solo componente per creare e modificare: se
 * `job` è assente si sta creando un lavoro nuovo, altrimenti si sta
 * modificando quello esistente (in quel caso mostra anche le azioni di
 * stato ed eliminazione).
 */
export function ExternalJobModal({
  token,
  job,
  defaultDate,
  onClose,
  onSaved,
  onDeleted,
}: {
  token: string;
  /** Assente = creazione di un nuovo lavoro. Presente = modifica di uno esistente. */
  job?: ExternalJob | null;
  /** Data precompilata quando si crea un nuovo lavoro cliccando "+" su un giorno specifico del calendario. */
  defaultDate?: Date;
  onClose: () => void;
  onSaved: (job: ExternalJob) => void;
  onDeleted?: (id: string) => void;
}) {
  const [clientName, setClientName] = useState(job?.clientName ?? "");
  const [clientPhone, setClientPhone] = useState(job?.clientPhone ?? "");
  const [address, setAddress] = useState(job?.address ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [dateStr, setDateStr] = useState(job ? job.scheduledAt.slice(0, 10) : defaultDate ? toIsoDateLocal(defaultDate) : "");
  const [startTime, setStartTime] = useState(job ? job.scheduledAt.slice(11, 16) : "");
  const [endTime, setEndTime] = useState(job?.scheduledEndAt ? job.scheduledEndAt.slice(11, 16) : "");
  const [priceEuro, setPriceEuro] = useState(job?.priceEurCents != null ? (job.priceEurCents / 100).toString() : "");
  const [notes, setNotes] = useState(job?.notes ?? "");

  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit() {
    setError(null);
    if (!clientName.trim()) {
      setError("Il nome del cliente è obbligatorio.");
      return;
    }
    if (!dateStr || !startTime) {
      setError("Indica data e orario di inizio.");
      return;
    }
    if (endTime && endTime <= startTime) {
      setError("L'orario di fine deve essere dopo l'orario di inizio.");
      return;
    }
    const priceEurCents = priceEuro.trim() ? parseEuroToCents(priceEuro) : undefined;
    if (priceEuro.trim() && priceEurCents === null) {
      setError("Inserisci un importo valido, o lascia il campo vuoto.");
      return;
    }

    // Stessa convenzione "wall clock UTC" già in uso in tutto il modulo
    // agenda (mai un vero fuso orario): la data/ora scelta è quella che il
    // professionista vedrà sempre uguale, indipendentemente dal fuso del
    // browser che la legge in seguito.
    const input: ExternalJobInput = {
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim() || undefined,
      address: address.trim() || undefined,
      description: description.trim() || undefined,
      scheduledAt: new Date(`${dateStr}T${startTime}:00.000Z`).toISOString(),
      scheduledEndAt: endTime ? new Date(`${dateStr}T${endTime}:00.000Z`).toISOString() : undefined,
      priceEurCents: priceEurCents ?? undefined,
      notes: notes.trim() || undefined,
    };

    setIsSaving(true);
    try {
      const saved = job ? await apiClient.updateExternalJob(token, job.id, input) : await apiClient.createExternalJob(token, input);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(status: "SCHEDULED" | "COMPLETED" | "CANCELED") {
    if (!job) return;
    setIsChangingStatus(true);
    setError(null);
    try {
      const updated = await apiClient.updateExternalJobStatus(token, job.id, status);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsChangingStatus(false);
    }
  }

  async function handleDelete() {
    if (!job) return;
    setIsDeleting(true);
    setError(null);
    try {
      await apiClient.deleteExternalJob(token, job.id);
      onDeleted?.(job.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setIsDeleting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={job ? "Modifica lavoro esterno" : "Aggiungi lavoro esterno"}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={480}
        marginTop="5vh"
        backgroundColor={brand.calce}
        borderRadius="$3"
        padding="$5"
        gap="$4"
      >
        <XStack justifyContent="space-between" alignItems="center">
          <YStack gap={2}>
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              {job ? "Modifica lavoro esterno" : "Aggiungi lavoro esterno"}
            </Text>
            {job ? (
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={STATUS_COLOR[job.status]}>
                {STATUS_LABEL[job.status]}
              </Text>
            ) : (
              <Text fontSize="$2" color={brand.grafite70}>
                Un lavoro preso al di fuori della piattaforma, con tutti i dati utili per svolgerlo.
              </Text>
            )}
          </YStack>
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        <YStack gap="$3">
          <YStack gap="$1">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Nome cliente *
            </Text>
            <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Es. Mario Rossi" style={inputStyle} />
          </YStack>

          <YStack gap="$1">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Telefono
            </Text>
            <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="Es. 333 1234567" style={inputStyle} />
          </YStack>

          <YStack gap="$1">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Indirizzo
            </Text>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dove si svolge l'intervento" style={inputStyle} />
          </YStack>

          <YStack gap="$1">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Descrizione del lavoro
            </Text>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cosa c'è da fare"
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </YStack>

          <XStack gap="$2" flexWrap="wrap">
            <YStack gap="$1" flex={1} minWidth={140}>
              <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
                Data *
              </Text>
              <input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} style={inputStyle} />
            </YStack>
            <YStack gap="$1" flex={1} minWidth={100}>
              <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
                Ora inizio *
              </Text>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} />
            </YStack>
            <YStack gap="$1" flex={1} minWidth={100}>
              <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
                Ora fine
              </Text>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} />
            </YStack>
          </XStack>

          <YStack gap="$1">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Prezzo concordato (€)
            </Text>
            <input value={priceEuro} onChange={(e) => setPriceEuro(e.target.value)} placeholder="Facoltativo" style={inputStyle} />
          </YStack>

          <YStack gap="$1">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Note private
            </Text>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          </YStack>
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          <Button variant="primary" size="$3" height={40} disabled={isSaving} opacity={isSaving ? 0.6 : 1} onPress={handleSubmit}>
            {isSaving ? "Salvataggio..." : "Salva"}
          </Button>
          <Button variant="ghost" size="$3" height={40} onPress={onClose}>
            Annulla
          </Button>
        </XStack>

        {job ? (
          <YStack gap="$3" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
            <XStack gap="$2" flexWrap="wrap">
              {job.status !== "COMPLETED" ? (
                <Button
                  variant="secondary"
                  size="$3"
                  height={40}
                  disabled={isChangingStatus}
                  opacity={isChangingStatus ? 0.6 : 1}
                  onPress={() => handleStatusChange("COMPLETED")}
                >
                  Segna completato
                </Button>
              ) : null}
              {job.status !== "CANCELED" ? (
                <Button
                  variant="secondary"
                  size="$3"
                  height={40}
                  disabled={isChangingStatus}
                  opacity={isChangingStatus ? 0.6 : 1}
                  onPress={() => handleStatusChange("CANCELED")}
                >
                  Annulla lavoro
                </Button>
              ) : null}
              {job.status !== "SCHEDULED" ? (
                <Button
                  variant="ghost"
                  size="$3"
                  height={40}
                  disabled={isChangingStatus}
                  opacity={isChangingStatus ? 0.6 : 1}
                  onPress={() => handleStatusChange("SCHEDULED")}
                >
                  Riapri
                </Button>
              ) : null}
            </XStack>

            {confirmingDelete ? (
              <XStack gap="$2" alignItems="center" flexWrap="wrap">
                <Text fontSize="$2" color={brand.urgenza}>
                  Eliminare definitivamente questo lavoro?
                </Text>
                <Button variant="urgent" size="$2" height={36} disabled={isDeleting} opacity={isDeleting ? 0.6 : 1} onPress={handleDelete}>
                  {isDeleting ? "Eliminazione..." : "Conferma"}
                </Button>
                <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingDelete(false)}>
                  Annulla
                </Button>
              </XStack>
            ) : (
              <Text
                fontSize="$2"
                fontWeight="600"
                color={brand.urgenza}
                alignSelf="flex-start"
                cursor="pointer"
                accessibilityRole="button"
                onPress={() => setConfirmingDelete(true)}
              >
                Elimina lavoro
              </Text>
            )}
          </YStack>
        ) : null}
      </YStack>
    </div>
  );
}
