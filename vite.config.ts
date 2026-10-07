import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// Strict CSP, production build only (the dev server injects inline styles and an HMR socket).
// Add the exchange-rate host to connect-src if an online rate source is ever used.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://api.github.com",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const csp = (): Plugin => ({
  name: "ledger-csp",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
  ],
});

// Served from https://<user>.github.io/ledger-web-app/
export default defineConfig({
  base: "/ledger-web-app/",
  plugins: [react(), csp()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["fake-indexeddb/auto"],
  },
});
