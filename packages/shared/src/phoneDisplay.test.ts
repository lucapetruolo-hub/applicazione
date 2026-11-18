import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhoneForDisplay } from "./phoneCountries";

test("numero a gruppi di cifre", () => {
  assert.equal(formatPhoneForDisplay("+393334445555"), "+39 333 444 5555");
  assert.equal(formatPhoneForDisplay("3318962340"), "+39 331 896 2340");
  assert.equal(formatPhoneForDisplay("+39 0612345678"), "+39 06 1234 5678");
  assert.equal(formatPhoneForDisplay("+39 02123456"), "+39 02 123 456");
  assert.equal(formatPhoneForDisplay("+39 0773123456"), "+39 077 312 3456");
  assert.equal(formatPhoneForDisplay("+41 791234567"), "+41 791 234 567");
  assert.equal(formatPhoneForDisplay("+39 33312345678"), "+39 333 1234 5678");
  assert.equal(formatPhoneForDisplay("+39 12345"), "+39 12345");
  assert.equal(formatPhoneForDisplay(""), "");
});
