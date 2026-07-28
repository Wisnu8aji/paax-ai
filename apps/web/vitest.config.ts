import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
  test: {
    environment: "node",
    exclude: ["node_modules", "e2e"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
