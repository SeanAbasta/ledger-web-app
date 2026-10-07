import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Served from https://<user>.github.io/ledger-web-app/
export default defineConfig({
  base: "/ledger-web-app/",
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["fake-indexeddb/auto"],
  },
});
