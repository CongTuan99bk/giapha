import { defineConfig } from "vitest/config";

// NFR-MAINT-01: logic lõi phải được test phủ ≥ 90%
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
