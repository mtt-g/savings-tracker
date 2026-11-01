import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so tests don't start the Cloudflare plugin.
export default defineConfig({
  test: { include: ["shared/**/*.test.ts", "worker/**/*.test.ts"] },
});
