"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BoardReplyResult } from "@professionisti/shared";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@/lib/apiClient";
import styles from "@/components/requestBoard/BoardPage.module.css";

/**
 * "Rispondi" dalla bacheca "Lavori cercati" (docs/changelog/2026-11-17-bacheca-rispondi.md):
 * - senza accesso si va all'iscrizione da professionista, che si porta dietro la richiesta;
 * - con un account da professionista la richiesta entra nell'elenco e si apre;
 * - con il profilo non ancora visibile la richiesta resta da parte e arriva da sola.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type View = {
  title: string;
  text: string;
  cta?: { label: string; href: string };
};

function viewOf(result: BoardReplyResult): View {
  const trade = result.tradeLabel?.toLowerCase();
  switch (result.status) {
    case "saved":
      return {
        title: "Richiesta tenuta da parte",
        text: "Arriva nel tuo elenco appena il profilo è completo e compare nelle ricerche. Ti mancano pochi passi.",
        cta: { label: "Completa il profilo", href: "/dashboard/profilo" },
      };
    case "other-trade":
      return {
        title: "Questa richiesta è per un altro lavoro",
        text: trade
          ? `Il cliente cerca: ${trade}. Se lo fai anche tu, aggiungilo al profilo tra i tuoi lavori o le prestazioni e tocca di nuovo "Rispondi".`
          : 'Se fai questo lavoro, aggiungilo al profilo e tocca di nuovo "Rispondi".',
        cta: { label: "Vai al profilo", href: "/dashboard/profilo" },
      };
    case "too-far":
      return {
        title: "Il lavoro è troppo lontano",
        text: "Si risponde solo ai lavori entro 100 km dalla zona del tuo profilo.",
      };
    case "no-online":
      return {
        title: "Il cliente chiede un lavoro online",
        text: 'Per rispondere attiva "Offro anche consulenza online" nel profilo.',
        cta: { label: "Vai al profilo", href: "/dashboard/profilo" },
      };
    case "full":
      return {
        title: "Posti finiti",
        text: "Il cliente ha già ricevuto 5 preventivi per questa richiesta.",
      };
    default:
      return {
        title: "Richiesta non più disponibile",
        text: "Il cliente l'ha ritirata, ha già scelto o è scaduta.",
      };
  }
}

function RispondiContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, isLoading } = useAuth();
  const requestId = searchParams.get("richiesta") ?? "";
  const category = searchParams.get("categoria");
  const isNew = searchParams.get("nuovo") === "1";
  const valid = UUID.test(requestId);
  const [view, setView] = useState<View | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!valid || isLoading || started.current) return;
    if (!user || !token) {
      started.current = true;
      const params = new URLSearchParams({
        ruolo: "professionista",
        richiesta: requestId,
      });
      if (category) params.set("categoria", category);
      router.replace(`/registrati?${params.toString()}`);
      return;
    }
    if (user.role !== "PROFESSIONAL") return;
    started.current = true;
    apiClient
      .replyToBoardRequest(token, requestId)
      .then((result) => {
        if (result.status === "added" || result.status === "already") {
          router.replace(
            `/dashboard/richieste?open=${encodeURIComponent(requestId)}`,
          );
          return;
        }
        // Appena iscritto: dritto al profilo, la richiesta arriva da sola.
        if (result.status === "saved" && isNew) {
          router.replace("/dashboard/profilo");
          return;
        }
        setView(viewOf(result));
      })
      .catch(() =>
        setView({ title: "Non è andata", text: "Riprova tra poco." }),
      );
  }, [valid, isLoading, user, token, requestId, category, isNew, router]);

  const shown: View | null = !valid
    ? {
        title: "Link non valido",
        text: 'Torna alla pagina dei lavori cercati e tocca di nuovo "Rispondi".',
      }
    : user && user.role !== "PROFESSIONAL"
      ? {
          title: "Serve un account da professionista",
          text: "Sei entrato come cliente. Per rispondere ai lavori cercati esci e iscriviti come professionista.",
        }
      : view;

  return (
    <div className={styles.reply}>
      {shown ? (
        <>
          <h1 className={styles.title}>{shown.title}</h1>
          <p className={styles.lead}>{shown.text}</p>
          <div className={styles.replyActions}>
            {shown.cta ? (
              <Link className={styles.cta} href={shown.cta.href}>
                {shown.cta.label}
              </Link>
            ) : null}
            <Link className={styles.link} href="/per-professionisti">
              Per i professionisti
            </Link>
          </div>
        </>
      ) : (
        <p className={styles.lead} role="status">
          Un momento…
        </p>
      )}
    </div>
  );
}

export default function RispondiPage() {
  return (
    <Suspense fallback={null}>
      <RispondiContent />
    </Suspense>
  );
}
