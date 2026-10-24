"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Navigation, Phone, Truck, Video, X } from "lucide-react";
import {
  formatAppointmentDate,
  formatAppointmentTime,
  formatAppointmentTimeRange,
  formatBookingAddress,
  formatJobDays,
  jobOccurrenceOn,
  navigateUrl,
  wallClockNow,
  wallClockToday,
  type ProfessionalBooking,
} from "@professionisti/shared";
import { agendaPaymentLine } from "@/lib/agendaPayment";

const STATUS_PILL: Record<ProfessionalBooking["status"], { label: string; tone: string }> = {
  PENDING: { label: "Da confermare", tone: "brass" },
  CONFIRMED: { label: "Confermato", tone: "green" },
  COMPLETED: { label: "Completato", tone: "teal" },
  CANCELED: { label: "Annullato", tone: "red" },
  NO_SHOW: { label: "Cliente assente", tone: "red" },
};

/**
 * Riquadro di un appuntamento (docs/CHANGELOG.md §288): pannello laterale su
 * computer, a tutto schermo su telefono. Solo quello che serve mentre si è
 * in giro (decisione dell'utente): chi, quando, dove, una riga sul
 * pagamento, Naviga / Sto arrivando / Chiama. Tutto il resto (voci del
 * preventivo, descrizione, foto) sta nella richiesta completa, a un tocco.
 */
export function AppointmentPanel({
  booking,
  onClose,
  onConfirm,
  onComplete,
  onCancel,
  onOnTheWay,
  onSaveNote,
  onSaveMeetingLink,
  onOpenMessages,
  isBusy,
}: {
  booking: ProfessionalBooking;
  onClose: () => void;
  onConfirm: () => void;
  onComplete: () => void;
  onCancel: () => void;
  onOnTheWay: () => Promise<void>;
  onSaveNote: (note: string) => Promise<void>;
  onSaveMeetingLink: (link: string) => Promise<void>;
  onOpenMessages?: () => void;
  isBusy: boolean;
}) {
  const [noteDraft, setNoteDraft] = useState(booking.professionalNote ?? "");
  const [linkDraft, setLinkDraft] = useState(booking.meetingLink ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [sendingOnTheWay, setSendingOnTheWay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [noteDraft]);

  const name = [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") || booking.clientName || "Cliente";
  const phone = booking.recipientPhone ?? booking.clientPhone;
  const address = formatBookingAddress(booking) ?? booking.address;
  const navigateTo = booking.street && booking.houseNumber ? `${booking.street} ${booking.houseNumber}, ${[booking.postalCode, booking.city].filter(Boolean).join(" ")}` : address;
  const online = booking.serviceMode === "ONLINE";
  const isOpen = booking.status === "PENDING" || booking.status === "CONFIRMED";
  // Anche un giorno in mezzo a un lavoro su più giorni (§293).
  const isToday = jobOccurrenceOn(booking.scheduledAt, booking.scheduledEndAt, wallClockToday().toISOString().slice(0, 10)) !== null;
  const pill = STATUS_PILL[booking.status];
  const payment = agendaPaymentLine(booking);
  const kindLabel = [online ? "Online" : booking.serviceMode === "HOME" ? "A domicilio" : null, booking.categoryLabel].filter(Boolean).join(" · ");

  async function run(action: () => Promise<void>, setBusy: (v: boolean) => void) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non è andata, riprova.");
    } finally {
      setBusy(false);
    }
  }

  const jobDays = formatJobDays(booking.scheduledAt, booking.scheduledEndAt);

  return (
    <>
      <div className="ag-scrim" onClick={onClose} aria-hidden />
      <aside className="ag-sheet" role="dialog" aria-modal="true" aria-label={`Appuntamento con ${name}`}>
        <div className="ag-sheet-top">
          <span className={`ag-pill ${pill.tone}`}>{pill.label}</span>
          {kindLabel ? <span className="ag-pill">{kindLabel}</span> : null}
          <button ref={closeRef} type="button" className="ag-icon-btn" onClick={onClose} aria-label="Chiudi">
            <X size={18} aria-hidden />
          </button>
        </div>
        <h2>{name}</h2>
        {jobDays ? (
          // Lavoro su più giorni (docs/CHANGELOG.md §293).
          <p style={{ fontSize: 14.5, marginTop: 4 }}>
            {jobDays.charAt(0).toUpperCase()}
            {jobDays.slice(1)} · ogni giorno {formatAppointmentTimeRange(booking.scheduledAt, booking.scheduledEndAt)}
          </p>
        ) : (
          <p style={{ fontSize: 14.5, marginTop: 4, textTransform: "capitalize" }}>
            {formatAppointmentDate(booking.scheduledAt, { weekday: "long", day: "numeric", month: "long" })} · {formatAppointmentTimeRange(booking.scheduledAt, booking.scheduledEndAt)}
          </p>
        )}
        {!online && address ? (
          <p className="ag-muted" style={{ fontSize: 14, marginTop: 4 }}>
            {address}
          </p>
        ) : null}

        {isOpen ? (
          <div className="ag-actions">
            {online ? (
              booking.meetingLink ? (
                <a className="ag-btn sm primary" href={booking.meetingLink} target="_blank" rel="noreferrer">
                  <Video size={16} aria-hidden /> Videochiamata
                </a>
              ) : null
            ) : navigateTo ? (
              <a className="ag-btn sm primary" href={navigateUrl(navigateTo)} target="_blank" rel="noreferrer">
                <Navigation size={16} aria-hidden /> Naviga
              </a>
            ) : null}
            {booking.status === "CONFIRMED" && isToday && !online ? (
              booking.onTheWayAt ? (
                <span className="ag-btn sm done" aria-live="polite">
                  <Check size={16} aria-hidden /> Avvisato alle {formatAppointmentTime(wallClockNow(new Date(booking.onTheWayAt)))}
                </span>
              ) : (
                <button type="button" className="ag-btn sm" disabled={sendingOnTheWay} onClick={() => run(onOnTheWay, setSendingOnTheWay)}>
                  <Truck size={16} aria-hidden /> {sendingOnTheWay ? "Invio..." : "Sto arrivando"}
                </button>
              )
            ) : null}
            {phone ? (
              <a className="ag-btn sm" href={`tel:${phone.replace(/\s+/g, "")}`}>
                <Phone size={16} aria-hidden /> Chiama
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="ag-sec">
          <h3>Pagamento</h3>
          <div className={`ag-pay${payment.paid ? " paid" : ""}`}>
            <div>
              <b>{payment.title}</b>
              <span>{payment.detail}</span>
            </div>
            {payment.amount ? <div className="amt">{payment.amount}</div> : null}
          </div>
        </div>

        {online && isOpen ? (
          <div className="ag-sec">
            <h3>Link della videochiamata · lo vede il cliente</h3>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="ag-input"
                style={{ flex: 1 }}
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                placeholder="https://meet.google.com/..."
                aria-label="Link della videochiamata"
              />
              {linkDraft !== (booking.meetingLink ?? "") ? (
                <button type="button" className="ag-btn sm" disabled={savingLink} onClick={() => run(() => onSaveMeetingLink(linkDraft), setSavingLink)}>
                  {savingLink ? "Salvo..." : "Salva"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="ag-sec">
          <h3>Le tue note · solo per te</h3>
          <textarea
            ref={noteRef}
            className="ag-note"
            rows={2}
            maxLength={2000}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Es. portare il ricambio, citofono guasto"
            aria-label="Note personali"
          />
          {noteDraft !== (booking.professionalNote ?? "") ? (
            <button type="button" className="ag-btn sm" style={{ marginTop: 8 }} disabled={savingNote} onClick={() => run(() => onSaveNote(noteDraft), setSavingNote)}>
              {savingNote ? "Salvo..." : "Salva nota"}
            </button>
          ) : null}
        </div>

        <div className="ag-sec">
          {booking.guidedRequestId ? (
            <Link className="ag-btn" style={{ width: "100%" }} href={`/dashboard/richieste?open=${booking.guidedRequestId}`}>
              Richiesta completa
            </Link>
          ) : null}
          {onOpenMessages ? (
            <div className="ag-links" style={{ marginTop: 14 }}>
              <button type="button" className="ag-link" onClick={onOpenMessages}>
                Messaggi e cronologia
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="ag-banner error" role="alert" style={{ marginTop: 16, marginBottom: 0 }}>
            {error}
          </div>
        ) : null}

        {isOpen ? (
          <div className="ag-actions" style={{ marginTop: 20 }}>
            {booking.status === "PENDING" ? (
              <button type="button" className="ag-btn primary" disabled={isBusy} onClick={onConfirm}>
                Conferma
              </button>
            ) : (
              <button type="button" className="ag-btn primary" disabled={isBusy} onClick={onComplete}>
                Lavoro completato
              </button>
            )}
            <button type="button" className="ag-btn danger" disabled={isBusy} onClick={onCancel}>
              Annulla
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}

