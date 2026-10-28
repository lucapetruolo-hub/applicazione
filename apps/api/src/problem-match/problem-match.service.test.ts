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

// OpenRouter fino al lancio, al posto della chiave di Anthropic (docs/CHANGELOG.md §394).
describe("ProblemMatchService con OpenRouter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const reply = (content: unknown, status = 200) =>
    vi.fn().mockResolvedValue({ ok: status === 200, status, text: () => Promise.resolve(""), json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(content) } }] }) });

  it("senza chiave Anthropic usa OpenRouter, con Haiku solo i server di Anthropic", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    vi.stubEnv("OPENROUTER_MODEL", "anthropic/claude-haiku-5.5");
    const fetchMock = reply({ categories: ["idraulico", "muratore", "imbianchino", "falegname"], outOfService: null, notAJob: false, reason: "Lo sistema l'idraulico." });
    vi.stubGlobal("fetch", fetchMock);
    const service = newService();
    const result = await service.match("c'è una macchia strana sul soffitto del bagno");
    expect(result.source).toBe("ia");
    expect(result.categories).toEqual(["idraulico", "muratore", "imbianchino"]);
    const [url, init] = fetchMock.mock.calls[0]! as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer or-test");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("anthropic/claude-haiku-5.5");
    expect(body.provider).toMatchObject({ only: ["anthropic"], allow_fallbacks: false, data_collection: "deny" });
  });

  // Senza credito su OpenRouter (docs/changelog/2026-10-28-ia-gratuita-fino-al-lancio.md).
  it("di base usa il modello gratuito, senza i vincoli di Anthropic, e accetta il JSON tra ```", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    vi.stubEnv("OPENROUTER_MODEL", "");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '```json\n{"categories":["idraulico"],"outOfService":null,"notAJob":false,"reason":"Lo sistema l\'idraulico."}\n```' } }],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await newService().match("c'è una macchia strana sul soffitto del bagno");
    expect(result.source).toBe("ia");
    expect(result.categories).toEqual(["idraulico"]);
    const body = JSON.parse((fetchMock.mock.calls[0]! as [string, { body: string }])[1].body);
    expect(body.model).toBe("google/gemma-4-31b-it:free");
    expect(body.models).toEqual(["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3.5-super-vl:free"]);
    expect(body.provider).toBeUndefined();
  });

  it("con entrambe le chiavi vince Anthropic", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const service = newService();
    const callClaude = vi.spyOn(service as unknown as { callClaude: (text: string) => Promise<unknown> }, "callClaude").mockResolvedValue(aiAnswer());
    await service.match("c'è una macchia strana sul soffitto del bagno");
    expect(callClaude).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("una risposta sbagliata o una chiave rifiutata lasciano il dizionario", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "or-test");
    vi.stubGlobal("fetch", reply({}, 401));
    expect((await newService().match("c'è una macchia strana sul soffitto del bagno")).source).toBe("dizionario");
    vi.stubGlobal("fetch", reply({ categories: ["astronauta"], outOfService: null, notAJob: false, reason: "" }));
    expect((await newService().match("c'è una macchia strana sul soffitto del bagno")).source).toBe("dizionario");
  });
});
