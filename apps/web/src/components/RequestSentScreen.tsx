"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge, Button, Text, YStack, brand } from "@professionisti/ui";
import { CategoryIconBadge } from "./CategoryIconBadge";

export type RequestSentScreenProps = {
  /** Nome del professionista scelto: assente quando la richiesta va a tutti quelli della zona. */
  professionalName: string | null;
  professionalImageUrl: string | null;
  professionalVerified: boolean;
  avgResponseTimeMinutes: number | null;
  categorySlug: string;
  categoryLabels: string[];
  city: string;
  isUrgent: boolean;
  matchedProfessionals: number;
  requestsCount: number;
  /** Domanda "salvare i dati per la prossima volta?", gestita dal modulo. */
  saveDefaults: ReactNode;
};

/**
 * Pagina "Richiesta inviata" (docs/CHANGELOG.md §336): foto grande del
 * professionista (o icona della categoria) con la spunta, a chi è arrivata
 * la richiesta e cosa succede dopo, in tre passi. Niente coriandoli né
 * emoji: decisione dell'utente.
 */
export function RequestSentScreen({
  professionalName,
  professionalImageUrl,
  professionalVerified,
  avgResponseTimeMinutes,
  categorySlug,
  categoryLabels,
  city,
  isUrgent,
  matchedProfessionals,
  requestsCount,
  saveDefaults,
}: RequestSentScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // La pagina cambia sul posto dopo l'invio: si riparte dall'alto e il
  // lettore di schermo legge subito il titolo.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const categoriesText = new Intl.ListFormat("it-IT", { type: "conjunction" }).format(categoryLabels);
  const direct = Boolean(professionalName);
  const multiple = requestsCount > 1;
  const nobodyYet = matchedProfessionals === 0;

  const heading = direct ? (
    <>
      La tua richiesta è arrivata a <strong>{professionalName}</strong>
    </>
  ) : nobodyYet ? (
    multiple ? (
      "Le tue richieste sono registrate"
    ) : (
      "La tua richiesta è registrata"
    )
  ) : multiple ? (
    `Le tue ${requestsCount} richieste sono arrivate ai professionisti della zona`
  ) : (
    "La tua richiesta è arrivata ai professionisti della zona"
  );

  const note = nobodyYet
    ? "Per ora non c'è nessun professionista disponibile in zona: ti avvisiamo appena se ne iscrive uno."
    : direct
      ? [avgResponseTimeMinutes !== null ? `Di solito risponde entro ${formatResponseTime(avgResponseTimeMinutes)}.` : null, "Ti avvisiamo appena arriva il preventivo."]
          .filter(Boolean)
          .join(" ")
      : multiple
        ? "Una richiesta per categoria. Ti avvisiamo appena arrivano i preventivi."
        : "Ti avvisiamo appena arrivano i preventivi.";

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} gap="$6">
        <div className="request-sent-hero">
          <div className="request-sent-photo">
            {direct && professionalImageUrl ? (
              <Image src={professionalImageUrl} alt="" width={136} height={136} priority />
            ) : (
              <CategoryIconBadge slug={categorySlug} size={136} iconSize={60} />
            )}
            <span className="request-sent-check" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          </div>
          <p className="request-sent-yay">{nobodyYet ? "Ci siamo quasi" : "Fatto!"}</p>
          <h1 ref={headingRef} tabIndex={-1} className="request-sent-title">
            {heading}
          </h1>
          {direct && professionalVerified ? (
            <div className="request-sent-badges">
              <Badge variant="verificato">Verificato</Badge>
            </div>
          ) : null}
          <Text color={brand.grafite70} textAlign="center">
            {note}
          </Text>
        </div>

        <YStack gap="$2">
          <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
            Cosa succede adesso
          </Text>
          <ol className="request-sent-steps">
            <li className="is-done">
              <span className="request-sent-dot" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <div>
                <strong>{multiple ? "Richieste inviate" : "Richiesta inviata"}</strong>
                <span className="request-sent-meta">
                  {[categoriesText, city.trim()].filter(Boolean).join(" · ")}
                  {isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
                </span>
              </div>
            </li>
            <li>
              <span className="request-sent-dot" aria-hidden="true">
                2
              </span>
              <div>
                <strong>{direct ? "Ricevi il preventivo" : "Ricevi i preventivi"}</strong>
                <span>Voce per voce, in Le mie richieste</span>
              </div>
            </li>
            <li>
              <span className="request-sent-dot" aria-hidden="true">
                3
              </span>
              <div>
                <strong>{direct ? "Lo accetti e fissate il giorno" : "Ne scegli uno e fissate il giorno"}</strong>
                <span>Solo allora {direct ? "vede" : "vedrà"} i tuoi contatti</span>
              </div>
            </li>
          </ol>
        </YStack>

        <YStack alignItems="center" gap="$4">
          <Link href="/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Button variant="primary">Vai alle mie richieste</Button>
          </Link>
          <Link href="/" className="request-sent-home">
            Torna alla home
          </Link>
        </YStack>

        {saveDefaults}
      </YStack>
    </YStack>
  );
}

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} minuti`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "un'ora" : `${hours} ore`;
}
