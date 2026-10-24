"use client";

import { Suspense } from "react";
import { GuidedRequestForm, GuidedRequestHeading } from "@/components/GuidedRequestForm";

const TITLE = "Richiedi un preventivo gratuito";
const SUBTITLE = "Descrivi il lavoro: lo inviamo subito a tutti i professionisti della categoria che lavorano nella tua zona.";

export function PreventivoContent() {
  return (
    <Suspense fallback={<GuidedRequestHeading title={TITLE} subtitle={SUBTITLE} />}>
      <GuidedRequestForm
        isUrgent={false}
        basePath="/preventivo"
        title={TITLE}
        subtitle={SUBTITLE}
        submitLabel="Invia richiesta"
        submittingLabel="Invio in corso..."
        descriptionPlaceholder="Es. Perdita d'acqua sotto il lavandino della cucina, serve un intervento nei prossimi giorni."
      />
    </Suspense>
  );
}
