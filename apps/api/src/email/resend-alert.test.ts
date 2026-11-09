import { describe, expect, it, vi } from "vitest";
import { resendProblemAlert } from "./email.service";

const { opsAlert } = vi.hoisted(() => ({ opsAlert: vi.fn((_key: string, _message: string) => true) }));
vi.mock("../common/ops-alert", () => ({ opsAlert }));

describe("Avviso quando Resend rifiuta le email", () => {
  it("limite del piano o troppe richieste: avviso", () => {
    expect(resendProblemAlert("daily_quota_exceeded")).toBe(true);
    expect(resendProblemAlert("rate_limit_exceeded")).toBe(true);
    expect(opsAlert.mock.calls.map((c) => c[0])).toEqual(["resend-limite", "resend-limite"]);
  });

  it("chiave sbagliata o guasto di Resend: avviso", () => {
    opsAlert.mockClear();
    expect(resendProblemAlert("invalid_api_Key")).toBe(true);
    expect(resendProblemAlert("internal_server_error")).toBe(true);
    expect(opsAlert.mock.calls.map((c) => c[0])).toEqual(["resend-guasto", "resend-guasto"]);
  });

  it("un indirizzo sbagliato non disturba nessuno", () => {
    opsAlert.mockClear();
    expect(resendProblemAlert("validation_error")).toBe(false);
    expect(resendProblemAlert(undefined)).toBe(false);
    expect(opsAlert).not.toHaveBeenCalled();
  });
});
