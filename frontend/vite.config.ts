import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// RENDER-ready Vite config: the previous manus.computer preview hosts are
// removed; only local dev/preview hosts are allowed. Render deploys the
// compiled bundle via FastAPI (see Dockerfile + web/app.py), so Vite's
// preview server is only used for local development.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  publicDir: path.resolve(__dirname, "client/public"),
  server: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 5173),
    strictPort: false,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      // Render preview host pattern (used only in dev/preview; the production
      // build is served by FastAPI, not by Vite preview).
      "*.onrender.com",
    ],
  },
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 4173),
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      // P1-cleanup (INSPECT-FRONTEND F-HIGH-24): removed stale manus.computer preview host.
      "*.onrender.com",
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: 'hidden',  // P1-cleanup: emit hidden source maps for Sentry — not referenced in HTML.
    chunkSizeWarningLimit: 1536,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split heavy vendors into dedicated chunks so the initial app
          // chunk stays small. The chat box (Streamdown) is already lazy
          // loaded; the chunks below capture the rest of the heavy deps.
          if (id.includes("node_modules")) {
            // 3D rendering (three.js + react-three-fiber + drei) — only
            // consumed by MechanicalTwinViewport and similar 3D views.
            if (id.includes("/three/") || id.includes("@react-three/")) {
              return "vendor-three";
            }
            // Streamdown + shiki/mermaid/cytoscape markdown rendering.
            if (id.includes("/streamdown/") || id.includes("/shiki/") || id.includes("/mermaid/") || id.includes("/cytoscape/")) {
              return "vendor-markdown";
            }
            // HLS video player — only consumed by Home stream view.
            if (id.includes("/hls.js/")) {
              return "vendor-hls";
            }
            // Recharts + framer-motion + Radix primitives are heavy but
            // widely used across the app — keep them in a shared vendor chunk.
            if (id.includes("/recharts/") || id.includes("/framer-motion/")) {
              return "vendor-ui";
            }
            if (id.includes("/@radix-ui/")) {
              return "vendor-radix";
            }
            if (id.includes("/@tanstack/") || id.includes("/@trpc/")) {
              return "vendor-data";
            }
          }
          return undefined;
        },
      },
    },
  },
});
