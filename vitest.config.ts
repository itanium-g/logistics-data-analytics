import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tests run in plain Node so they never load the Cloudflare plugin, never start
// a Worker runtime and never touch the network. SQL is exercised against the
// built-in node:sqlite engine through the same SqlDb interface D1 satisfies.
// The React plugin is present only so component markup can be rendered with
// react-dom/server for value-rendering assertions.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
