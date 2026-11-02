import { test } from "node:test";
import assert from "node:assert/strict";
import { sameTimeBooking } from "./sameTimeBooking";

const marco = {
  businessName: "Idraulica Marco",
  scheduledAt: "2026-10-31T07:00:00Z",
  scheduledEndAt: "2026-10-31T12:00:00Z",
};

test("sameTimeBooking (collaudo I-11): trova l'appuntamento nella stessa fascia", () => {
  assert.equal(
    sameTimeBooking(
      { start: "2026-10-31T07:00:00Z", end: "2026-10-31T12:00:00Z" },
      [marco],
    ),
    marco,
  );
  assert.equal(
    sameTimeBooking({ start: "2026-10-31T11:00:00Z", end: null }, [marco]),
    marco,
  );
});

test("sameTimeBooking: fasce che si toccano soltanto o altri giorni non contano", () => {
  assert.equal(
    sameTimeBooking(
      { start: "2026-10-31T12:00:00Z", end: "2026-10-31T14:00:00Z" },
      [marco],
    ),
    null,
  );
  assert.equal(
    sameTimeBooking({ start: "2026-11-01T07:00:00Z", end: null }, [marco]),
    null,
  );
});
