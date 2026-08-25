import { defineConfig } from "vite";

// `base` matches the GitHub Pages project path so a later `npm run build`
// deploys cleanly to https://<user>.github.io/undead-protocol/.
export default defineConfig({
  base: "/undead-protocol/",
  server: { port: 5173 },
  build: {
    // Two pages: the game, and the roadmap built from docs/ROADMAP_ITEMS.json.
    rollupOptions: {
      input: { main: "index.html", roadmap: "roadmap.html" },
    },
  },
});
