"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/apiClient";
import { Icon, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { notificationCopy } from "@/lib/notificationCopy";
import { notificationDeepLink } from "@/lib/notificationSections";
import { notificationTopicStyle } from "@/lib/notificationTopicStyle";
import { SkeletonBlock } from "./Skeleton";

type HistoryItem = { id: string; type: string; payload: unknown; createdAt: string; readAt: string | null };

const SWIPE_DELETE_THRESHOLD_PX = 70;
/** Tempo per confermare "Elimina tutte" col secondo tocco. */
const DELETE_ALL_CONFIRM_MS = 4000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function groupByDay(items: HistoryItem[]): { label: string; items: HistoryItem[] }[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const groups: { label: string; items: HistoryItem[] }[] = [
    { label: "Oggi", items: [] },
    { label: "Ieri", items: [] },
    { label: "Prima", items: [] },
  ];
  for (const item of items) {
    const t = new Date(item.createdAt).getTime();
    groups[t >= startOfToday.getTime() ? 0 : t >= startOfYesterday.getTime() ? 1 : 2]!.items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

/**
 * Riga di una notifica (docs/CHANGELOG.md §316). Si elimina con la "x"
 * (sempre visibile sul telefono, al passaggio del mouse sul computer) o
 * trascinandola di lato: lo swipe segue solo i gesti chiaramente
 * orizzontali e non chiama mai `preventDefault`, così lo scorrimento
 * verticale della lista resta intatto (stesso principio di
 * `CalendarShell.tsx`).
 */
function NotificationRow({
  item,
  isProfessional,
  onOpen,
  onDelete,
}: {
  item: HistoryItem;
  isProfessional: boolean;
  onOpen: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
}) {
  const [dragX, setDragX] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);

  const copy = notificationCopy(item.type, item.payload);
  const topic = notificationTopicStyle(item.type, isProfessional);
  const isUnread = item.readAt === null;
  const destination = notificationDeepLink(item.type, item.payload);

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    draggingRef.current = false;
  }

  function handleTouchMove(e: React.TouchEvent) {
    const start = touchStartRef.current;
    const touch = e.touches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (!draggingRef.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      draggingRef.current = true;
    }
    if (draggingRef.current) setDragX(dx);
  }

  function handleTouchEnd() {
    if (draggingRef.current && Math.abs(dragX) > SWIPE_DELETE_THRESHOLD_PX) onDelete(item.id);
    setDragX(0);
    touchStartRef.current = null;
    draggingRef.current = false;
  }

  const body = (
    <>
      <span className="notif-row-icon" style={{ backgroundColor: topic.tint }} aria-hidden="true">
        <Icon name={topic.icon} size={18} color={topic.color} />
      </span>
      <span className="notif-row-text">
        <span className="notif-row-meta">
          <span className="notif-row-topic" style={{ color: topic.color }}>
            {topic.title}
          </span>
          <span className="notif-row-time">{timeAgo(item.createdAt)}</span>
          {isUnread ? <span className="notif-row-dot" aria-label="Nuova" /> : null}
        </span>
        <span className="notif-row-message">{copy.message}</span>
      </span>
    </>
  );

  return (
    <li
      className={`notif-row${isUnread ? " is-unread" : ""}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
        transition: dragX === 0 ? "transform 150ms ease" : undefined,
      }}
    >
      {destination ? (
        <button type="button" className="notif-row-main" onClick={() => onOpen(item)}>
          {body}
        </button>
      ) : (
        <div className="notif-row-main">{body}</div>
      )}
      <button type="button" className="notif-row-delete" onClick={() => onDelete(item.id)} aria-label="Elimina questa notifica">
        <Icon name="x" size={16} color={brand.grafite70} />
      </button>
    </li>
  );
}

function LoadingRows() {
  return (
    <div className="notif-loading" aria-label="Caricamento delle notifiche">
      {[0, 1, 2].map((i) => (
        <div key={i} className="notif-loading-row">
          <SkeletonBlock width={40} height={40} radius={12} />
          <div className="notif-loading-text">
            <SkeletonBlock width="40%" height={12} />
            <SkeletonBlock width="85%" height={14} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Campanella dell'intestazione e pannello delle notifiche (docs/CHANGELOG.md
 * §316): stesso sistema del resto del sito (testo a 16 px, arrotondamento
 * 12, bianco pieno con ombra leggera). Sul telefono il pannello occupa la
 * larghezza dello schermo sotto l'intestazione. Si chiude toccando fuori o
 * con Esc, e il fuoco torna sulla campanella.
 */
export function NotificationBell() {
  const { token, user, unreadCount, markNotificationsRead } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
        bellRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  useEffect(() => {
    if (!confirmDeleteAll) return;
    const timer = setTimeout(() => setConfirmDeleteAll(false), DELETE_ALL_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmDeleteAll]);

  if (!token) return null;

  async function handleToggle() {
    const next = !isOpen;
    setIsOpen(next);
    setConfirmDeleteAll(false);
    if (next) {
      setIsLoading(true);
      try {
        setHistory(await apiClient.notificationHistory(token as string));
      } catch {
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
      if (unreadCount > 0) void markNotificationsRead();
    }
  }

  function handleItemClick(item: HistoryItem) {
    setIsOpen(false);
    const destination = notificationDeepLink(item.type, item.payload);
    if (destination) router.push(destination);
  }

  async function handleDelete(id: string) {
    setHistory((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
    try {
      await apiClient.deleteNotification(token as string, id);
    } catch {
      // Operazione non critica: se fallisce, la notifica ricompare alla prossima apertura.
    }
  }

  /** Elimina tutte: il primo tocco chiede conferma, il secondo elimina. */
  async function handleDeleteAll() {
    if (!confirmDeleteAll) {
      setConfirmDeleteAll(true);
      return;
    }
    setConfirmDeleteAll(false);
    setHistory([]);
    try {
      await apiClient.deleteAllNotifications(token as string);
    } catch {
      // Come handleDelete: silenzioso, nessun blocco dell'interfaccia.
    }
  }

  const newCount = history ? history.filter((item) => item.readAt === null).length : 0;

  /** Toglie subito i pallini "Nuova" (§346); sul server sono già segnate lette all'apertura. */
  function handleMarkAllRead() {
    const now = new Date().toISOString();
    setHistory((prev) => (prev ? prev.map((item) => (item.readAt === null ? { ...item, readAt: now } : item)) : prev));
    void markNotificationsRead();
  }

  return (
    <div ref={containerRef} className="notif">
      <button
        ref={bellRef}
        type="button"
        className={`notif-bell${isOpen ? " is-open" : ""}`}
        onClick={handleToggle}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : "Notifiche"}
      >
        <Icon name="bell" size={22} color={brand.grafite} strokeWidth={1.75} />
        {unreadCount > 0 ? <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>

      {isOpen ? (
        <div ref={panelRef} className="notif-panel" role="dialog" aria-label="Notifiche" tabIndex={-1}>
          <div className="notif-head">
            <span className="notif-title">Notifiche</span>
            {newCount > 0 ? <span className="notif-new">{newCount === 1 ? "1 nuova" : `${newCount} nuove`}</span> : null}
            {newCount > 0 ? (
              <button type="button" className="notif-clear" onClick={handleMarkAllRead}>
                Segna tutte come lette
              </button>
            ) : null}
            {history && history.length > 0 ? (
              <button type="button" className={`notif-clear${confirmDeleteAll ? " is-confirm" : ""}`} onClick={handleDeleteAll}>
                {confirmDeleteAll ? "Conferma" : "Elimina tutte"}
              </button>
            ) : null}
          </div>

          <div className="notif-list">
            {isLoading ? (
              <LoadingRows />
            ) : !history || history.length === 0 ? (
              <div className="notif-empty">
                <span className="notif-empty-icon" aria-hidden="true">
                  <Icon name="bell" size={22} color={brand.grafite70} strokeWidth={1.5} />
                </span>
                <span className="notif-empty-title">Nessuna notifica</span>
                <span className="notif-empty-text">Qui arrivano richieste, preventivi e messaggi.</span>
              </div>
            ) : (
              groupByDay(history).map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h3 className="notif-group">{group.label}</h3>
                  <ul className="notif-rows">
                    {group.items.map((item) => (
                      <NotificationRow key={item.id} item={item} isProfessional={!!user?.isProfessional} onOpen={handleItemClick} onDelete={handleDelete} />
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>

          <div className="notif-foot">
            <Link href="/account/notifiche" className="notif-settings" onClick={() => setIsOpen(false)}>
              <Icon name="sliders-horizontal" size={16} color={brand.cianografiaScuro} />
              Impostazioni notifiche
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
