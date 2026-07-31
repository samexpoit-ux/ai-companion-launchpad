import { defineConfig } from "vitest/config";

// Unit tests only — tests/ui/* are Playwright specs run by the Playwright CLI.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
