import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Nessuna chiamata vera a Pwned Passwords nei test (pwned-password.test.ts la simula).
    env: { PWNED_PASSWORD_CHECK: "false" },
  },
});
