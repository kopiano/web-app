import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
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
    proxy: {
      "/api": {
        target: "https://a.kopiano.cc",
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: {
          "*": "",
        },
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            const setCookie = proxyRes.headers["set-cookie"];
            if (!setCookie) return;

            proxyRes.headers["set-cookie"] = setCookie.map((cookie) =>
              cookie
                .replace(/;\s*Secure/gi, "")
                .replace(/;\s*Domain=[^;]*/gi, "")
            );
          });
        },
      },
    },
  },
}));
