"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@/lib/AuthContext";

// I popup delle notifiche (ToastStack) si caricano solo quando ce n'è uno da
// mostrare: con i collegamenti di tutte le notifiche pesavano su ogni pagina,
// anche per chi visita senza account
// (docs/changelog/2026-11-09-meno-javascript-comune.md).
const ToastStack = dynamic(() => import("./ToastStack").then((module) => module.ToastStack), { ssr: false });

export function ToastStackLazy() {
  const { toasts } = useAuth();
  return toasts.length > 0 ? <ToastStack /> : null;
}
