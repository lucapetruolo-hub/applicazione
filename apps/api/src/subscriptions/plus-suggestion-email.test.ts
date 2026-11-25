import { afterEach, describe, expect, it, vi } from "vitest";
import type { MySubscription } from "@professionisti/shared";
import { notificationEmail } from "../email/templates/notification-emails";
import { SubscriptionsService } from "./subscriptions.service";

/** Email "Ti arrivano tante richieste" nei mesi gratis (docs/changelog/2026-11-25-conti-del-mese.md). */
const suggested = {
  state: "ACTIVE",
  tier: "BASE",
  pausedReason: null,
  freeMonths: { months: 3, currentMonth: 1 },
  limitsActive: true,
  checkoutAvailable: true,
  cardNeeded: false,
  limitReached: false,
  usage: { used: 1, limit: 3, requests: 5, periodStart: "2027-01-10T00:00:00Z", periodEnd: "2027-02-10T00:00:00Z" },
  upgradeQuotes: [{ tier: "PLUS", amountEurCents: 4000, until: "2027-02-10T00:00:00Z" }],
} as unknown as MySubscription;

function build(claimedCount = 1) {
  const prisma = {
    subscription: {
      findMany: vi.fn().mockResolvedValue([{ id: "s-1", professionalProfile: { userId: "u-1" } }]),
      updateMany: vi.fn().mockResolvedValue({ count: claimedCount }),
    },
  };
  const notifications = { emailOnly: vi.fn() };
  const service = new SubscriptionsService(prisma as never, notifications as never, {} as never);
  return { service, prisma, notifications };
}

afterEach(() => {
  delete process.env.LAUNCH_DATE;
  vi.restoreAllMocks();
});

describe("email Plus nei mesi gratis", () => {
  const now = new Date("2027-01-20T09:00:00Z");

  it("parte una volta, con richieste, limite e prezzo", async () => {
    process.env.LAUNCH_DATE = "2027-01-01";
    const { service, prisma, notifications } = build();
    vi.spyOn(service, "getMySubscription").mockResolvedValue(suggested);
    await service.runPlusSuggestionEmails(now);
    expect(prisma.subscription.findMany.mock.calls[0]![0].where).toMatchObject({ plan: "BASE", status: "ACTIVE", plusSuggestionEmailedAt: null });
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({ where: { id: "s-1", plusSuggestionEmailedAt: null }, data: { plusSuggestionEmailedAt: now } });
    expect(notifications.emailOnly).toHaveBeenCalledWith("u-1", "SUBSCRIPTION_PLUS_SUGGESTED", expect.objectContaining({ requests: 5, limit: 3, amountEurCents: 4000, monthlyEurCents: 5900 }));
  });

  it("niente email se la regola del riquadro dice no, se un'altra copia l'ha già segnata o prima del lancio", async () => {
    process.env.LAUNCH_DATE = "2027-01-01";
    const few = build();
    vi.spyOn(few.service, "getMySubscription").mockResolvedValue({ ...suggested, usage: { ...suggested.usage, requests: 3 } });
    await few.service.runPlusSuggestionEmails(now);
    expect(few.prisma.subscription.updateMany).not.toHaveBeenCalled();
    expect(few.notifications.emailOnly).not.toHaveBeenCalled();

    const taken = build(0);
    vi.spyOn(taken.service, "getMySubscription").mockResolvedValue(suggested);
    await taken.service.runPlusSuggestionEmails(now);
    expect(taken.notifications.emailOnly).not.toHaveBeenCalled();

    delete process.env.LAUNCH_DATE;
    const early = build();
    await early.service.runPlusSuggestionEmails(now);
    expect(early.prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it("testo dell'email: buona notizia, prezzo chiaro, link ai livelli", () => {
    const email = notificationEmail(
      "SUBSCRIPTION_PLUS_SUGGESTED",
      { requests: 5, limit: 3, until: "2027-02-10T00:00:00Z", plusJobs: 10, amountEurCents: 4000, quoteUntil: "2027-02-10T00:00:00Z", monthlyEurCents: 5900 },
      { name: "Mario" } as never,
    )!;
    expect(email.kind).toBe("notification");
    expect(email.subject).toBe("Ti arrivano tante richieste");
    expect(email.paragraphs.join(" ")).toContain("**5 richieste**");
    expect(email.paragraphs.join(" ")).toContain("€40 + IVA");
    expect(email.paragraphs.join(" ")).toContain("€59 al mese + IVA");
    expect(email.cta?.url).toMatch(/\/dashboard\/abbonamento#livelli$/);
  });
});
