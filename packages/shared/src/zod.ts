import { z } from "zod";

/**
 * zod 4 con i messaggi d'errore predefiniti di zod 3 (docs/CHANGELOG.md
 * §312). Quasi tutti gli schemi hanno un messaggio in italiano, ma dove manca
 * il sito mostra quello predefinito di zod ("Required", "Invalid email", ...):
 * zod 4 li ha riscritti tutti, quindi qui si rimettono quelli di prima, così
 * l'aggiornamento non cambia nulla di quello che vede l'utente. I messaggi
 * scritti negli schemi vengono sempre prima di questi.
 *
 * La configurazione è globale (una sola copia di zod nel monorepo): vale anche
 * per gli schemi scritti in `apps/api`, che caricano sempre questo pacchetto.
 * `index.ts` importa questo file per primo, così la configurazione è attiva
 * prima di qualunque validazione. Gli schemi importano `z` direttamente da
 * "zod", non da qui: ripassato da questo file, webpack non riesce più a
 * togliere dal sito le parti di zod che non usa (tutte le lingue dei
 * messaggi, JSON Schema, ~420 KB nel browser).
 *
 * Per gli ID si usa `z.guid()`, non `.uuid()`: zod 4 con `.uuid()` accetta
 * solo UUID con una versione valida, zod 3 qualunque stringa nel formato.
 */

type Issue = z.core.$ZodRawIssue;

/** Il nome del tipo ricevuto, come lo scriveva zod 3 (`getParsedType`). */
function parsedType(input: unknown): string {
  switch (typeof input) {
    case "undefined":
    case "string":
    case "boolean":
    case "function":
    case "bigint":
    case "symbol":
      return typeof input;
    case "number":
      return Number.isNaN(input) ? "nan" : "number";
    case "object":
      if (Array.isArray(input)) return "array";
      if (input === null) return "null";
      if (typeof (input as { then?: unknown }).then === "function" && typeof (input as { catch?: unknown }).catch === "function") return "promise";
      if (input instanceof Map) return "map";
      if (input instanceof Set) return "set";
      if (input instanceof Date) return "date";
      return "object";
    default:
      return "unknown";
  }
}

/** `util.joinValues` di zod 3: le stringhe tra apici, separate da " | ". */
function joinValues(values: readonly unknown[], separator = " | "): string {
  return values.map((value) => (typeof value === "string" ? `'${value}'` : String(value))).join(separator);
}

function invalidType(expected: string, input: unknown): string {
  return input === undefined ? "Required" : `Expected ${expected}, received ${parsedType(input)}`;
}

/** I nomi di formato di zod 4 con il nome che usava zod 3 in "Invalid <nome>". */
const FORMAT_NAMES: Record<string, string> = { guid: "uuid", uuidv4: "uuid", uuidv6: "uuid", uuidv7: "uuid", ipv4: "ip", ipv6: "ip", json_string: "json" };

function comparison(exact: boolean | undefined, inclusive: boolean | undefined, words: [exact: string, inclusive: string, strict: string]): string {
  return exact ? words[0] : inclusive ? words[1] : words[2];
}

export function zod3Message(issue: Issue): string | undefined {
  switch (issue.code) {
    case "invalid_type": {
      // `.int()` su un numero con la virgola: zod 3 lo segnalava come tipo sbagliato.
      if (issue.expected === "int") return typeof issue.input === "number" && !Number.isNaN(issue.input) ? "Expected integer, received float" : invalidType("number", issue.input);
      return invalidType(issue.expected, issue.input);
    }
    case "invalid_value": {
      const def = issue.inst?._zod.def;
      const kind = def && "type" in def ? def.type : undefined;
      if (kind === "enum") {
        // zod 3 controllava prima il tipo: un valore non di testo era un "tipo sbagliato".
        if (typeof issue.input !== "string") return invalidType(joinValues(issue.values), issue.input);
        return `Invalid enum value. Expected ${joinValues(issue.values)}, received '${String(issue.input)}'`;
      }
      const expected = issue.values.length === 1 ? issue.values[0] : issue.values;
      return `Invalid literal value, expected ${JSON.stringify(expected, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value))}`;
    }
    case "unrecognized_keys":
      return `Unrecognized key(s) in object: ${joinValues(issue.keys, ", ")}`;
    case "invalid_union":
      return "Invalid input";
    case "invalid_format": {
      if (issue.format === "regex") return "Invalid";
      if (issue.format === "starts_with") return `Invalid input: must start with "${String(issue.prefix)}"`;
      if (issue.format === "ends_with") return `Invalid input: must end with "${String(issue.suffix)}"`;
      if (issue.format === "includes") return `Invalid input: must include "${String(issue.includes)}"`;
      return `Invalid ${FORMAT_NAMES[issue.format] ?? issue.format}`;
    }
    case "too_small": {
      const { exact, inclusive, minimum } = issue;
      switch (issue.origin) {
        case "array":
        case "set":
          return `Array must contain ${comparison(exact, inclusive, ["exactly", "at least", "more than"])} ${String(minimum)} element(s)`;
        case "string":
          return `String must contain ${comparison(exact, inclusive, ["exactly", "at least", "over"])} ${String(minimum)} character(s)`;
        case "number":
        case "int":
        case "bigint":
          return `Number must be ${comparison(exact, inclusive, ["exactly equal to ", "greater than or equal to ", "greater than "])}${String(minimum)}`;
        case "date":
          return `Date must be ${comparison(exact, inclusive, ["exactly equal to ", "greater than or equal to ", "greater than "])}${String(new Date(Number(minimum)))}`;
        default:
          return "Invalid input";
      }
    }
    case "too_big": {
      const { exact, inclusive, maximum } = issue;
      switch (issue.origin) {
        case "array":
        case "set":
          return `Array must contain ${comparison(exact, inclusive, ["exactly", "at most", "less than"])} ${String(maximum)} element(s)`;
        case "string":
          return `String must contain ${comparison(exact, inclusive, ["exactly", "at most", "under"])} ${String(maximum)} character(s)`;
        case "number":
        case "int":
          return `Number must be ${comparison(exact, inclusive, ["exactly", "less than or equal to", "less than"])} ${String(maximum)}`;
        case "bigint":
          return `BigInt must be ${comparison(exact, inclusive, ["exactly", "less than or equal to", "less than"])} ${String(maximum)}`;
        case "date":
          return `Date must be ${comparison(exact, inclusive, ["exactly", "smaller than or equal to", "smaller than"])} ${String(new Date(Number(maximum)))}`;
        default:
          return "Invalid input";
      }
    }
    case "not_multiple_of":
      return `Number must be a multiple of ${String(issue.divisor)}`;
    case "custom":
      return "Invalid input";
    default:
      return "Invalid input";
  }
}

z.config({ customError: zod3Message });
