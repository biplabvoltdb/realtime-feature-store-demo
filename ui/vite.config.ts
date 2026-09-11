import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Repository source files (ddl.sql, queries.sql, Java procedures, config, scripts, README)
// are imported with `?raw` from the parent project so the console shows the real text.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.BFF_URL ?? "http://127.0.0.1:8787", changeOrigin: false } },
    fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] },
  },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 1200 },
});
