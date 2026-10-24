import { describe, expect, it } from "vitest";
import { z } from "zod";
import { adminBootstrapSchema, adminRoleUpdateSchema, completeBookingSchema, startIdentityVerificationSchema, reviewSchema } from "@professionisti/shared";

/** zod 4 con i messaggi predefiniti di zod 3, che il sito mostra dove lo schema non ne ha uno suo (§324). */
function firstMessage(schema: z.ZodType, input: unknown): string | undefined {
  const result = schema.safeParse(input);
  return result.success ? undefined : result.error.issues[0]?.message;
}

describe("messaggi di zod 3 con zod 4", () => {
  it("ripete i messaggi predefiniti di zod 3", () => {
    expect(firstMessage(adminBootstrapSchema, {})).toBe("Required");
    expect(firstMessage(adminBootstrapSchema, { email: "mario@", secret: "x" })).toBe("Invalid email");
    expect(firstMessage(adminBootstrapSchema, { email: "mario@example.com", secret: "" })).toBe("String must contain at least 1 character(s)");
    expect(firstMessage(adminBootstrapSchema, { email: 42, secret: "x" })).toBe("Expected string, received number");
    expect(firstMessage(adminRoleUpdateSchema, { adminRoles: ["CAPO"] })).toBe("Invalid enum value. Expected 'SUPER' | 'MODERATOR' | 'FINANCE', received 'CAPO'");
    expect(firstMessage(adminRoleUpdateSchema, { adminRoles: [1] })).toBe("Expected 'SUPER' | 'MODERATOR' | 'FINANCE', received number");
    expect(firstMessage(z.number().int(), 1.5)).toBe("Expected integer, received float");
    expect(firstMessage(z.number().max(6), 7)).toBe("Number must be less than or equal to 6");
  });

  it("lascia passare prima i messaggi scritti negli schemi", () => {
    expect(firstMessage(startIdentityVerificationSchema, { biometricConsent: false })).toBe("Per continuare spunta il consenso al confronto del selfie.");
    const booking = completeBookingSchema.safeParse({});
    expect(booking.success ? [] : booking.error.issues.filter((i) => i.path[0] === "declarationVersion").map((i) => i.message)).toEqual(["Conferma la dichiarazione sull'importo."]);
    expect(firstMessage(completeBookingSchema.shape.declarationVersion, 5)).toBe("Expected string, received number");
  });

  it("accetta gli ID come zod 3, anche senza versione UUID", () => {
    expect(reviewSchema.shape.bookingId.safeParse("00000000-0000-0000-0000-000000000001").success).toBe(true);
    expect(firstMessage(reviewSchema.shape.bookingId, "123")).toBe("Invalid uuid");
  });
});
