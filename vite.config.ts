import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const previewApiTarget =
    env.VITE_PREVIEW_API_TARGET || "https://a.kopiano.cc";

  return {
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 3000,
    strictPort: true,
    host: host || false,
    // hmr: host
    //   ? {
    //       protocol: "ws",
    //       host,
    //       port: 3000,
    //     }
    //   : undefined,
    // watch: {
    //   // 3. tell Vite to ignore watching `src-tauri`
    //   ignored: ["**/src-tauri/**"],
    // },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
  },
  };
});
