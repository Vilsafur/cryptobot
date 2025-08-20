import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8", // ou "istanbul" si tu préfères
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
      exclude: [
        "node_modules/",
        "tests/",
        "src/migration/**",
        "src/fixtures/**",
      ],
    },
  },
});
