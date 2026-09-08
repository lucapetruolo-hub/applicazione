"use client";

import { useState } from "react";
import type { ContactMessageInput } from "@professionisti/shared";
import { Section, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

const ROLE_OPTIONS: { value: ContactMessageInput["role"]; label: string }[] = [
  { value: "CLIENT", label: "Sono un cliente" },
  { value: "PROFESSIONAL", label: "Sono un professionista" },
  { value: "OTHER", label: "Altro" },
];

const fieldStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  border: `1px solid ${brand.filetto}`,
  fontSize: 15,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box" as const,
};

/**
 * Pagina "Contatti" dedicata, ispirata a un riferimento screenshot
 * (MioDottore: form ruolo/email/messaggio + dati azienda) — richiesta
 * esplicita dell'utente, che ha corretto un giro precedente dove lo
 * stesso form viveva compresso dentro il footer. Il messaggio viene
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
    <Section title="Contatti" lead="Scrivici per qualsiasi domanda: ti rispondiamo il prima possibile." maxWidth={1000}>
      <XStack flexWrap="wrap" gap="$5" width="100%" alignItems="flex-start">
        <Surface flex={1} minWidth={300} padding="$5" gap="$3">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
            Invia un messaggio
          </Text>

          {status === "done" ? (
            <Text fontSize="$4" color={brand.verificato} fontWeight="600">
              Messaggio inviato. Ti risponderemo il prima possibile.
            </Text>
          ) : (
            <YStack gap="$3">
              <YStack gap="$1">
                <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
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

              <YStack gap="$1">
                <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
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

              <YStack gap="$1">
                <Text fontSize="$2" fontWeight="600" color={brand.grafite70}>
                  Messaggio
                </Text>
                <textarea
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    if (status === "error") setStatus("idle");
                  }}
                  placeholder="Scrivi qui la tua richiesta..."
                  rows={6}
                  style={{ ...fieldStyle, resize: "vertical", minHeight: 120 }}
                />
              </YStack>

              <button
                onClick={handleSubmit}
                disabled={status === "loading"}
                style={{
                  padding: "14px 20px",
                  borderRadius: 999,
                  border: "none",
                  backgroundColor: brand.cianografia,
                  color: "white",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: status === "loading" ? "default" : "pointer",
                  opacity: status === "loading" ? 0.6 : 1,
                  alignSelf: "flex-start",
                }}
              >
                {status === "loading" ? "Invio..." : "Invia"}
              </button>

              {status === "error" ? (
                <Text fontSize="$2" color={brand.urgenza}>
                  Inserisci un&apos;email valida e un messaggio.
                </Text>
              ) : null}
            </YStack>
          )}
        </Surface>

        <Surface flex={1} minWidth={280} padding="$5" gap="$2">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
            Dati dell&apos;azienda
          </Text>
          <YStack gap="$1">
            <Text fontSize="$3" color={brand.grafite70} lineHeight={22}>
              [DA COMPILARE: ragione sociale]
            </Text>
            <Text fontSize="$3" color={brand.grafite70} lineHeight={22}>
              [DA COMPILARE: indirizzo sede legale]
            </Text>
            <Text fontSize="$3" color={brand.grafite70} lineHeight={22}>
              [DA COMPILARE: P.IVA e codice fiscale]
            </Text>
          </YStack>
          <Text fontSize="$2" color={brand.grafite70} paddingTop="$2">
            Questi dati verranno completati con le informazioni reali dell&apos;azienda prima del lancio definitivo
            (vedi anche{" "}
            <a href="/privacy" style={{ color: brand.cianografia }}>
              Privacy Policy
            </a>
            ).
          </Text>
        </Surface>
      </XStack>
    </Section>
  );
}
