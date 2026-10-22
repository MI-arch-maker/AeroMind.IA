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
      "*.onrender.com",
    ],
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1024,
  },
});
