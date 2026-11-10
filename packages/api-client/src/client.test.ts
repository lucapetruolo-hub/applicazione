import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createApiClient } from "./client";

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
  await assert.rejects(answer(new Response(body, { status: 200 })).me("token"), TypeError);
});

test("errore dell'API: ApiError con il messaggio del server", async () => {
  const client = answer(new Response(JSON.stringify({ message: "Non autorizzato" }), { status: 401 }));
  await assert.rejects(client.me("token"), (err: Error & { status?: number }) => err.message === "Non autorizzato" && err.status === 401);
});
