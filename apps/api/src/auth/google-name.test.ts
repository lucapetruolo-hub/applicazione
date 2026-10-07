import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";
import { googleNameFields, googleNameRepair } from "./google-name";

const mario = { name: "Mario De Luca", given_name: "Mario", family_name: "De Luca" };

describe("googleNameFields", () => {
  it("separa nome e cognome come li fornisce Google", () => {
    expect(googleNameFields(mario)).toEqual({ name: "Mario", surname: "De Luca" });
  });

  it("nome doppio: resta tutto nel nome", () => {
    expect(googleNameFields({ name: "Maria Grazia Rossi", given_name: "Maria Grazia", family_name: "Rossi" })).toEqual({
      name: "Maria Grazia",
      surname: "Rossi",
    });
  });

  it("account Google senza cognome", () => {
    expect(googleNameFields({ name: "Mario", given_name: "Mario" })).toEqual({ name: "Mario", surname: null });
  });

  it("senza given_name ricade sul nome completo", () => {
    expect(googleNameFields({ name: "Mario Rossi" })).toEqual({ name: "Mario Rossi", surname: null });
  });
});

describe("googleNameRepair", () => {
  it("corregge un account con nome e cognome nel nome", () => {
    expect(googleNameRepair({ name: "Mario De Luca", surname: null }, mario)).toEqual({ name: "Mario", surname: "De Luca" });
  });

  it("compila un account senza nome", () => {
    expect(googleNameRepair({ name: null, surname: null }, mario)).toEqual({ name: "Mario", surname: "De Luca" });
  });

  it("non tocca un cognome già presente", () => {
    expect(googleNameRepair({ name: "Mario De Luca", surname: "Rossi" }, mario)).toBeNull();
  });

  it("non tocca un nome modificato dall'utente", () => {
    expect(googleNameRepair({ name: "Marione", surname: null }, mario)).toBeNull();
  });
});

describe("AuthService.verifyGoogleToken — campi del nuovo account", () => {
  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
  });

  function setup(existingUser: Record<string, unknown> | null) {
    process.env.GOOGLE_CLIENT_ID = "client-id";
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(existingUser),
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: "u-1", ...data })),
        update: vi.fn().mockResolvedValue({}),
      },
      professionalProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const jwt = { sign: vi.fn().mockReturnValue("jwt") };
    const cloudinary = { uploadImageFromUrl: vi.fn().mockResolvedValue("https://res.cloudinary.com/demo/foto.jpg") };
    const emailService = { send: vi.fn().mockResolvedValue(true) };
    const service = new AuthService(prisma as never, jwt as never, {} as never, emailService as never, cloudinary as never);
    const googleClient = (service as unknown as { googleClient: { verifyIdToken: unknown } }).googleClient;
    googleClient.verifyIdToken = vi.fn().mockResolvedValue({
      getPayload: () => ({ sub: "g-1", email: "mario@esempio.it", picture: "https://lh3.googleusercontent.com/a/foto", ...mario }),
    });
    return { service, prisma, cloudinary, emailService };
  }

  it.each(["CLIENT", "PROFESSIONAL"] as const)("registrazione %s: nome, cognome, foto ed email confermata", async (role) => {
    const { service, prisma } = setup(null);
    await service.verifyGoogleToken("token", role, true, { acceptedLegalTerms: true, declaredAdult: true });
    const data = prisma.user.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      name: "Mario",
      surname: "De Luca",
      role,
      email: "mario@esempio.it",
      imageUrl: "https://res.cloudinary.com/demo/foto.jpg",
    });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("accesso di un account vecchio: separa nome e cognome", async () => {
    const { service, prisma } = setup({
      id: "u-1",
      role: "CLIENT",
      googleId: "g-1",
      email: "mario@esempio.it",
      emailVerifiedAt: new Date(),
      name: "Mario De Luca",
      surname: null,
    });
    await service.verifyGoogleToken("token", undefined, false);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { name: "Mario", surname: "De Luca", imageUrl: "https://res.cloudinary.com/demo/foto.jpg" },
    });
  });

  it("accesso con una foto già scelta: non la sostituisce", async () => {
    const { service, prisma, cloudinary } = setup({
      id: "u-1",
      role: "CLIENT",
      googleId: "g-1",
      email: "mario@esempio.it",
      emailVerifiedAt: new Date(),
      name: "Mario",
      surname: "De Luca",
      imageUrl: "https://res.cloudinary.com/demo/mia.jpg",
    });
    await service.verifyGoogleToken("token", undefined, false);
    expect(cloudinary.uploadImageFromUrl).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("senza Cloudinary la registrazione riesce senza foto", async () => {
    const { service, prisma, cloudinary } = setup(null);
    cloudinary.uploadImageFromUrl.mockResolvedValue(null);
    await service.verifyGoogleToken("token", "CLIENT", true, { acceptedLegalTerms: true, declaredAdult: true });
    expect(prisma.user.create.mock.calls[0]?.[0].data.imageUrl).toBeNull();
  });
});
