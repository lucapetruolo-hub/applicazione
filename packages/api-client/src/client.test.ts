import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError, createApiClient, isNetworkError, NETWORK_ERROR_MESSAGE, PAYMENT_NETWORK_ERROR_MESSAGE, ACCEPT_NETWORK_ERROR_MESSAGE, retryOnNetworkError } from "./client";

/**
 * Lettura della risposta (docs/changelog/2026-11-10-accesso-perso-cambiando-pagina.md):
 * una lettura interrotta non deve diventare `null`, che per `/auth/me`
 * vuol dire "accesso non più valido" e fa uscire dall'account.
 */
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function answer(response: Response) {
  globalThis.fetch = (async () => response) as typeof fetch;
  return createApiClient({ baseUrl: "http://api.test" });
}

test("corpo vuoto (account eliminato): null, come prima", async () => {
  assert.equal(await answer(new Response(null, { status: 200 })).me("token"), null);
});

test("utente arrivato: lo restituisce", async () => {
  const me = await answer(new Response(JSON.stringify({ id: "u1" }), { status: 200 })).me("token");
  assert.deepEqual(me, { id: "u1" });
});

test("lettura interrotta cambiando pagina: errore di rete, non null", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"id":'));
      controller.error(new TypeError("network error"));
    },
  });
  // Dal 19/11 è un ApiError di rete con la frase italiana, mai il TypeError del browser.
  await assert.rejects(answer(new Response(body, { status: 200 })).me("token"), (err: unknown) => isNetworkError(err));
});

test("errore dell'API: ApiError con il messaggio del server", async () => {
  const client = answer(new Response(JSON.stringify({ message: "Non autorizzato" }), { status: 401 }));
  await assert.rejects(client.me("token"), (err: Error & { status?: number }) => err.message === "Non autorizzato" && err.status === 401);
});

/**
 * Rete caduta (docs/changelog/2026-11-19-errore-di-rete-in-italiano.md): la
 * persona non deve mai leggere "Failed to fetch", il messaggio inglese del browser.
 */
function offline(calls?: { count: number }) {
  globalThis.fetch = (async () => {
    if (calls) calls.count++;
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  return createApiClient({ baseUrl: "http://api.test" });
}

test("registrazione senza rete: frase italiana, nessun Failed to fetch, un solo invio", async () => {
  const calls = { count: 0 };
  await assert.rejects(offline(calls).register("a@b.it", "Password1!", undefined, "CLIENT", true, true), (err: unknown) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.message, NETWORK_ERROR_MESSAGE);
    assert.equal(err.status, 0);
    assert.doesNotMatch(err.message, /fetch/i);
    return true;
  });
  // Le scritture non si ripetono da sole nel client: lo decide la pagina.
  assert.equal(calls.count, 1);
});

test("pagamento senza rete: dice che nessun pagamento è partito", async () => {
  await assert.rejects(offline().jobPaymentCheckout("t", "b1", "deposit"), (err: unknown) => err instanceof ApiError && err.message === PAYMENT_NETWORK_ERROR_MESSAGE && isNetworkError(err));
  await assert.rejects(offline().createSubscriptionCheckout("t", "BASE"), (err: unknown) => err instanceof ApiError && err.message === PAYMENT_NETWORK_ERROR_MESSAGE);
});

test("accettazione senza rete: si ricontrolla se è andata", async () => {
  await assert.rejects(offline().acceptQuote("t", "q1", "DIRECT"), (err: unknown) => err instanceof ApiError && err.message === ACCEPT_NETWORK_ERROR_MESSAGE);
});

test("annullamento voluto: resta AbortError, non errore di rete", async () => {
  globalThis.fetch = (async () => {
    throw new DOMException("Annullato", "AbortError");
  }) as typeof fetch;
  await assert.rejects(createApiClient({ baseUrl: "http://api.test" }).register("a@b.it", "Password1!", undefined, "CLIENT", true, true), (err: unknown) => err instanceof DOMException && err.name === "AbortError");
});

test("retryOnNetworkError: riprova una volta solo per la rete", async () => {
  let tries = 0;
  const value = await retryOnNetworkError(async () => {
    tries++;
    if (tries === 1) throw new ApiError(NETWORK_ERROR_MESSAGE, 0, "NETWORK");
    return "ok";
  }, 1);
  assert.equal(value, "ok");
  assert.equal(tries, 2);

  let others = 0;
  await assert.rejects(
    retryOnNetworkError(async () => {
      others++;
      throw new ApiError("Password errata", 401);
    }, 1),
  );
  assert.equal(others, 1);
});
