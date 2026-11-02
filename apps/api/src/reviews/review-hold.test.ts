import { describe, expect, it } from "vitest";
import { emailMailbox } from "@professionisti/shared";
import { reviewHoldReasons, type ReviewHoldInput } from "./review-hold";

const now = new Date("2026-11-02T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

function input(
  over: Partial<{
    client: Partial<ReviewHoldInput["client"]>;
    professional: Partial<ReviewHoldInput["professional"]>;
    booking: Partial<ReviewHoldInput["booking"]>;
  }> = {},
): ReviewHoldInput {
  return {
    client: {
      email: "maria@example.com",
      phones: ["3331112222"],
      addresses: [{ street: "Via Roma", houseNumber: "1", city: "Latina" }],
      createdAt: new Date(now.getTime() - 30 * DAY),
      ...over.client,
    },
    professional: {
      email: "marco@example.com",
      phones: ["3339998888"],
      addresses: [{ street: "Via Milano", houseNumber: "5", city: "Latina" }],
      ...over.professional,
    },
    booking: {
      createdAt: new Date(now.getTime() - 5 * DAY),
      scheduledAt: new Date(now.getTime() - DAY),
      scheduledEndAt: new Date(now.getTime() - DAY + 3 * 3600_000),
      paidOnline: false,
      ...over.booking,
    },
    now,
  };
}

/** Recensioni in controllo prima della pubblicazione (collaudo P-01). */
describe("reviewHoldReasons", () => {
  it("un lavoro normale si pubblica subito", () => {
    expect(reviewHoldReasons(input())).toEqual([]);
  });

  it("lo scenario del collaudo: stesso telefono e indirizzo, lavoro fissato a orario passato, cliente appena iscritto", () => {
    const reasons = reviewHoldReasons(
      input({
        client: {
          email: "lucapetruolo+collaudo-p-finto@gmail.com",
          phones: ["+39 333 999 8888"],
          addresses: [
            { street: "via milano", houseNumber: "5", city: "LATINA" },
          ],
          createdAt: new Date(now.getTime() - 3600_000),
        },
        professional: { email: "luca.petruolo@gmail.com" },
        booking: {
          createdAt: new Date(now.getTime() - 1800_000),
          scheduledAt: new Date(now.getTime() - 7 * 3600_000),
          scheduledEndAt: new Date(now.getTime() - 2 * 3600_000),
        },
      }),
    );
    expect(reasons).toEqual([
      "SAME_PHONE",
      "SAME_ADDRESS",
      "SAME_EMAIL",
      "BOOKED_AFTER_APPOINTMENT",
      "NEW_CLIENT_DIRECT",
    ]);
  });

  it("cliente appena iscritto che ha pagato online: si pubblica", () => {
    expect(
      reviewHoldReasons(
        input({
          client: { createdAt: new Date(now.getTime() - 3600_000) },
          booking: { paidOnline: true },
        }),
      ),
    ).toEqual([]);
  });

  it("un indirizzo senza civico non basta", () => {
    expect(
      reviewHoldReasons(
        input({
          client: {
            addresses: [
              { street: "Via Milano", houseNumber: null, city: "Latina" },
            ],
          },
        }),
      ),
    ).toEqual([]);
  });
});

describe("emailMailbox", () => {
  it("Gmail: punti, maiuscole e +alias sono la stessa casella", () => {
    expect(emailMailbox("Mario.Rossi+prova@GoogleMail.com")).toBe(
      "mariorossi@gmail.com",
    );
  });
  it("altri domini: conta solo il +alias", () => {
    expect(emailMailbox("mario.rossi+x@libero.it")).toBe(
      "mario.rossi@libero.it",
    );
    expect(emailMailbox("senza-chiocciola")).toBeNull();
  });
});
