import { afterEach, describe, expect, it, vi } from "vitest";
import { ProblemMatchService, anonymizeProblemText } from "./problem-match.service";

function fakePrisma(words: { word: string; categorySlug: string | null; outOfService: string | null }[] = []) {
  return {
    problemWord: { findMany: vi.fn().mockResolvedValue(words) },
    problemDescription: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn() },
  };
}
const newService = (words?: Parameters<typeof fakePrisma>[0]) => new ProblemMatchService(fakePrisma(words) as never);

const aiAnswer = (overrides: Partial<{ categories: string[]; outOfService: string | null; notAJob: boolean; reason: string }> = {}) =>
  ({ categories: ["idraulico"], outOfService: null, notAJob: false, reason: "Lo sistema l'idraulico.", ...overrides }) as never;

describe("ProblemMatchService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("quando il dizionario è sicuro non chiama l'intelligenza artificiale", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const service = newService();
    service.askAi = vi.fn();
    const result = await service.match("perdita dal rubinetto del lavandino");
    expect(result).toMatchObject({ categories: ["idraulico"], source: "dizionario" });
    expect(service.askAi).not.toHaveBeenCalled();
  });

  it("senza ANTHROPIC_API_KEY resta il dizionario anche nel dubbio", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const service = newService();
    service.askAi = vi.fn();
    const result = await service.match("macchia di umido sul soffitto");
    expect(result.source).toBe("dizionario");
    expect(result.question?.id).toBe("macchia");
    expect(service.askAi).not.toHaveBeenCalled();
  });

  it("nel dubbio chiede all'intelligenza artificiale e tiene la domanda se il mestiere è tra le risposte", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const service = newService();
    service.askAi = vi.fn().mockResolvedValue(aiAnswer());
    const result = await service.match("macchia di umido sul soffitto");
    expect(result).toMatchObject({ categories: ["idraulico"], source: "ia", reason: "Lo sistema l'idraulico." });
    expect(result.question?.id).toBe("macchia");
  });

  it("se l'intelligenza artificiale non risponde resta il dizionario", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const service = newService();
    service.askAi = vi.fn().mockResolvedValue(null);
    expect((await service.match("macchia di umido sul soffitto")).source).toBe("dizionario");
  });

  it("l'avviso di sicurezza viene sempre dal dizionario e non sparisce con un fuori servizio", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const service = newService();
    service.askAi = vi.fn().mockResolvedValue(aiAnswer({ categories: [], outOfService: "elettrodomestici" }));
    const result = await service.match("sento puzza di gas vicino al forno e non so cosa sia");
    expect(result.safety).toBe("gas");
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.outOfService).toBeNull();
  });

  it("un testo che non è un lavoro non propone mestieri", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const service = newService();
    service.askAi = vi.fn().mockResolvedValue(aiAnswer({ categories: ["idraulico"], notAJob: true, reason: "x" }));
    expect(await service.match("ciao come funziona il sito")).toMatchObject({ categories: [], outOfService: null, reason: null });
  });

  it("la stessa frase non si chiede due volte", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const service = newService();
    service.askAi = vi.fn().mockResolvedValue(aiAnswer());
    await service.match("macchia di umido sul soffitto");
    await service.match("Macchia di umido  sul soffitto");
    expect(service.askAi).toHaveBeenCalledTimes(1);
  });

  it("oltre il tetto del giorno risponde il dizionario", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubEnv("PROBLEM_MATCH_AI_DAILY_LIMIT", "0");
    const service = newService();
    service.askAi = vi.fn();
    expect((await service.match("macchia di umido sul soffitto")).source).toBe("dizionario");
    expect(service.askAi).not.toHaveBeenCalled();
  });

  it("una parola insegnata in admin vince, senza chiedere all'intelligenza artificiale", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const service = newService([{ word: "zanzarier", categorySlug: "tuttofare", outOfService: null }]);
    service.askAi = vi.fn();
    expect(await service.match("la zanzariera della camera è rotta")).toMatchObject({ categories: ["tuttofare"], source: "parola" });
    expect(service.askAi).not.toHaveBeenCalled();
  });

  it("salva la descrizione senza contatti", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const prisma = fakePrisma();
    await new ProblemMatchService(prisma as never).match("perdita dal rubinetto, chiamate 333 1234567", "Latina");
    expect(prisma.problemDescription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ text: "perdita dal rubinetto, chiamate [numero]", city: "Latina", categories: ["idraulico"] }),
    });
  });
});

describe("anonymizeProblemText", () => {
  it("toglie email, telefono, link e indirizzo", () => {
    const text = anonymizeProblemText("Perdita in via Roma 12, chiamate 333 123 4567 o mario.rossi@gmail.com, foto su https://x.it/a");
    expect(text).toBe("Perdita in [indirizzo], chiamate [numero] o [email], foto su [link]");
  });

  it("lascia le misure e i numeri brevi", () => {
    expect(anonymizeProblemText("2 stanze da 30 mq al 3 piano")).toBe("2 stanze da 30 mq al 3 piano");
  });
});
