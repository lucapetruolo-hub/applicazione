import { describe, expect, it, vi } from "vitest";
import { PhoneNumbersNormalizeService, phoneToNormalize } from "./phone-numbers-normalize.service";

describe("phoneToNormalize", () => {
  it("porta i numeri vecchi nel formato unico", () => {
    expect(phoneToNormalize("333 123 4567")).toBe("+39 3331234567");
    expect(phoneToNormalize("+39 333-123-4567")).toBe("+39 3331234567");
    expect(phoneToNormalize("0041 79 123 45 67")).toBe("+41 791234567");
  });

  it("lascia stare i numeri già a posto e quelli vuoti", () => {
    expect(phoneToNormalize("+39 3331234567")).toBeNull();
    expect(phoneToNormalize(null)).toBeNull();
    expect(phoneToNormalize("")).toBeNull();
  });
});

describe("PhoneNumbersNormalizeService", () => {
  it("non unisce due account con lo stesso numero scritto in modi diversi", async () => {
    const update = vi.fn();
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: "a", phone: "3331234567" },
          { id: "b", phone: "+39 3339999999" },
        ]),
        findFirst: vi.fn().mockResolvedValue({ id: "c" }),
        update,
      },
      guidedRequest: { findMany: vi.fn().mockResolvedValue([{ id: "r", recipientPhone: "333 1234567" }]), update: vi.fn() },
      booking: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn() },
    };
    await new PhoneNumbersNormalizeService(prisma as never).normalizeAll();
    expect(update).not.toHaveBeenCalled();
    expect(prisma.guidedRequest.update).toHaveBeenCalledWith({ where: { id: "r" }, data: { recipientPhone: "+39 3331234567" } });
  });
});
