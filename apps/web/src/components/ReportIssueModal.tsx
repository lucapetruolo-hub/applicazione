"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { BAD_WORK_REPORT_DAYS, JOB_ISSUE_LABEL, NO_SHOW_REPORT_DAYS, type JobIssueType, type ReportJobIssueInput } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { MediaPreview } from "@/components/MediaPreview";
import { UploadingDots } from "@/components/UploadingDots";

const MAX_PHOTOS = 5;

const HINT: Record<JobIssueType, string> = {
  NO_SHOW: `Dalla fine dell'appuntamento, entro ${NO_SHOW_REPORT_DAYS} giorni.`,
  BAD_WORK: `Entro ${BAD_WORK_REPORT_DAYS} giorni dalla fine del lavoro, anche per difetti scoperti dopo.`,
};

/**
 * "Segnala un problema" (docs/CHANGELOG.md §164, decisione dell'utente):
 * il cliente sceglie tra mancata presentazione e lavoro non andato bene
 * (solo quelli ammessi adesso, `allowedTypes`), descrive cosa è successo e
 * può allegare foto/video. Prima fase in chat col professionista (§165);
 * se non si accordano decide il nostro team. Sostituisce il vecchio popup "Non
 * presentato"; i contatti del professionista restano visibili per provare
 * prima a sentirlo.
 */
export function ReportIssueModal({
  businessName,
  phone,
  email,
  allowedTypes,
  onClose,
  onSubmit,
  uploadPhoto,
  onOpenChat,
}: {
  businessName: string;
  phone: string | null;
  email: string | null;
  allowedTypes: JobIssueType[];
  onClose: () => void;
  onSubmit: (input: ReportJobIssueInput) => Promise<void>;
  uploadPhoto: (file: File) => Promise<string>;
  /** Apre la chat col professionista: prima fase della segnalazione (§165). Assente senza chat (prenotazione dall'agenda). */
  onOpenChat?: () => void;
}) {
  const [type, setType] = useState<JobIssueType | null>(allowedTypes.length === 1 ? (allowedTypes[0] ?? null) : null);
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const url = await uploadPhoto(file);
      setPhotoUrls((prev) => [...prev, url].slice(0, MAX_PHOTOS));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il caricamento.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!type) {
      setError("Scegli cosa è successo.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Descrivi cosa è successo (almeno 10 caratteri).");
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit({ type, description: description.trim(), photoUrls });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Segnala un problema"
      style={{
        position: "fixed",
        inset: 0,
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
        maxWidth={520}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
        marginVertical="$6"
      >
        {sent ? (
          <YStack gap="$3">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              Segnalazione inviata
            </Text>
            {onOpenChat ? (
              <>
                <Text color={brand.grafite70}>
                  Abbiamo avvisato {businessName} e gli abbiamo scritto in chat cosa è successo. Come primo passo provate a trovare una soluzione
                  insieme in chat. Se non ci riuscite, dalla scheda del lavoro puoi chiedere al nostro team di decidere.
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  <Button variant="primary" size="$3" height={44} onPress={onOpenChat}>
                    Apri la chat
                  </Button>
                  <Button variant="ghost" size="$3" height={44} onPress={onClose}>
                    Chiudi
                  </Button>
                </XStack>
              </>
            ) : (
              <>
                <Text color={brand.grafite70}>
                  Abbiamo avvisato {businessName}, che può rispondere con la sua versione. Il nostro team esamina la segnalazione e ti comunica la
                  decisione. Dopo la decisione potrai lasciare la recensione.
                </Text>
                <Button variant="primary" size="$3" height={44} alignSelf="flex-start" onPress={onClose}>
                  Chiudi
                </Button>
              </>
            )}
          </YStack>
        ) : (
          <>
            <YStack gap="$1">
              <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
                Segnala un problema
              </Text>
              <Text fontSize="$3" color={brand.grafite70}>
                {onOpenChat
                  ? `Come primo passo proverete a risolvere in chat con ${businessName}. Se non vi accordate, decide il nostro team dopo aver sentito entrambi.`
                  : `Il nostro team esamina ogni segnalazione e sente anche ${businessName} prima di decidere.`}
              </Text>
            </YStack>

            <YStack gap="$2" role="radiogroup" aria-label="Cosa è successo">
              {(["NO_SHOW", "BAD_WORK"] as const).map((option) => {
                const enabled = allowedTypes.includes(option);
                const selected = type === option;
                return (
                  <YStack
                    key={option}
                    padding="$3"
                    borderRadius="$3"
                    borderWidth={selected ? 2 : 1}
                    borderColor={selected ? brand.cianografia : brand.filetto}
                    opacity={enabled ? 1 : 0.5}
                    cursor={enabled ? "pointer" : "not-allowed"}
                    onPress={() => enabled && setType(option)}
                    accessibilityRole="radio"
                    aria-checked={selected}
                    aria-disabled={!enabled}
                  >
                    <Text fontWeight="700" color={brand.grafite}>
                      {JOB_ISSUE_LABEL[option]}
                    </Text>
                    <Text fontSize="$2" color={brand.grafite70}>
                      {enabled ? HINT[option] : `Non disponibile adesso. ${HINT[option]}`}
                    </Text>
                  </YStack>
                );
              })}
            </YStack>

            {type === "NO_SHOW" && (phone || email) ? (
              <Text fontSize="$2" color={brand.grafite70}>
                Se non l&apos;hai già fatto, prova a sentire {businessName}
                {phone ? `: ${phone}` : ""}
                {email ? `${phone ? " · " : ": "}${email}` : ""}.
              </Text>
            ) : null}

            <YStack gap="$1">
              <Text fontSize="$2" color={brand.grafite70}>
                Cosa è successo? *
              </Text>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                placeholder={type === "NO_SHOW" ? "Es. ho aspettato fino alle 11, non ha risposto al telefono" : "Es. la perdita è ricominciata il giorno dopo"}
                aria-label="Cosa è successo"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: 96,
                  padding: 10,
                  borderRadius: 4,
                  border: `1px solid ${brand.filetto}`,
                  fontSize: 14,
                  fontFamily: "inherit",
                  color: brand.grafite,
                  resize: "vertical",
                }}
              />
            </YStack>

            <YStack gap="$1">
              <Text fontSize="$2" color={brand.grafite70}>
                Foto o video (opzionale, fino a {MAX_PHOTOS})
              </Text>
              <XStack flexWrap="wrap" gap="$2">
                {photoUrls.map((url) => (
                  <YStack key={url} width={64} height={64} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                    <MediaPreview url={url} />
                    <YStack
                      position="absolute"
                      top={2}
                      right={2}
                      width={18}
                      height={18}
                      borderRadius={9}
                      backgroundColor="rgba(20,24,30,0.7)"
                      alignItems="center"
                      justifyContent="center"
                      cursor="pointer"
                      onPress={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                      accessibilityRole="button"
                      accessibilityLabel="Rimuovi foto"
                    >
                      <X size={11} strokeWidth={2} color="white" />
                    </YStack>
                  </YStack>
                ))}
                {photoUrls.length < MAX_PHOTOS ? (
                  <YStack
                    width={64}
                    height={64}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor={brand.filetto}
                    borderStyle="dashed"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    opacity={isUploading ? 0.6 : 1}
                    onPress={() => !isUploading && inputRef.current?.click()}
                    accessibilityRole="button"
                    accessibilityLabel="Aggiungi foto"
                  >
                    {isUploading ? (
                      <UploadingDots dotSize={6} />
                    ) : (
                      <Text fontSize="$6" color={brand.grafite70}>
                        +
                      </Text>
                    )}
                  </YStack>
                ) : null}
              </XStack>
              <input ref={inputRef} type="file" accept="image/*,video/*" onChange={handlePhoto} disabled={isUploading} style={{ display: "none" }} />
            </YStack>

            {error ? (
              <Text color={brand.urgenza} fontSize="$3">
                {error}
              </Text>
            ) : null}

            <XStack gap="$2" flexWrap="wrap">
              <Button variant="urgent" size="$3" height={44} onPress={handleSubmit} disabled={isSaving || isUploading} opacity={isSaving ? 0.6 : 1}>
                {isSaving ? "Invio..." : "Invia segnalazione"}
              </Button>
              <Button variant="ghost" size="$3" height={44} onPress={onClose} disabled={isSaving}>
                Annulla
              </Button>
            </XStack>
          </>
        )}
      </YStack>
    </div>
  );
}
