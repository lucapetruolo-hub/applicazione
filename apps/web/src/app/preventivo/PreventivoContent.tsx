"use client";

import { Suspense } from "react";
import { GuidedRequestForm } from "@/components/GuidedRequestForm";

export function PreventivoContent() {
  return (
    <Suspense fallback={null}>
      <GuidedRequestForm
        isUrgent={false}
        basePath="/preventivo"
        title="Richiedi un preventivo gratuito"
        subtitle="Descrivi il lavoro: lo inviamo subito ai professionisti compatibili nella tua zona."
        submitLabel="Invia richiesta"
        submittingLabel="Invio in corso..."
        descriptionPlaceholder="Es. Perdita d'acqua sotto il lavandino della cucina, serve un intervento nei prossimi giorni."
      />
    </Suspense>
  );
}
