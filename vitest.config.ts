import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Build-time constants vite.config.ts defines for the app (016).
  define: {
    __DUCKDB_VERSION__: JSON.stringify("test"),
    __APP_VERSION__: JSON.stringify("test"),
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-temp-dir.ts"],
    globals: true,
    // DuckDB-heavy tests exceed the 5s default on a busy machine or a
    // small CI runner (016 research R7).
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
