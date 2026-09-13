import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The Cloudflare plugin must come after the React plugin so the SPA is built
// first and the Worker is bundled with the generated asset manifest.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
