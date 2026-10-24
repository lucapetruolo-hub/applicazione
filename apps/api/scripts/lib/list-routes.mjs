// Rotte dell'API lette dai metadati di Nest (docs/CHANGELOG.md §293, §297):
// usate dall'elenco delle rotte e dal test dei permessi nella CI.
import "reflect-metadata";
import { ModulesContainer } from "@nestjs/core";

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD", "SEARCH"];

/** `app`: un'app Nest già creata (anche con `preview: true`). */
export function listRoutes(app) {
  const routes = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller) continue;
      const base = [Reflect.getMetadata("path", controller)].flat().filter((p) => p !== undefined)[0] ?? "";
      const classGuards = (Reflect.getMetadata("__guards__", controller) ?? []).map((g) => g.name);
      const classScope = Reflect.getMetadata("adminScope", controller);
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (name === "constructor" || typeof handler !== "function") continue;
        const path = Reflect.getMetadata("path", handler);
        const method = Reflect.getMetadata("method", handler);
        if (path === undefined || method === undefined) continue;
        const guards = [...classGuards, ...(Reflect.getMetadata("__guards__", handler) ?? []).map((g) => g.name)];
        const throttle = Reflect.getMetadata("THROTTLER:LIMITdefault", handler) ?? Reflect.getMetadata("THROTTLER:LIMITdefault", controller);
        const skipThrottle = Reflect.getMetadata("THROTTLER:SKIPdefault", handler) === true;
        const sse = Reflect.getMetadata("__sse__", handler) === true;
        const full = `/${[base, path].flat().filter(Boolean).join("/")}`.replace(/\/+/g, "/").replace(/(.)\/$/, "$1");
        routes.push({
          method: sse ? "SSE" : METHODS[method],
          httpMethod: METHODS[method],
          path: full,
          controller: controller.name,
          handler: name,
          guards,
          adminScope: Reflect.getMetadata("adminScope", handler) ?? classScope ?? (guards.includes("AdminGuard") ? "ANY (implicito)" : null),
          throttlePerMinute: skipThrottle ? "nessuno" : (throttle ?? 60),
        });
      }
    }
  }
  return routes.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
}
