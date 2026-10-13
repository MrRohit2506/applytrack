import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true, // CLIENT_ORIGIN on the server expects exactly this origin
      proxy: {
        // Same-origin in dev: cookies "just work". The browser's Origin header stays
        // http://localhost:5173, which the server's CSRF origin check allows.
        "/api": { target: env.VITE_DEV_API_TARGET || "http://localhost:5000", changeOrigin: true },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.js",
      css: false,
    },
  };
});
