"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

/** Parametro aggiunto all'indirizzo di ritorno dall'accesso: id del profilo da salvare appena entrati. */
const SAVE_AFTER_LOGIN_PARAM = "salva";

/**
 * Cuoricino "salva" nei risultati di ricerca (docs/CHANGELOG.md §208): una
 * sola richiesta per i profili già salvati, non una per scheda. Chi non è
 * entrato va all'accesso e torna sulla stessa ricerca con `?salva=<id>`, che
 * salva quel profilo e poi sparisce dall'indirizzo. Professionisti e admin
 * non salvano profili: per loro `canSave` è falso.
 */
export function useSavedProfessionals() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const canSave = !user || user.role === "CLIENT";

  useEffect(() => {
    if (isLoading || !token || user?.role !== "CLIENT") return;
    let cancelled = false;
    const url = new URL(window.location.href);
    const saveAfterLogin = url.searchParams.get(SAVE_AFTER_LOGIN_PARAM);
    apiClient
      .mySavedProfessionals(token)
      .then(async (saved) => {
        const ids = new Set(saved.map((p) => p.id));
        if (saveAfterLogin && !ids.has(saveAfterLogin)) {
          await apiClient.saveProfessional(token, saveAfterLogin);
          ids.add(saveAfterLogin);
        }
        if (!cancelled) setSavedIds(ids);
      })
      .catch(() => {})
      .finally(() => {
        if (!saveAfterLogin) return;
        url.searchParams.delete(SAVE_AFTER_LOGIN_PARAM);
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoading, token, user]);

  const toggleSave = useCallback(
    async (professionalId: string) => {
      if (!token) {
        const url = new URL(window.location.href);
        url.searchParams.set(SAVE_AFTER_LOGIN_PARAM, professionalId);
        router.push(`/accedi?redirect=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
        return;
      }
      const wasSaved = savedIds.has(professionalId);
      setPendingId(professionalId);
      try {
        if (wasSaved) await apiClient.unsaveProfessional(token, professionalId);
        else await apiClient.saveProfessional(token, professionalId);
        setSavedIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.delete(professionalId);
          else next.add(professionalId);
          return next;
        });
      } catch {
        // silenzioso come nel profilo: non è un'azione critica, si può riprovare
      } finally {
        setPendingId(null);
      }
    },
    [router, savedIds, token],
  );

  return { canSave, savedIds, pendingId, toggleSave };
}
