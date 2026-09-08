"use client";

import { Section } from "@professionisti/ui";
import { HomeFaq } from "@/components/HomeFaq";
import { WhatIfSection } from "@/components/WhatIfSection";

export default function FaqContent() {
  return (
    <>
      <Section title="Domande frequenti" lead="Le risposte alle domande più comuni su come funziona la piattaforma." maxWidth={780} />
      <HomeFaq />
      <WhatIfSection />
    </>
  );
}
