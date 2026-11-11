"use client";

import Link from "next/link";
import { Text, YStack, brand } from "@professionisti/ui";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { AuthIconBadge } from "@/components/AuthStepHeader";

/** Riquadro della pagina "link del calendario scaduto", come quello dei promemoria. */
export function CalendarioScadutoCard({ pro, retry }: { pro: boolean; retry: boolean }) {
  return (
    <AuthPageBackground>
      <AuthCard maxWidth={440}>
        <YStack gap="4" alignItems="center">
          <AuthIconBadge icon="calendar" />
          <Text render="h1" fontFamily="heading" fontWeight="800" fontSize="8" color={brand.inchiostro} textAlign="center" style={{ textWrap: "balance" }}>
            {retry ? "Calendario non disponibile" : "Questo link non vale più"}
          </Text>
          <Text fontSize={16} color={brand.grafite70} textAlign="center">
            {retry
              ? "Riprova tra qualche istante: il link è ancora buono."
              : `Il link è scaduto o l'appuntamento è stato annullato. Lo trovi sempre aggiornato ${pro ? "in Agenda" : "nella tua richiesta"}.`}
          </Text>
          <Link href={pro ? "/dashboard/agenda" : "/le-mie-richieste"} className="auth-primary-link">
            {pro ? "Apri l'agenda" : "Le mie richieste"}
          </Link>
        </YStack>
      </AuthCard>
    </AuthPageBackground>
  );
}
