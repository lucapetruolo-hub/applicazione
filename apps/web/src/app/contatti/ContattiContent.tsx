"use client";

import { useState } from "react";
import type { ContactMessageInput } from "@professionisti/shared";
import { Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

const ROLE_OPTIONS: { value: ContactMessageInput["role"]; label: string }[] = [
  { value: "CLIENT", label: "Sono un cliente" },
  { value: "PROFESSIONAL", label: "Sono un professionista" },
  { value: "OTHER", label: "Altro" },
];

const fieldStyle = {
  padding: "16px 18px",
  borderRadius: 14,
  border: `1px solid ${brand.filetto}`,
  fontSize: 16,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box" as const,
  backgroundColor: brand.calce,
};

const COMPANY_ROWS: { icon: "file-text" | "map-pin"; label: string; value: string }[] = [
  { icon: "file-text", label: "Ragione sociale", value: "[DA COMPILARE: ragione sociale]" },
  { icon: "map-pin", label: "Sede legale", value: "[DA COMPILARE: indirizzo sede legale]" },
  { icon: "file-text", label: "P.IVA e codice fiscale", value: "[DA COMPILARE: P.IVA e codice fiscale]" },
];

/**
 * Pagina "Contatti" dedicata, ispirata a un riferimento screenshot
 * (MioDottore: form ruolo/email/messaggio + dati azienda) — richiesta
 * esplicita dell'utente, che ha corretto un giro precedente dove lo
 * stesso form viveva compresso dentro il footer, e successivamente
 * chiesto di avvicinare ulteriormente le proporzioni di font/campi al
 * riferimento e di correggere lo spazio vuoto sopra il titolo. Non usa
 * `Section` (packages/ui): quel wrapper condiviso ha 64/96px di padding
 * verticale pensato per pagine con più sezioni in sequenza — su questa
 * pagina, fatta di un solo blocco corto, lo stesso padding si leggeva
 * come uno spazio vuoto ingiustificato tra header e titolo (segnalato
 * dall'utente con screenshot). Layout/spaziatura costruiti su misura qui,
 * con un padding superiore molto più contenuto. Il messaggio viene
 * salvato per davvero (stesso endpoint POST /contact, nessun invio email
 * reale — Resend/Twilio restano rimandati, CLAUDE.md §9), visibile in
 * /admin. I dati aziendali restano segnaposto finché l'utente non
 * fornisce quelli reali — stessa convenzione già in uso per /privacy.
 */
export default function ContattiContent() {
  const [role, setRole] = useState<ContactMessageInput["role"]>("CLIENT");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit() {
    if (!email.trim() || !email.includes("@") || !content.trim()) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      await apiClient.sendContactMessage({ role, email: email.trim(), content: content.trim(), website });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor="$gesso" paddingHorizontal={24} paddingTop={40} paddingBottom={64} $gtSm={{ paddingHorizontal: 40, paddingTop: 56, paddingBottom: 96 }}>
      <YStack width="100%" maxWidth={1080} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" color={brand.grafite} fontSize={34} $gtSm={{ fontSize: 44 }}>
            Contatti
          </Text>
          <Text fontSize={17} color={brand.grafite70} maxWidth={560} lineHeight={26}>
            Scrivici per qualsiasi domanda: ti rispondiamo il prima possibile.
          </Text>
        </YStack>

        <XStack flexWrap="wrap" gap="$5" width="100%" alignItems="flex-start">
          <Surface flex={2} flexBasis={0} minWidth={340} padding="$6" gap="$4">
            <Text fontFamily="$heading" fontWeight="700" fontSize={24} color={brand.grafite}>
              Invia un messaggio
            </Text>

            {status === "done" ? (
              <Text fontSize={17} color={brand.verificato} fontWeight="600">
                Messaggio inviato. Ti risponderemo il prima possibile.
              </Text>
            ) : (
              <YStack gap="$4">
                <YStack gap="$2">
                  <Text fontSize={15} fontWeight="600" color={brand.grafite70}>
                    Chi sei?
                  </Text>
                  <select value={role} onChange={(e) => setRole(e.target.value as ContactMessageInput["role"])} style={fieldStyle}>
                    {ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </YStack>

                <input
                  type="text"
                  name="website"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
                />

                <YStack gap="$2">
                  <Text fontSize={15} fontWeight="600" color={brand.grafite70}>
                    La tua email
                  </Text>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (status === "error") setStatus("idle");
                    }}
                    placeholder="nome@esempio.it"
                    style={fieldStyle}
                  />
                </YStack>

                <YStack gap="$2">
                  <Text fontSize={15} fontWeight="600" color={brand.grafite70}>
                    Messaggio
                  </Text>
                  <textarea
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      if (status === "error") setStatus("idle");
                    }}
                    placeholder="Scrivi qui la tua richiesta..."
                    rows={7}
                    style={{ ...fieldStyle, resize: "vertical", minHeight: 160, fontFamily: "inherit" }}
                  />
                </YStack>

                <button
                  onClick={handleSubmit}
                  disabled={status === "loading"}
                  style={{
                    padding: "17px 32px",
                    borderRadius: 999,
                    border: "none",
                    backgroundColor: brand.cianografia,
                    color: "white",
                    fontSize: 17,
                    fontWeight: 700,
                    cursor: status === "loading" ? "default" : "pointer",
                    opacity: status === "loading" ? 0.6 : 1,
                    alignSelf: "flex-start",
                  }}
                >
                  {status === "loading" ? "Invio..." : "Invia"}
                </button>

                {status === "error" ? (
                  <Text fontSize={14} color={brand.urgenza}>
                    Inserisci un&apos;email valida e un messaggio.
                  </Text>
                ) : null}
              </YStack>
            )}
          </Surface>

          <Surface flex={1} flexBasis={0} minWidth={300} padding="$6" gap="$4">
            <Text fontFamily="$heading" fontWeight="700" fontSize={24} color={brand.grafite}>
              Dati dell&apos;azienda
            </Text>
            <YStack gap="$4">
              {COMPANY_ROWS.map((row) => (
                <XStack key={row.label} gap="$3" alignItems="flex-start">
                  <YStack
                    width={40}
                    height={40}
                    borderRadius={12}
                    backgroundColor={brand.cianografiaVelo}
                    alignItems="center"
                    justifyContent="center"
                    flexShrink={0}
                  >
                    <Icon name={row.icon} size={19} color={brand.cianografiaScuro} />
                  </YStack>
                  <YStack gap="$1" flex={1} minWidth={0}>
                    <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
                      {row.label}
                    </Text>
                    <Text fontSize={16} color={brand.grafite} lineHeight={23}>
                      {row.value}
                    </Text>
                  </YStack>
                </XStack>
              ))}
            </YStack>
            <Text fontSize={14} color={brand.grafite70} lineHeight={21} paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
              Questi dati verranno completati con le informazioni reali dell&apos;azienda prima del lancio definitivo (vedi anche{" "}
              <a href="/privacy" style={{ color: brand.cianografia, fontWeight: 600 }}>
                Privacy Policy
              </a>
              ).
            </Text>
          </Surface>
        </XStack>
      </YStack>
    </YStack>
  );
}
